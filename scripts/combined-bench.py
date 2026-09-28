"""Run the fixed, no-key benchmark half of the combined demonstration."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from aeb.evaluation.compare import compare, markdown
from aeb.runner import run_suite, verify_episode
from aeb.scenarios import load_scenario, suite
from aeb.util import digest, write_json


def verify_runs(runs: list[Path]) -> int:
    """Verify every declared episode once, including index/report consistency."""
    verified_paths: set[Path] = set()
    baseline = None
    for run in runs:
        manifest = json.loads((run / "manifest.json").read_text())
        if (
            manifest["status"] != "complete"
            or not manifest["decision_coverage_complete"]
            or manifest["source"] != "synthetic"
        ):
            raise ValueError(f"Incomplete or unexpected run: {run.name}")
        provenance = tuple(
            manifest[key]
            for key in (
                "engine_version",
                "engine_digest",
                "schema_version",
                "schema_digest",
            )
        )
        if baseline is not None and provenance != baseline:
            raise ValueError("Run provenance mismatch")
        baseline = provenance
        scenarios = {scenario["id"]: scenario for scenario in manifest["scenarios"]}
        expected = {(scenario_id, seed) for scenario_id in scenarios for seed in manifest["seeds"]}
        seen = set()
        for row in json.loads((run / "index.json").read_text()):
            identity = (row["scenario_id"], row["seed"])
            if identity not in expected or identity in seen:
                raise ValueError("Duplicate or unexpected indexed episode")
            relative = Path("episodes") / f"{row['scenario_id']}--seed-{row['seed']}"
            episode = (run / relative).resolve()
            if (
                Path(row["path"]) != relative
                or not episode.is_relative_to(run.resolve())
                or episode in verified_paths
            ):
                raise ValueError("Invalid or duplicate episode path")
            scenario = json.loads((episode / "scenario.json").read_text())
            if digest(scenario) != scenarios[row["scenario_id"]]["digest"]:
                raise ValueError("Scenario digest mismatch")
            verify_episode(episode)
            metric = json.loads((episode / "metrics.json").read_text())
            if row["metrics"] != metric or (metric["scenario_id"], metric["seed"]) != identity:
                raise ValueError("Index/metric mismatch")
            if not metric["complete_outcome_coverage"]:
                raise ValueError("Combined demo requires uncensored outcomes")
            seen.add(identity)
            verified_paths.add(episode)
        if seen != expected or not expected:
            raise ValueError("Incomplete episode index")
    return len(verified_paths)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    root = args.out
    root.mkdir(parents=True, exist_ok=False)
    seeds = [0, 1, 2]
    runs = []
    for policy in ("cheapest", "expected-cost"):
        print(f"Benchmark: {policy}, 8 conditions × 3 seeds", flush=True)
        path = root / policy
        run_suite(suite(split="dev"), seeds, policy, path)
        runs.append(path)
    comparison = compare(*runs)
    (root / "comparison").mkdir()
    write_json(root / "comparison/comparison.json", comparison)
    (root / "comparison/report.md").write_text(markdown(comparison), encoding="utf-8")
    retry = {}
    for track in ("guarded", "diagnostic"):
        print(f"Benchmark: naive-retry, {track} track", flush=True)
        path = root / f"retry-{track}"
        run_suite([load_scenario("late-unknown-dev")], [7], "naive-retry", path, track)
        runs.append(path)
        metric = json.loads((path / "index.json").read_text())[0]["metrics"]
        retry[track] = {
            "utility": metric["utility"],
            "duplicatePayments": metric["duplicate_payments"],
        }
    verified = verify_runs(runs)
    manifest = json.loads((runs[0] / "manifest.json").read_text())
    write_json(
        root / "combined.json",
        {
            "source": "synthetic",
            "schemaVersion": manifest["schema_version"],
            "engineDigest": manifest["engine_digest"],
            "verifiedEpisodes": verified,
            "seeds": seeds,
            "comparison": comparison,
            "retry": retry,
        },
    )
    print(f"Verified all {verified} saved episodes without model calls", flush=True)


if __name__ == "__main__":
    main()
