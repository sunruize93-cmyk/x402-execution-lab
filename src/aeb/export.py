"""A file handoff to an Arena-owned projector; not an Arena API implementation."""

from aeb.evaluation.metrics import metrics

ALLOWED = {
    "episode_id",
    "scenario_id",
    "seed",
    "budget",
    "epochs",
    "drain_epochs",
    "track",
    "source",
    "unit",
    "fee_rule",
    "id",
    "arrival",
    "deadline",
    "amount",
    "value",
    "failure_cost",
    "non_execution_cost",
    "delay_cost",
    "allowed_providers",
    "attempt_id",
    "job_id",
    "provider_id",
    "fee",
    "started_epoch",
    "delivered_epoch",
    "reason",
    "action_id",
    "same_authorization",
    "pending_events",
}


def arena_export(events: list[dict]) -> dict:
    result = metrics(events)
    public = []
    for event in events:
        data = {key: value for key, value in event["data"].items() if key in ALLOWED}
        if event["type"] == "ledger":
            data["postings"] = [
                {"account": p["account"], "delta": p["delta"]} for p in event["data"]["postings"]
            ]
        public.append(dict(event, data=data))
    return {
        "schema_version": "aeb-arena-replay-0.1",
        "source": "synthetic",
        "authority": "offline-benchmark",
        "production_ranking_eligible": False,
        "track": result["track"],
        "episode_id": result["episode_id"],
        "events": public,
        "metrics": metrics(public),
    }
