from __future__ import annotations

import json
import platform
import subprocess
from dataclasses import asdict
from importlib.metadata import version
from pathlib import Path

from jsonschema import ValidationError

from aeb import __version__
from aeb.agents.process import BudgetExhausted, ProcessAgent
from aeb.contracts import SCHEMA_DIGEST, validate
from aeb.environments import ExecutionMarket
from aeb.evaluation.metrics import metrics, summarize
from aeb.policies import RulePolicy
from aeb.policies.baselines import POLICY_VERSION
from aeb.util import digest, read_jsonl, write_json, write_jsonl


def _snapshot(path: Path, world: ExecutionMarket, decisions: list[dict]) -> None:
    # Each file is atomically replaced. Checkpoint contains evaluator state and
    # must never be exposed through Arena/public replay exports.
    for name, rows in [
        ("events", world.events),
        ("evaluator", world.evaluator),
        ("decisions", decisions),
    ]:
        temp = path / f".{name}.tmp"
        write_jsonl(temp, rows)
        temp.replace(path / f"{name}.jsonl")
    temp = path / ".checkpoint.tmp"
    write_json(temp, world.checkpoint())
    temp.replace(path / "checkpoint.json")


def run_episode(
    scenario: dict, seed: int, policy, track: str = "guarded", output: Path | None = None
) -> tuple[ExecutionMarket, dict, list[dict]]:
    world = ExecutionMarket(scenario, seed, track)
    decisions = []
    if output:
        output.mkdir(parents=True, exist_ok=False)
        write_json(output / "scenario.json", scenario)  # evaluator artifact, never a prompt
    if isinstance(policy, ProcessAgent):
        policy.start_episode()
    stopped = False
    while world.clock.epoch < scenario["epochs"]:
        obs = world.observation()
        record = {
            "epoch": world.clock.epoch,
            "observation_digest": digest(obs),
            "observation": obs,
            "policy_version": POLICY_VERSION,
            "model": getattr(policy, "model", None),
            "prompt_version": getattr(policy, "prompt_version", None),
        }
        try:
            if stopped:
                raise BudgetExhausted("Already stopped")
            action = policy.decide(obs)
            record["status"] = "decision"
            if isinstance(policy, ProcessAgent):
                record.update(policy.last_record)
        except BudgetExhausted:
            stopped = True
            action = {"actions": []}
            record["status"] = "dispatch_stopped"
        try:
            validate("batch", action)
            record["parse_status"] = "valid"
        except ValidationError:
            record["parse_status"] = "invalid"
        record["action"] = action
        decisions.append(record)
        world.step(action)
        if output:
            _snapshot(output, world, decisions)
    world.finish()
    result = metrics(world.events)
    if output:
        _snapshot(output, world, decisions)
        write_json(output / "metrics.json", result)
        write_json(
            output / "decision_metrics.json",
            {
                "decision_calls": sum(r["status"] == "decision" for r in decisions),
                "model_calls": sum("adapter_status" in r for r in decisions),
                "requested_actions": sum(
                    len(r["action"]["actions"]) for r in decisions if r["parse_status"] == "valid"
                ),
                "stopped_epochs": sum(r["status"] == "dispatch_stopped" for r in decisions),
                "tokens": sum(r.get("accounted_tokens", 0) for r in decisions),
                "usd_micros": sum(r.get("accounted_usd_micros", 0) for r in decisions),
                "latency_seconds": [r.get("latency_seconds", 0) for r in decisions],
                "adapter_errors": sum(r.get("adapter_status", "ok") != "ok" for r in decisions),
            },
        )
    return world, result, decisions


def source_revision() -> str | None:
    root = Path(__file__).resolve().parents[2]
    if not (root / ".git").is_dir():
        return None
    result = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True
    )
    return result.stdout.strip() if result.returncode == 0 else None


def engine_digest() -> str:
    root = Path(__file__).parent
    return digest({str(p.relative_to(root)): p.read_text() for p in sorted(root.rglob("*.py"))})


