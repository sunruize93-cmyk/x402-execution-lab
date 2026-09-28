from __future__ import annotations

from aeb.engine.ledger import Ledger


def project(events: list[dict]) -> dict:
    if not events or events[0]["type"] != "episode_started":
        raise ValueError("Missing episode_started")
    ledger = Ledger(events[0]["data"]["budget"])
    jobs: dict[str, dict] = {}
    attempts: dict[str, dict] = {}
    receivable = 0
    for event in events:
        kind, d = event["type"], event["data"]
        if kind == "ledger":
            ledger.apply(d)
        elif kind == "job_arrived":
            jobs[d["id"]] = dict(d, status="available")
        elif kind == "reserved":
            attempts[d["attempt_id"]] = dict(d, status="reserved")
        elif kind in {
            "submitted",
            "submission_unknown",
            "failed",
            "chain_confirmed",
            "service_delivered",
            "service_failed",
        }:
            attempts[d["attempt_id"]]["status"] = kind
            if kind == "service_delivered":
                jobs[d["job_id"]]["status"] = "delivered"
        elif kind == "job_rejected":
            jobs[d["job_id"]]["status"] = "rejected"
        elif kind == "refund_due":
            receivable += d["amount"]
        elif kind == "refund_received":
            receivable -= d["amount"]
        if receivable < 0:
            raise ValueError("Refund without a receivable")
    return {
        "ledger": ledger.buyer(receivable),
        "jobs": list(jobs.values()),
        "attempts": list(attempts.values()),
        "accounts": dict(ledger.balances),
    }


def normalized(observation: dict) -> dict:
    """Both representations contain exactly the same information."""
    return dict(
        observation,
        **{
            k: v
            for k, v in project(observation["history"]).items()
            if k in {"jobs", "attempts", "ledger"}
        },
    )
