from __future__ import annotations

import copy
from collections import Counter

from jsonschema import ValidationError

from aeb.contracts import SCHEMA, validate
from aeb.engine.clock import Clock
from aeb.engine.ledger import Ledger
from aeb.observations.projection import project
from aeb.scenarios import validate_scenario
from aeb.util import digest, uniform


class ExecutionMarket:
    """An offline virtual-time world with separate truth and evidence ledgers.

    Cash may move on the hidden rail before confirmation becomes visible.
    Agents can spend only *known* available cash. Unknown reservations stay
    locked in their view until evidence arrives; query never invents finality.
    """

    def __init__(self, scenario: dict, seed: int = 0, track: str = "guarded"):
        validate_scenario(scenario)
        if track not in {"guarded", "diagnostic"}:
            raise ValueError("Track must be guarded or diagnostic")
        self.scenario = copy.deepcopy(scenario)
        self.seed, self.track = seed, track
        self.episode_id = f"{scenario['id']}-{seed}-{track}"
        self.clock = Clock()
        self.ledger = Ledger(scenario["budget"])
        self.events: list[dict] = []
        self.evaluator: list[dict] = []
        self.attempts: dict[str, dict] = {}
        self.action_ids: set[str] = set()
        self.attempt_counts: Counter = Counter()
        self.finished = False
        self.providers = {p["id"]: p for p in scenario["providers"]}
        identities = sorted(
            self.providers, key=lambda p: digest(["identity", seed, scenario["identity_salt"], p])
        )
        self.aliases = {p: f"provider-{i + 1}" for i, p in enumerate(identities)}
        self.reverse_aliases = {alias: p for p, alias in self.aliases.items()}
        self.jobs = {j["id"]: j for j in scenario["jobs"]}
        self._emit(
            "episode_started",
            {
                "episode_id": self.episode_id,
                "scenario_id": scenario["id"],
                "seed": seed,
                "budget": scenario["budget"],
                "epochs": scenario["epochs"],
                "drain_epochs": scenario["drain_epochs"],
                "track": track,
                "source": "synthetic",
                "unit": "simulated-atomic",
                "fee_rule": scenario["fee_rule"],
            },
        )
        for job in scenario["jobs"]:
            self.clock.schedule(job["arrival"], "arrive", job["id"])
        self.advance(0)

    def _emit(self, kind: str, data: dict) -> None:
        self.events.append(
            {
                "sequence": len(self.events),
                "epoch": self.clock.epoch,
                "type": kind,
                "data": copy.deepcopy(data),
            }
        )

    def _private(self, kind: str, data: dict) -> None:
        self.evaluator.append(
            {"epoch": self.clock.epoch, "type": kind, "data": copy.deepcopy(data)}
        )

    def _record(self, kind: str, data: dict, attempt: dict | None = None) -> None:
        self._private(kind, data)
        if attempt is not None and not attempt["revealed"]:
            attempt["pending"].append((kind, copy.deepcopy(data)))
        else:
            self._emit(kind, data)

    def _move(
        self, source: str, target: str, amount: int, reason: str, attempt: dict | None = None
    ) -> None:
        if amount == 0:
            return
        entry = self.ledger.transfer(source, target, amount, reason)
        if attempt is not None:
            entry["attempt_id"] = attempt["id"]
            entry["job_id"] = attempt["job_id"]
        self._record("ledger", entry, attempt)

    def _public_job(self, job: dict) -> dict:
        return dict(job, allowed_providers=[self.aliases[p] for p in job["allowed_providers"]])

    def _draw(self, job: str, provider: str, ordinal: int, event_type: str) -> float:
        return uniform(self.scenario["world_id"], self.seed, job, provider, ordinal, event_type)

    def _fee(self, attempt: dict) -> None:
        p = self.providers[attempt["provider"]]
        self._move(
            "buyer.reserved",
            f"{self.aliases[p['id']]}.available",
            p["fee"],
            "execution_fee",
            attempt,
        )
        self._move(
            f"{self.aliases[p['id']]}.available",
            "network.available",
            p["network_cost"],
            "network_cost",
            attempt,
        )
        attempt["remaining"] -= p["fee"]

    def _reveal(self, attempt: dict) -> None:
        for kind, data in attempt["pending"]:
            self._emit(kind, data)
        attempt["pending"].clear()
        attempt["revealed"] = True

    def advance(self, until: int) -> None:
        if until < self.clock.epoch:
            raise ValueError("Virtual time cannot go backwards")
        while (event := self.clock.next_due(until)) is not None:
            if event.kind == "arrive":
                self._emit("job_arrived", self._public_job(self.jobs[event.payload]))
                continue
            a = self.attempts[event.payload]
            p, job = self.providers[a["provider"]], self.jobs[a["job_id"]]
            data = {
                "attempt_id": a["id"],
                "job_id": a["job_id"],
                "provider_id": self.aliases[a["provider"]],
            }
            if event.kind == "settle":
                # Settlement evidence is delayed even when submission is known.
                a["revealed"] = False
                a["resolved"] = True
                if a["success"]:
                    if self.scenario["fee_rule"] == "on_success":
                        self._fee(a)
                    self._move(
                        "buyer.reserved", "merchant.available", job["amount"], "service_payment", a
                    )
                    a["remaining"] -= job["amount"]
                    self._record("chain_confirmed", data, a)
                    self.clock.schedule(event.epoch + p["delivery_delay"], "deliver", a["id"])
                else:
                    self._record("failed", data, a)
                self._move("buyer.reserved", "buyer.available", a["remaining"], "release", a)
                a["remaining"] = 0
            elif event.kind == "reveal":
                self._reveal(a)
            elif event.kind == "deliver":
                if a["service_success"]:
                    self._record("service_delivered", dict(data, delivered_epoch=event.epoch), a)
                else:
                    self._record("service_failed", data, a)
                    if p["refund_delay"] is not None:
                        self._record("refund_due", dict(data, amount=job["amount"]), a)
                        self.clock.schedule(event.epoch + p["refund_delay"], "refund", a["id"])
            elif event.kind == "refund":
                self._move("merchant.available", "buyer.available", job["amount"], "refund", a)
                self._record("refund_received", dict(data, amount=job["amount"]), a)
        self.ledger.check()

    def observation(self) -> dict:
        state = project(self.events)
        quotes = []
        for job in state["jobs"]:
            if job["status"] != "available" or job["deadline"] < self.clock.epoch:
                continue
            for pid in sorted(self.providers, key=lambda p: self.aliases[p]):
                p = self.providers[pid]
                if job["allowed_providers"] and self.aliases[pid] not in job["allowed_providers"]:
                    continue
                quote = {
                    "id": f"{job['id']}:{self.aliases[pid]}",
                    "job_id": job["id"],
                    "provider_id": self.aliases[pid],
                    "fee": p["fee"],
                    "amount": job["amount"],
                    "confirmation_delay": p["confirmation_delay"],
                    "visibility_delay": p["visibility_delay"],
                    "delivery_delay": p["delivery_delay"],
                    "refund_delay": p["refund_delay"],
                }
                for field in ["failure_ppm", "rejection_ppm", "service_failure_ppm", "unknown_ppm"]:
                    quote[field] = p[field] if self.scenario["knowledge"] == "public" else None
                quotes.append(quote)
        structured = self.scenario["representation"] == "structured"
        obs = {
            "schema_version": "aeb-provisional-0.1",
            "episodeId": self.episode_id,
            "epoch": self.clock.epoch,
            "time_remaining": max(0, self.scenario["epochs"] - self.clock.epoch),
            "track": self.track,
            "knowledge": self.scenario["knowledge"],
            "representation": self.scenario["representation"],
            "fee_rule": self.scenario["fee_rule"],
            "jobs": state["jobs"]
            if structured
            else [{k: v for k, v in job.items() if k != "status"} for job in state["jobs"]],
            "quotes": quotes,
            "ledger": state["ledger"],
            "attempts": state["attempts"] if structured else [],
            "future_jobs": [
                self._public_job(j)
                for j in self.scenario["jobs"]
                if j["arrival"] > self.clock.epoch
            ]
            if self.scenario["future_jobs_visible"]
            else [],
            "history": copy.deepcopy(self.events),
            "initial_history": [
                dict(h, provider_id=self.aliases[h["provider_id"]])
                for h in self.scenario["initial_history"]
            ],
            "action_schema": {"$defs": copy.deepcopy(SCHEMA["$defs"]), "$ref": "#/$defs/batch"},
        }
        # Only expose the action contract, not scenario/evaluator field names.
        obs["action_schema"]["$defs"] = {
            k: obs["action_schema"]["$defs"][k] for k in ["batch", "action"]
        }
        validate("observation", obs)
        return obs

    def _reject(self, reason: str, action: dict | None = None) -> None:
        # Do not publish raw malformed model output or arbitrary secret strings.
        data = {"reason": reason}
        if action and isinstance(action.get("actionId"), str):
            data["action_id"] = action["actionId"][:100]
        self._emit("action_rejected", data)

    def step(self, batch: object) -> None:
        if self.finished or self.clock.epoch >= self.scenario["epochs"]:
            raise ValueError("No decisions after the horizon")
        try:
            validate("batch", batch)
        except ValidationError:
            self._reject("invalid_action_schema")
        else:
            for action in batch["actions"]:
                self._action(action)
        self.advance(self.clock.epoch + 1)

    def _action(self, action: dict) -> None:
        aid, kind = action["actionId"], action["kind"]
        if aid in self.action_ids:
            self._reject("duplicate_action_id", action)
            return
        self.action_ids.add(aid)
        if kind == "wait":
            return
        if kind in {"query", "retry"}:
            a = self.attempts.get(action["attemptId"])
            if a is None:
                self._reject("unknown_attempt", action)
                return
            if kind == "query":
                if a["resolved"]:
                    self._reveal(a)
                else:
                    self._emit("query_pending", {"attempt_id": a["id"]})
                return
            if action["retryMode"] == "rebroadcast":
                self._emit("rebroadcast", {"attempt_id": a["id"], "same_authorization": True})
                return
            self._select(a["job_id"], a["provider"], action, retry=True)
            return
        jid = action["jobId"]
        state = project(self.events)
        job = next((j for j in state["jobs"] if j["id"] == jid), None)
        if job is None:
            self._reject("job_unavailable", action)
            return
        if kind == "reject":
            if job["status"] != "available" or any(a["job_id"] == jid for a in state["attempts"]):
                self._reject("job_already_started", action)
            else:
                self._emit("job_rejected", {"job_id": jid})
            return
        quote = next(
            (
                q
                for q in self.observation()["quotes"]
                if q["id"] == action["quoteId"] and q["job_id"] == jid
            ),
            None,
        )
        if quote is None:
            self._reject("quote_unavailable", action)
            return
        self._select(jid, self.reverse_aliases[quote["provider_id"]], action)

    def _select(self, jid: str, pid: str, action: dict, retry: bool = False) -> None:
        state = project(self.events)
        job = next((j for j in state["jobs"] if j["id"] == jid), None)
        if job is None or job["deadline"] < self.clock.epoch or job["status"] == "rejected":
            self._reject("job_unavailable", action)
            return
        previous = [a for a in state["attempts"] if a["job_id"] == jid]
        unsafe = any(a["status"] not in {"failed"} for a in previous)
        if unsafe and (self.track == "guarded" or not retry):
            self._reject("duplicate_payment_request", action)
            return
        p = self.providers[pid]
        total = job["amount"] + p["fee"]
        if state["ledger"]["available"] < total:
            self._reject("budget_violation_request", action)
            return
        if unsafe:
            self._emit("dangerous_retry_allowed", {"job_id": jid})
        self.attempt_counts[(jid, pid)] += 1
        ordinal = self.attempt_counts[(jid, pid)]
        rejected = self._draw(jid, pid, ordinal, "rejection") < p["rejection_ppm"] / 1e6
        self._private(
            "submission_draw",
            {"job_id": jid, "provider": pid, "ordinal": ordinal, "rejected": rejected},
        )
        if rejected:
            self._emit("submission_rejected", {"job_id": jid, "provider_id": self.aliases[pid]})
            return
        unknown = self._draw(jid, pid, ordinal, "unknown") < p["unknown_ppm"] / 1e6
        a = {
            "id": f"attempt-{len(self.attempts) + 1}",
            "job_id": jid,
            "provider": pid,
            "ordinal": ordinal,
            "remaining": total,
            "pending": [],
            "revealed": not unknown,
            "resolved": False,
            "success": self._draw(jid, pid, ordinal, "failure") >= p["failure_ppm"] / 1e6,
            "service_success": self._draw(jid, pid, ordinal, "service_failure")
            >= p["service_failure_ppm"] / 1e6,
        }
        self.attempts[a["id"]] = a
        self._move("buyer.available", "buyer.reserved", total, "reserve")
        self._emit(
            "reserved",
            {
                "attempt_id": a["id"],
                "job_id": jid,
                "provider_id": self.aliases[pid],
                "amount": job["amount"],
                "fee": p["fee"],
                "started_epoch": self.clock.epoch,
            },
        )
        self._private("attempt_truth", {k: v for k, v in a.items() if k != "pending"})
        if self.scenario["fee_rule"] == "on_submission":
            self._fee(a)
        self._emit("submission_unknown" if unknown else "submitted", {"attempt_id": a["id"]})
        self.clock.schedule(self.clock.epoch + p["confirmation_delay"], "settle", a["id"])
        self.clock.schedule(
            self.clock.epoch + p["confirmation_delay"] + p["visibility_delay"], "reveal", a["id"]
        )

    def finish(self) -> None:
        if self.finished:
            return
        self.advance(self.scenario["epochs"] + self.scenario["drain_epochs"])
        self._emit("episode_finished", {"pending_events": len(self.clock.queue)})
        self._private(
            "final_ledger", {"balances": dict(self.ledger.balances), "buyer": self.ledger.buyer()}
        )
        self.finished = True

    def checkpoint(self) -> dict:
        """Evaluator-only snapshot. Recovery replays saved actions, not pickle."""
        return {
            "epoch": self.clock.epoch,
            "ledger": dict(self.ledger.balances),
            "attempts": copy.deepcopy(self.attempts),
            "queue": [vars(event) for event in sorted(self.clock.queue)],
            "action_ids": sorted(self.action_ids),
        }
