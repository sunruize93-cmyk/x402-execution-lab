from __future__ import annotations

import random
from functools import lru_cache

from aeb.observations.projection import normalized
from aeb.util import digest

POLICY_NAMES = [
    "cheapest",
    "fastest",
    "expected-cost",
    "bayesian",
    "thompson",
    "budget-aware",
    "naive-retry",
    "exact-dp",
]
POLICY_VERSION = "0.1.0"


def posterior(observation: dict, provider: str) -> tuple[int, int]:
    """Beta(1,1) prior over rail failure; evidence only, never hidden outcomes."""
    failures = successes = 1
    history = observation["initial_history"] + [
        dict(e["data"], status=e["type"])
        for e in observation["history"]
        if e["type"] in {"chain_confirmed", "failed"}
    ]
    for item in history:
        if item["provider_id"] == provider:
            failures += item["status"] == "failed"
            successes += item["status"] == "chain_confirmed"
    return failures, successes


def expected_utility(
    job: dict, quote: dict, epoch: int, fee_rule: str, failure: float | None = None
) -> float:
    p = quote["failure_ppm"] / 1e6 if failure is None else failure
    service_failure = (quote["service_failure_ppm"] or 0) / 1e6
    rejection = (quote["rejection_ppm"] or 0) / 1e6
    delivery = epoch + quote["confirmation_delay"] + quote["delivery_delay"]
    delay_cost = max(0, delivery - job["deadline"]) * job["delay_cost"]
    # This is a one-attempt expectation, not a full delayed-state oracle.
    refund = job["amount"] if quote["refund_delay"] is not None else 0
    success_value = (
        (1 - service_failure) * (job["value"] - delay_cost)
        + service_failure * (refund - job["failure_cost"])
        - job["amount"]
    )
    fee = quote["fee"] * (1 if fee_rule == "on_submission" else 1 - p)
    return (1 - rejection) * (
        (1 - p) * success_value - p * job["failure_cost"] - fee
    ) - rejection * job["non_execution_cost"]


def exact_choice(obs: dict, job: dict, quotes: list[dict], attempted: bool) -> str | None:
    """Exact finite-horizon DP for ONE job and immediate public rail outcomes.

    It includes failure retries, fees, liquidity constraints and the option to
    stop. Refuse unsupported worlds rather than presenting a heuristic as DP.
    """
    if (
        len(obs["jobs"]) != 1
        or obs["future_jobs"]
        or obs["knowledge"] != "public"
        or obs["fee_rule"] != "on_submission"
        or obs["time_remaining"] > 30
        or any(
            q["confirmation_delay"]
            or q["visibility_delay"]
            or q["delivery_delay"]
            or q["rejection_ppm"]
            or q["service_failure_ppm"]
            for q in quotes
        )
    ):
        raise ValueError("exact-dp requires one public, immediate-outcome job (<=30 epochs)")
    last_epoch = min(job["deadline"], obs["epoch"] + obs["time_remaining"] - 1)

    @lru_cache(None)
    def value(epoch: int, budget: int, has_attempt: bool) -> tuple[float, str | None]:
        stop_cost = job["failure_cost"] if has_attempt else job["non_execution_cost"]
        best: tuple[float, str | None] = (-stop_cost, None)
        if epoch > last_epoch:
            return best
        for q in quotes:
            if q["amount"] + q["fee"] > budget:
                continue
            p = q["failure_ppm"] / 1e6
            v = (1 - p) * (job["value"] - q["amount"] - q["fee"]) + p * (
                -q["fee"] + value(epoch + 1, budget - q["fee"], True)[0]
            )
            if v > best[0]:
                best = v, q["id"]
        return best

    return value(obs["epoch"], obs["ledger"]["available"], attempted)[1]


class RulePolicy:
    def __init__(self, name: str = "expected-cost", seed: int = 0):
        if name not in POLICY_NAMES:
            raise ValueError(f"Unknown policy: {name}")
        self.name, self.seed = name, seed

    def decide(self, observation: dict) -> dict:
        obs = normalized(observation)
        actions: list[dict] = []
        cash = obs["ledger"]["available"]

        def add(kind: str, **fields):
            actions.append(dict(actionId=f"e{obs['epoch']}-a{len(actions)}", kind=kind, **fields))

        for job in sorted(obs["jobs"], key=lambda j: (j["deadline"], j["id"])):
            attempts = [a for a in obs["attempts"] if a["job_id"] == job["id"]]
            pending = [
                a
                for a in attempts
                if a["status"] in {"reserved", "submitted", "submission_unknown"}
            ]
            if pending:
                if self.name == "naive-retry" and pending[-1]["status"] == "submission_unknown":
                    add("retry", attemptId=pending[-1]["attempt_id"], retryMode="new_authorization")
                else:
                    for attempt in pending:
                        add("query", attemptId=attempt["attempt_id"])
                continue
            if job["status"] != "available" or job["deadline"] < obs["epoch"]:
                continue
            if attempts and self.name != "exact-dp":
                continue  # one attempt per job for comparable simple baselines
            quotes = [
                q
                for q in obs["quotes"]
                if q["job_id"] == job["id"] and q["amount"] + q["fee"] <= cash
            ]
            if not quotes:
                continue
            estimates = {}
            for q in quotes:
                a, b = posterior(obs, q["provider_id"])
                if q["failure_ppm"] is not None:
                    p = q["failure_ppm"] / 1e6
                elif self.name == "thompson":
                    rng = random.Random(digest([self.seed, obs["epoch"], q["id"], "policy"]))
                    p = rng.betavariate(a, b)
                else:
                    p = a / (a + b)
                estimates[q["id"]] = expected_utility(job, q, obs["epoch"], obs["fee_rule"], p)
            if self.name in {"cheapest", "naive-retry"}:
                selected = min(quotes, key=lambda q: (q["fee"], q["id"]))
            elif self.name == "fastest":
                selected = min(
                    quotes,
                    key=lambda q: (
                        q["confirmation_delay"] + q["delivery_delay"],
                        q["fee"],
                        q["id"],
                    ),
                )
            elif self.name == "exact-dp":
                qid = exact_choice(obs, job, quotes, bool(attempts))
                if qid is None:
                    continue
                selected = next(q for q in quotes if q["id"] == qid)
            else:
                selected = max(quotes, key=lambda q: (estimates[q["id"]], -q["fee"], q["id"]))
                if estimates[selected["id"]] <= -job["non_execution_cost"]:
                    add("reject", jobId=job["id"])
                    continue
                if self.name == "budget-aware":
                    future = [j for j in obs["future_jobs"] if j["value"] > j["amount"]]
                    if future:
                        next_job = min(future, key=lambda j: (j["arrival"], j["id"]))
                        reserve = next_job["amount"] + min(q["fee"] for q in quotes)
                        if (
                            cash - selected["amount"] - selected["fee"] < reserve
                            and next_job["value"] - next_job["amount"] > estimates[selected["id"]]
                        ):
                            continue
            add("select", jobId=job["id"], quoteId=selected["id"])
            cash -= selected["amount"] + selected["fee"]
        return {"actions": actions[:64]}
