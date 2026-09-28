from __future__ import annotations

import json
import random
import statistics
from collections import defaultdict
from pathlib import Path

from aeb.util import digest


def paired_interval(differences: list[float], repetitions: int = 2000) -> dict:
    if not differences:
        raise ValueError("No matched episodes")
    mean = statistics.mean(differences)
    if len(differences) < 2:
        return {"mean": mean, "ci95": None, "n": 1}
    rng = random.Random(402)
    estimates = sorted(
        statistics.mean(rng.choices(differences, k=len(differences))) for _ in range(repetitions)
    )
    return {
        "mean": mean,
        "ci95": [estimates[int(repetitions * 0.025)], estimates[int(repetitions * 0.975) - 1]],
        "n": len(differences),
    }


def compare(
    left: Path, right: Path, *, intervention: bool = False, allow_track_difference: bool = False
) -> dict:
    manifests = [json.loads((p / "manifest.json").read_text()) for p in [left, right]]
    for key in ["engine_version", "engine_digest", "schema_digest", "decision_granularity"]:
        if manifests[0][key] != manifests[1][key]:
            raise ValueError(f"Incompatible runs: {key}")
    if not allow_track_difference and manifests[0]["track"] != manifests[1]["track"]:
        raise ValueError("Different tracks require --allow-track-difference")
    if any(m["status"] != "complete" for m in manifests):
        raise ValueError("Cannot compare incomplete runs")
    if any(not m["decision_coverage_complete"] for m in manifests):
        raise ValueError("Cannot compare runs stopped by model dispatch limits")
    indexed = []
    for root, manifest in zip([left, right], manifests, strict=True):
        mapping = {}
        metadata = {s["id"]: s for s in manifest["scenarios"]}
        for row in json.loads((root / "index.json").read_text()):
            spec = metadata[row["scenario_id"]]
            episode = root / row["path"]
            scenario = json.loads((episode / "scenario.json").read_text())
            if digest(scenario) != spec["digest"]:
                raise ValueError("Scenario digest mismatch")
            from aeb.runner import replay

            if replay(episode / "events.jsonl") != row["metrics"]:
                raise ValueError("Trace/metric mismatch")
            key = (spec["world_id"] if intervention else row["scenario_id"], row["seed"])
            if key in mapping:
                raise ValueError("Ambiguous pairing; select one condition per world and seed")
            mapping[key] = (row["metrics"], spec)
        indexed.append(mapping)
    if indexed[0].keys() != indexed[1].keys():
        raise ValueError("Unmatched episodes: no samples are silently dropped")
    groups = defaultdict(list)
    for key in sorted(indexed[0]):
        a, spec_a = indexed[0][key]
        b, spec_b = indexed[1][key]
        if not intervention and spec_a["digest"] != spec_b["digest"]:
            raise ValueError("Scenario changed; use explicit --intervention pairing")
        if spec_a["split"] != spec_b["split"]:
            raise ValueError("Cannot pair different data splits")
        groups[key[0]].append(
            {
                "seed": key[1],
                "difference": b["utility"] - a["utility"],
                "left": a["utility"],
                "right": b["utility"],
                "left_complete": a["complete_outcome_coverage"],
                "right_complete": b["complete_outcome_coverage"],
            }
        )
    return {
        "contrast": "right minus left utility; signed same-information baseline gap, not oracle regret",
        "left_policy": manifests[0]["policy"],
        "right_policy": manifests[1]["policy"],
        "tracks": [m["track"] for m in manifests],
        "intervention": intervention,
        "method": "paired percentile bootstrap, 2000 resamples of independent episode seeds per scenario",
        "results": {
            name: dict(paired_interval([r["difference"] for r in rows]), pairs=rows)
            for name, rows in groups.items()
        },
    }


def markdown(result: dict) -> str:
    lines = [
        "# Paired AEB comparison",
        "",
        result["contrast"],
        "",
        result["method"],
        "",
        "| Scenario | Pairs | Mean difference | 95% interval |",
        "| --- | ---: | ---: | --- |",
    ]
    for name, row in result["results"].items():
        ci = row["ci95"]
        interval = f"[{ci[0]:.2f}, {ci[1]:.2f}]" if ci else "unavailable (one pair)"
        lines.append(f"| {name} | {row['n']} | {row['mean']:.2f} | {interval} |")
    lines += [
        "",
        "Exploratory synthetic comparisons. Jobs within an episode are not independent samples.",
        "Intervals do not establish real-provider performance or LLM generalization.",
        "Inspect per-run reports for constraint violations, censoring and tail outcomes.",
    ]
    return "\n".join(lines) + "\n"