def run_suite(
    scenarios: list[dict],
    seeds: list[int],
    policy_name: str,
    output: Path,
    track: str = "guarded",
    agent: ProcessAgent | None = None,
) -> dict:
    if output.exists():
        raise ValueError(f"Output already exists: {output}; choose a new directory")
    if len(set(seeds)) != len(seeds) or not seeds or not scenarios:
        raise ValueError("Need nonempty scenarios and unique seeds")
    output.mkdir(parents=True)
    manifest = {
        "engine_version": __version__,
        "source_revision": source_revision(),
        "engine_digest": engine_digest(),
        "decision_coverage_complete": True,
        "schema_version": "aeb-provisional-0.1",
        "schema_digest": SCHEMA_DIGEST,
        "policy": policy_name,
        "policy_version": POLICY_VERSION,
        "track": track,
        "seeds": seeds,
        "python": platform.python_version(),
        "dependencies": {
            name: version(name) for name in ["jsonschema", "referencing", "rpds-py", "attrs"]
        },
        "source": "synthetic",
        "decision_granularity": "epoch-batch",
        "status": "running",
        "scenarios": [
            {"id": s["id"], "world_id": s["world_id"], "split": s["split"], "digest": digest(s)}
            for s in scenarios
        ],
        "model": (
            {
                "name": agent.model,
                "prompt_version": agent.prompt_version,
                "command_digest": digest(agent.command),
                "limits": asdict(agent.limits),
            }
            if agent
            else None
        ),
    }
    write_json(output / "manifest.json", manifest)
    results, index = [], []
    try:
        for scenario in scenarios:
            for seed in seeds:
                path = output / "episodes" / f"{scenario['id']}--seed-{seed}"
                policy = agent if agent else RulePolicy(policy_name, seed)
                _, result, decisions = run_episode(scenario, seed, policy, track, path)
                if any(r["status"] == "dispatch_stopped" for r in decisions):
                    manifest["decision_coverage_complete"] = False
                results.append(result)
                index.append(
                    {
                        "scenario_id": scenario["id"],
                        "seed": seed,
                        "path": str(path.relative_to(output)),
                        "metrics": result,
                    }
                )
                write_json(output / "index.json", index)
        manifest["status"] = "complete"
    except BaseException:
        manifest["status"] = "interrupted"
        raise
    finally:
        write_json(output / "manifest.json", manifest)
    summary = summarize(results)
    write_json(output / "summary.json", summary)
    lines = [
        "# AEB synthetic mechanism run",
        "",
        f"Policy: `{policy_name}`; track: `{track}`.",
        "",
        "| Scenario | Episodes | Mean utility | Worst utility | Duplicate payments | Complete |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines += [
        f"| {s} | {v['episodes']} | {v['mean_utility']:.2f} | {v['min_utility']} | "
        f"{v['duplicate_payments']} | {v['complete_episodes']} |"
        for s, v in summary.items()
    ]
    lines += [
        "",
        "Synthetic simulator results; no model-ranking or production-payment claims.",
        "Utility uses evidence visible by the fixed drain horizon. Unresolved outcomes are censored.",
        "See decision_metrics.json per episode for model usage, errors and stopped epochs.",
    ]
    (output / "report.md").write_text("\n".join(lines) + "\n")
    return summary


def replay(path: Path) -> dict:
    return metrics(read_jsonl(path))


def verify_episode(path: Path) -> dict:
    """Re-simulate exactly the saved actions; do not rerun a nondeterministic model."""
    scenario = json.loads((path / "scenario.json").read_text())
    saved = read_jsonl(path / "events.jsonl")
    head = saved[0]["data"]
    world = ExecutionMarket(scenario, head["seed"], head["track"])
    for decision in read_jsonl(path / "decisions.jsonl"):
        if digest(world.observation()) != decision["observation_digest"]:
            raise ValueError("Observation replay mismatch")
        world.step(decision["action"])
    world.finish()
    if world.events != saved or world.evaluator != read_jsonl(path / "evaluator.jsonl"):
        raise ValueError("Deterministic replay mismatch")
    recomputed = metrics(saved)
    if recomputed != json.loads((path / "metrics.json").read_text()):
        raise ValueError("Metrics replay mismatch")
    return {"verified": True, "trace_digest": recomputed["trace_digest"]}
