"""Regenerate owned synthetic scenarios and the provisional AEB schema.

Run from any directory. No upstream artifact or measured provider data is used.
"""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/aeb/data"


def obj(properties, required=None):
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties) if required is None else required,
        "additionalProperties": False,
    }


def integer(low=0, high=10**12):
    return {"type": "integer", "minimum": low, "maximum": high}


def enum(*values):
    return {"enum": list(values)}


ID = {"type": "string", "pattern": "^[a-zA-Z0-9_-]{1,100}$"}
provider = obj(
    {
        "id": ID,
        "fee": integer(),
        "failure_ppm": integer(0, 1000000),
        "unknown_ppm": integer(0, 1000000),
        "rejection_ppm": integer(0, 1000000),
        "confirmation_delay": integer(0, 2000),
        "visibility_delay": integer(0, 2000),
        "delivery_delay": integer(0, 2000),
        "service_failure_ppm": integer(0, 1000000),
        "refund_delay": {"anyOf": [integer(0, 2000), {"type": "null"}]},
        "network_cost": integer(),
    }
)
job = obj(
    {
        "id": ID,
        "arrival": integer(0, 999),
        "deadline": integer(0, 3000),
        "amount": integer(),
        "value": integer(),
        "failure_cost": integer(),
        "non_execution_cost": integer(),
        "delay_cost": integer(),
        "allowed_providers": {"type": "array", "items": ID, "uniqueItems": True},
    }
)
action = obj(
    {
        "actionId": ID,
        "kind": enum("select", "wait", "query", "reject", "retry"),
        "jobId": ID,
        "quoteId": {"type": "string", "maxLength": 200},
        "attemptId": ID,
        "retryMode": enum("rebroadcast", "new_authorization"),
        "reason": {"type": "string", "maxLength": 256},
    },
    ["actionId", "kind"],
)
action["allOf"] = [
    {"if": {"properties": {"kind": {"const": kind}}}, "then": {"required": fields}}
    for kind, fields in [
        ("select", ["jobId", "quoteId"]),
        ("query", ["attemptId"]),
        ("reject", ["jobId"]),
        ("retry", ["attemptId", "retryMode"]),
    ]
]
schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/sunruize93-cmyk/arena-execution-bench/contracts/aeb-v0.1",
    "title": "AEB 0.1 provisional synthetic contract (not Lab/x402 conformance)",
    "$defs": {
        "scenario": obj(
            {
                "schema_version": {"const": "aeb-provisional-0.1"},
                "id": ID,
                "world_id": ID,
                "family": enum("risk", "late-confirmation", "liquidity", "mixed"),
                "split": enum("train", "dev", "eval"),
                "epochs": integer(1, 1000),
                "drain_epochs": integer(0, 2000),
                "budget": integer(1),
                "knowledge": enum("public", "hidden"),
                "fee_rule": enum("on_submission", "on_success"),
                "representation": enum("structured", "events"),
                "identity_salt": integer(),
                "future_jobs_visible": {"type": "boolean"},
                "providers": {"type": "array", "items": provider, "minItems": 1, "maxItems": 10},
                "jobs": {"type": "array", "items": job, "minItems": 1, "maxItems": 200},
                "initial_history": {
                    "type": "array",
                    "items": obj({"provider_id": ID, "status": enum("failed", "chain_confirmed")}),
                },
            }
        ),
        "batch": obj({"actions": {"type": "array", "items": action, "maxItems": 64}}),
        "action": action,
        "event": obj(
            {
                "sequence": integer(),
                "epoch": integer(),
                "type": enum(
                    "episode_started",
                    "job_arrived",
                    "ledger",
                    "reserved",
                    "submitted",
                    "submission_unknown",
                    "submission_rejected",
                    "chain_confirmed",
                    "failed",
                    "service_delivered",
                    "service_failed",
                    "refund_due",
                    "refund_received",
                    "action_rejected",
                    "query_pending",
                    "rebroadcast",
                    "job_rejected",
                    "dangerous_retry_allowed",
                    "episode_finished",
                ),
                "data": {"type": "object"},
            }
        ),
        "observation": obj(
            {
                "schema_version": {"const": "aeb-provisional-0.1"},
                "episodeId": {"type": "string"},
                "epoch": integer(),
                "time_remaining": integer(),
                "track": enum("guarded", "diagnostic"),
                "knowledge": enum("public", "hidden"),
                "representation": enum("structured", "events"),
                "fee_rule": enum("on_submission", "on_success"),
                "jobs": {"type": "array"},
                "quotes": {"type": "array"},
                "future_jobs": {"type": "array"},
                "ledger": obj(
                    {
                        "available": integer(),
                        "reserved": integer(),
                        "spent": integer(),
                        "receivable": integer(),
                    }
                ),
                "attempts": {"type": "array"},
                "history": {"type": "array"},
                "initial_history": {"type": "array"},
                "action_schema": {"type": "object"},
            }
        ),
    },
}


