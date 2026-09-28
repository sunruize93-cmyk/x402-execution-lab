"""Combined-workflow checks; the standalone Python sdist has no root runner."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

from aeb.runner import replay

RUNNER = Path(__file__).resolve().parents[2] / "scripts/combined-bench.py"
pytestmark = pytest.mark.skipif(not RUNNER.is_file(), reason="monorepo integration only")


@pytest.fixture
def combined(monkeypatch, tmp_path):
    spec = importlib.util.spec_from_file_location("combined_bench", RUNNER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = tmp_path / "combined"
    monkeypatch.setattr(sys, "argv", [str(RUNNER), "--out", str(output)])
    return module, output


def test_combined_summary_counts_unique_verified_episodes(combined, monkeypatch):
    runner, output = combined
    original = runner.verify_episode
    verified = []

    def track_verification(path):
        result = original(path)
        verified.append(path)
        return result

    monkeypatch.setattr(runner, "verify_episode", track_verification)
    runner.main()
    summary = json.loads((output / "combined.json").read_text())
    assert summary["source"] == "synthetic"
    assert summary["verifiedEpisodes"] == len(set(verified)) == len(verified) == 50
    assert summary["seeds"] == [0, 1, 2]
    assert len(summary["comparison"]["results"]) == 8
    for result in summary["comparison"]["results"].values():
        assert sorted(pair["seed"] for pair in result["pairs"]) == [0, 1, 2]
    for track in ("guarded", "diagnostic"):
        episode = output / f"retry-{track}/episodes/late-unknown-dev--seed-7"
        metrics = replay(episode / "events.jsonl")
        assert summary["retry"][track] == {
            "utility": metrics["utility"],
            "duplicatePayments": metrics["duplicate_payments"],
        }


def test_combined_summary_is_not_written_after_replay_mismatch(combined, monkeypatch):
    runner, output = combined
    original = runner.run_suite

    def corrupt_episode(scenarios, seeds, policy, path, *args, **kwargs):
        result = original(scenarios, seeds, policy, path, *args, **kwargs)
        if path.name == "retry-diagnostic":
            metrics_file = next(path.glob("episodes/*/metrics.json"))
            metrics = json.loads(metrics_file.read_text())
            metrics["utility"] += 1
            metrics_file.write_text(json.dumps(metrics))
        return result

    monkeypatch.setattr(runner, "run_suite", corrupt_episode)
    with pytest.raises(ValueError, match="[Mm]ismatch"):
        runner.main()
    assert not (output / "combined.json").exists()


def test_combined_summary_rejects_retry_index_metric_mismatch(combined, monkeypatch):
    runner, output = combined
    original = runner.run_suite

    def corrupt_index(scenarios, seeds, policy, path, *args, **kwargs):
        result = original(scenarios, seeds, policy, path, *args, **kwargs)
        if path.name == "retry-diagnostic":
            index_file = path / "index.json"
            index = json.loads(index_file.read_text())
            index[0]["metrics"]["utility"] += 1
            index_file.write_text(json.dumps(index))
        return result

    monkeypatch.setattr(runner, "run_suite", corrupt_index)
    with pytest.raises(ValueError, match="[Mm]ismatch"):
        runner.main()
    assert not (output / "combined.json").exists()


@pytest.mark.parametrize("corruption", ["duplicate", "missing", "traversal"])
def test_verify_runs_rejects_incomplete_or_duplicated_index(combined, corruption):
    runner, output = combined
    runner.run_suite([runner.load_scenario("late-unknown-dev")], [7], "naive-retry", output)
    index_file = output / "index.json"
    index = json.loads(index_file.read_text())
    if corruption == "duplicate":
        index.append(index[0])
    elif corruption == "missing":
        index.clear()
    else:
        index[0]["path"] = "../outside"
    index_file.write_text(json.dumps(index))
    with pytest.raises(ValueError, match="Duplicate|Incomplete|Invalid"):
        runner.verify_runs([output])
