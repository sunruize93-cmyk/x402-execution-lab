import json
import subprocess
import sys
from pathlib import Path

import pytest

from aeb.cli import main
from aeb.evaluation.compare import compare, paired_interval
from aeb.evaluation.metrics import metrics
from aeb.export import arena_export
from aeb.runner import replay, run_suite, verify_episode
from aeb.scenarios import intervention
from aeb.util import read_jsonl


def test_saved_run_replays_actions_events_and_metrics(late, tmp_path):
    root = tmp_path / "run"
    run_suite([late], [7], "expected-cost", root)
    episode = root / "episodes" / f"{late['id']}--seed-7"
    assert verify_episode(episode)["verified"]
    assert replay(episode / "events.jsonl") == json.loads((episode / "metrics.json").read_text())
    assert len(read_jsonl(episode / "decisions.jsonl")) == late["epochs"]
    assert (episode / "checkpoint.json").is_file()
    with pytest.raises(ValueError, match="already exists"):
        run_suite([late], [7], "expected-cost", root)


def test_replay_detects_action_tampering(late, tmp_path):
    root = tmp_path / "run"
    run_suite([late], [7], "cheapest", root)
    episode = root / "episodes" / f"{late['id']}--seed-7"
    file = episode / "decisions.jsonl"
    rows = read_jsonl(file)
    rows[0]["action"] = {"actions": []}
    file.write_text("\n".join(json.dumps(r) for r in rows))
    with pytest.raises(ValueError, match="mismatch"):
        verify_episode(episode)


def test_public_export_drops_unknown_evaluator_fields(late, tmp_path):
    root = tmp_path / "run"
    run_suite([late], [7], "cheapest", root)
    trace = read_jsonl(root / "episodes" / f"{late['id']}--seed-7" / "events.jsonl")
    trace[0]["data"]["hidden_outcome"] = "EVALUATOR_SECRET"
    exported = arena_export(trace)
    assert "EVALUATOR_SECRET" not in json.dumps(exported)
    assert exported["source"] == "synthetic"
    assert not exported["production_ranking_eligible"]
    assert exported["metrics"] == metrics(exported["events"])


def test_paired_statistics_are_episode_level():
    assert paired_interval([3]) == {"mean": 3, "ci95": None, "n": 1}
    assert paired_interval([10, 10, 10])["ci95"] == [10, 10]
    assert paired_interval([-1, 4, 8]) == paired_interval([-1, 4, 8])


def test_compare_requires_matching_seeds_and_declared_tracks(late, tmp_path):
    a, b, c = [tmp_path / name for name in "abc"]
    run_suite([late], [1, 2], "cheapest", a)
    run_suite([late], [1, 2], "expected-cost", b)
    result = compare(a, b)
    assert result["results"][late["id"]]["n"] == 2
    assert result["results"][late["id"]]["mean"] == 0
    run_suite([late], [1], "cheapest", c, track="diagnostic")
    with pytest.raises(ValueError, match="tracks"):
        compare(a, c)
    with pytest.raises(ValueError, match="Unmatched"):
        compare(a, c, allow_track_difference=True)


def test_explicit_mechanism_pairing(late, tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    run_suite([late], [1, 2], "naive-retry", a, track="diagnostic")
    run_suite(
        [intervention(late, "known-submission")], [1, 2], "naive-retry", b, track="diagnostic"
    )
    with pytest.raises(ValueError, match="Unmatched"):
        compare(a, b)
    result = compare(a, b, intervention=True)
    assert result["results"][late["world_id"]]["mean"] > 0


def test_cli_no_key_lifecycle(tmp_path):
    root = tmp_path / "cli"
    assert main(["run", "--scenario", "late-unknown-dev", "--out", str(root)]) == 0
    episode = root / "episodes/late-unknown-dev--seed-7"
    assert main(["verify", "--episode", str(episode)]) == 0
    assert main(["replay", "--trace", str(episode / "events.jsonl")]) == 0
    assert (
        main(
            [
                "export-arena",
                "--trace",
                str(episode / "events.jsonl"),
                "--out",
                str(tmp_path / "arena.json"),
            ]
        )
        == 0
    )
    assert main(["run", "--out", str(root)]) == 2


def test_entrypoint_from_outside_checkout(tmp_path):
    result = subprocess.run(
        [sys.executable, "-m", "aeb", "list"], cwd=tmp_path, capture_output=True, text=True
    )
    assert result.returncode == 0
    assert "risk-high-dev" in result.stdout


def test_cli_invalid_scenario_reports_contract_error(tmp_path, capsys):
    bad = tmp_path / "bad.json"
    bad.write_text('{"id": "malformed"}')
    assert main(["run", "--scenario", str(bad), "--out", str(tmp_path / "run")]) == 2
    assert "schema validation failed" in capsys.readouterr().err


def test_golden_traces():
    from aeb.policies import RulePolicy
    from aeb.runner import run_episode
    from aeb.scenarios import load_scenario

    paths = list((Path(__file__).parent / "golden").glob("*.jsonl"))
    assert len(paths) == 3
    for path in paths:
        golden = read_jsonl(path)
        head = golden[0]["data"]
        w, _, _ = run_episode(
            load_scenario(head["scenario_id"]),
            head["seed"],
            RulePolicy("naive-retry"),
            head["track"],
        )
        assert w.events == golden