def provider_config(name, fee=20, failure=0, delay=1, unknown=0, visibility=0):
    return dict(
        id=name,
        fee=fee,
        failure_ppm=failure,
        unknown_ppm=unknown,
        rejection_ppm=0,
        confirmation_delay=delay,
        visibility_delay=visibility,
        delivery_delay=0,
        service_failure_ppm=0,
        refund_delay=None,
        network_cost=min(fee, 5),
    )


def job_config(
    name, arrival=0, deadline=9, amount=300, value=700, failure=0, non_execution=0, allowed=None
):
    return dict(
        id=name,
        arrival=arrival,
        deadline=deadline,
        amount=amount,
        value=value,
        failure_cost=failure,
        non_execution_cost=non_execution,
        delay_cost=10,
        allowed_providers=allowed or [],
    )


def generate():
    output = []
    for split, offset in [("train", -20), ("dev", 0), ("eval", 35)]:
        base = dict(
            schema_version="aeb-provisional-0.1",
            split=split,
            epochs=10,
            drain_epochs=10,
            budget=5000,
            knowledge="public",
            fee_rule="on_submission",
            representation="structured",
            identity_salt=0,
            future_jobs_visible=True,
            initial_history=[],
        )
        for loss, label in [(100 + offset, "low"), (400 + offset, "high")]:
            s = dict(
                base,
                id=f"risk-{label}-{split}",
                world_id=f"risk-{split}",
                family="risk",
                providers=[
                    provider_config("cheap", 400, 100000),
                    provider_config("balanced", 420, 1000),
                    provider_config("premium", 500, 0),
                ],
                jobs=[
                    job_config("procure", amount=1000, value=1000, failure=loss, non_execution=2000)
                ],
            )
            output.append(s)
        for unknown, label in [(0, "known"), (1000000, "unknown")]:
            s = dict(
                base,
                id=f"late-{label}-{split}",
                world_id=f"late-{split}",
                family="late-confirmation",
                budget=2500,
                providers=[
                    provider_config("cheap", 20, delay=2, unknown=unknown, visibility=2),
                    provider_config("balanced", 30, delay=2, unknown=unknown, visibility=2),
                    provider_config("premium", 40, delay=2, unknown=unknown, visibility=2),
                ],
                jobs=[job_config("purchase", value=700 + offset)],
            )
            output.append(s)
        for delay, label in [(0, "released"), (4, "locked")]:
            s = dict(
                base,
                id=f"liquidity-{label}-{split}",
                world_id=f"liquidity-{split}",
                family="liquidity",
                budget=700,
                providers=[
                    provider_config("slow", 10, 1000000, delay),
                    provider_config("fast", 20, 0, 0),
                    provider_config("premium", 35, 0, 0),
                ],
                jobs=[
                    job_config("early", amount=600, value=650, non_execution=100, allowed=["slow"]),
                    job_config(
                        "opportunity",
                        arrival=1,
                        deadline=2,
                        amount=600,
                        value=1400 + offset,
                        allowed=["fast", "premium"],
                    ),
                ],
            )
            output.append(s)
        for knowledge in ["public", "hidden"]:
            s = dict(
                base,
                id=f"mixed-{knowledge}-{split}",
                world_id=f"mixed-{split}",
                family="mixed",
                budget=1800,
                knowledge=knowledge,
                providers=[
                    provider_config("cheap", 15, 180000, 3, 500000, 2),
                    provider_config("balanced", 35, 20000, 1, 200000, 1),
                    provider_config("premium", 65, 0, 0),
                ],
                jobs=[
                    job_config(
                        f"j{i}",
                        arrival=i,
                        deadline=i + 2,
                        amount=180 + (i % 3) * 40,
                        value=400 + i * 45 + offset,
                        failure=50,
                    )
                    for i in range(8)
                ],
                initial_history=[
                    {"provider_id": p, "status": status}
                    for p in ["cheap", "balanced", "premium"]
                    for status in ["chain_confirmed", "chain_confirmed", "failed"]
                ],
            )
            output.append(s)
    return output


def main():
    (DATA / "contracts").mkdir(parents=True, exist_ok=True)
    (DATA / "scenarios").mkdir(parents=True, exist_ok=True)
    (DATA / "contracts/aeb-v0.1.json").write_text(json.dumps(schema, indent=2) + "\n")
    import hashlib

    raw = (DATA / "contracts/aeb-v0.1.json").read_bytes()
    lock = {
        "status": "provisional-owned-contract",
        "upstream_release": None,
        "file": "aeb-v0.1.json",
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    (DATA / "contracts/lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    for scenario in generate():
        (DATA / f"scenarios/{scenario['id']}.json").write_text(
            json.dumps(copy.deepcopy(scenario), indent=2) + "\n"
        )


if __name__ == "__main__":
    main()
