from __future__ import annotations

from collections import Counter, defaultdict

from aeb.contracts import validate
from aeb.observations.projection import project
from aeb.util import digest


def metrics(events: list[dict]) -> dict:
    """Recompute finite-drain *evidence* metrics using only public trace records.

    If confirmations remain censored, utility is an observed finite-horizon
    accounting result, not a bound on eventual cash settlement.
    """
    if not events or events[-1]["type"] != "episode_finished":
        raise ValueError("A completed trace is required for episode metrics")
    for index, event in enumerate(events):
        validate("event", event)
        if event["sequence"] != index or (index and event["epoch"] < events[index - 1]["epoch"]):
            raise ValueError("Invalid event order")
    state = project(events)
    payments: Counter = Counter()
    transfers: Counter = Counter()
    types: Counter = Counter()
    rejected: Counter = Counter()
    delivered = {}
    unknown = {}
    recovery = []
    attempted = set()
    provider_fees: Counter = Counter()
    provider_costs: Counter = Counter()
    reserved = last_epoch = locked_area = 0
    for event in events:
        kind, data, epoch = event["type"], event["data"], event["epoch"]
        locked_area += reserved * (epoch - last_epoch)
        last_epoch = epoch
        types[kind] += 1
        if kind == "ledger":
            for posting in data["postings"]:
                if posting["account"] == "buyer.reserved":
                    reserved += posting["delta"]
            amount = sum(p["delta"] for p in data["postings"] if p["delta"] > 0)
            transfers[data["reason"]] += amount
            if data["reason"] == "service_payment":
                payments[data["job_id"]] += 1
            if data["reason"] == "execution_fee":
                provider_fees[data["postings"][1]["account"]] += amount
            if data["reason"] == "network_cost":
                provider_costs[data["postings"][0]["account"]] += amount
        elif kind == "reserved":
            attempted.add(data["job_id"])
        elif kind == "service_delivered":
            jid = data["job_id"]
            delivered[jid] = min(delivered.get(jid, float("inf")), data["delivered_epoch"])
        elif kind == "submission_unknown":
            unknown[data["attempt_id"]] = epoch
        elif kind in {"chain_confirmed", "failed"} and data["attempt_id"] in unknown:
            recovery.append(epoch - unknown.pop(data["attempt_id"]))
        elif kind == "action_rejected":
            rejected[data["reason"]] += 1
    value = delay_cost = failure_cost = non_execution_cost = on_time = 0
    for job in state["jobs"]:
        jid = job["id"]
        if jid in delivered:
            value += job["value"]
            on_time += delivered[jid] <= job["deadline"]
            delay_cost += max(0, delivered[jid] - job["deadline"]) * job["delay_cost"]
        elif jid in attempted:
            failure_cost += job["failure_cost"]
        else:
            non_execution_cost += job["non_execution_cost"]
    net_payments = transfers["service_payment"] - transfers["refund"]
    pending = sum(
        a["status"] in {"reserved", "submitted", "submission_unknown", "chain_confirmed"}
        for a in state["attempts"]
    )
    return {
        "metric_version": "0.1.0",
        "estimand": "observed_evidence_at_drain",
        "source": "synthetic",
        "track": events[0]["data"]["track"],
        "episode_id": events[0]["data"]["episode_id"],
        "scenario_id": events[0]["data"]["scenario_id"],
        "seed": events[0]["data"]["seed"],
        "utility": value
        - net_payments
        - transfers["execution_fee"]
        - delay_cost
        - failure_cost
        - non_execution_cost,
        "delivered_value": value,
        "service_payments": transfers["service_payment"],
        "refunds": transfers["refund"],
        "execution_fees": transfers["execution_fee"],
        "delay_cost": delay_cost,
        "failure_cost": failure_cost,
        "non_execution_cost": non_execution_cost,
        "jobs": len(state["jobs"]),
        "delivered_jobs": len(delivered),
        "on_time_rate": on_time / len(state["jobs"]) if state["jobs"] else 0,
        "duplicate_payments": sum(max(0, count - 1) for count in payments.values()),
        "duplicate_payment_requests": rejected["duplicate_payment_request"]
        + types["dangerous_retry_allowed"],
        "budget_violation_requests": rejected["budget_violation_request"],
        "effective_budget_violations": 0,  # ledger conservation/nonnegative checks enforce this in both tracks
        "dangerous_retries_allowed": types["dangerous_retry_allowed"],
        "invalid_action_requests": rejected["invalid_action_schema"],
        "action_rejections": dict(rejected),
        "unknown_recovery_epochs": recovery,
        "unrecovered_unknowns": len(unknown),
        "reserved_atomic_epochs": locked_area,
        "pending_attempts": pending,
        "complete_outcome_coverage": pending == 0 and state["ledger"]["receivable"] == 0,
        "buyer": state["ledger"],
        "provider_profit": {p: provider_fees[p] - provider_costs[p] for p in sorted(provider_fees)},
        "trace_digest": digest(events),
    }


def summarize(episodes: list[dict]) -> dict:
    if not episodes:
        raise ValueError("No episodes")
    import statistics

    grouped = defaultdict(list)
    for episode in episodes:
        grouped[episode["scenario_id"]].append(episode)
    result = {}
    for scenario, rows in sorted(grouped.items()):
        values = sorted(r["utility"] for r in rows)
        tail_n = max(1, (len(values) + 9) // 10)
        result[scenario] = {
            "episodes": len(rows),
            "mean_utility": statistics.mean(values),
            "min_utility": min(values),
            "max_utility": max(values),
            "utility_distribution": values,
            "worst_decile_mean_utility": statistics.mean(values[:tail_n]),
            "budget_violation_requests": sum(r["budget_violation_requests"] for r in rows),
            "duplicate_payments": sum(r["duplicate_payments"] for r in rows),
            "complete_episodes": sum(r["complete_outcome_coverage"] for r in rows),
        }
    return result
