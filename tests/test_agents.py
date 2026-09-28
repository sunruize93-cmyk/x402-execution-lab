import json
import sys

import pytest

from aeb.agents.process import BudgetExhausted, Limits, ProcessAgent
from aeb.environments import ExecutionMarket
from aeb.runner import run_suite


def agent(code, **limits):
    return ProcessAgent([sys.executable, "-c", code], Limits(**limits), "fixture-model", "test-v1")


GOOD = "import json; print(json.dumps({'actions': [], 'usage': {'input_tokens': 2, 'output_tokens': 1, 'usd_micros': 0}}))"


def test_agent_receives_only_observation(late):
    code = "import sys,json; r=json.load(sys.stdin); assert 'evaluator' not in r; " + GOOD
    p = agent(code)
    assert p.decide(ExecutionMarket(late).observation()) == {"actions": []}
    assert p.calls == 1
    assert p.tokens == 3
    assert p.last_record["usage_estimated"] is False


@pytest.mark.parametrize(
    "code,status",
    [
        ("print('not json')", "invalid_response"),
        ("print('[]')", "invalid_response"),
        ("raise SystemExit(1)", "process_error"),
        ("print('{\"actions\": []}')", "missing_usage"),
    ],
)
def test_model_failures_are_recorded_and_conservatively_budgeted(late, code, status):
    p = agent(code)
    result = p.decide(ExecutionMarket(late).observation())
    assert "invalid_model_response" in result
    assert p.last_record["adapter_status"] == status
    assert p.tokens == p.limits.per_call_tokens
    assert p.usd_micros == p.limits.per_call_usd_micros


def test_hard_timeout_without_retry(late):
    p = agent("import time; time.sleep(10)", timeout_seconds=0.05)
    p.decide(ExecutionMarket(late).observation())
    assert p.last_record["adapter_status"] == "timeout"
    assert p.calls == 1
    assert p.last_record["latency_seconds"] < 2


def test_global_dispatch_cap_keeps_stopped_epochs(late, tmp_path):
    p = agent(GOOD, max_calls=1)
    out = tmp_path / "run"
    run_suite([late], [1, 2], "process", out, agent=p)
    assert p.calls == 1
    manifest = json.loads((out / "manifest.json").read_text())
    assert not manifest["decision_coverage_complete"]
    record = json.loads(
        (out / "episodes" / f"{late['id']}--seed-1" / "decision_metrics.json").read_text()
    )
    assert record["stopped_epochs"] == 9
    with pytest.raises(BudgetExhausted):
        p.decide(ExecutionMarket(late).observation())


def test_unaffordable_call_is_not_dispatched(late):
    p = agent(GOOD, max_usd_micros=1)
    with pytest.raises(BudgetExhausted):
        p.decide(ExecutionMarket(late).observation())
    assert p.calls == 0


@pytest.mark.parametrize(
    "limits",
    [{"max_calls": -1}, {"per_call_tokens": 0}, {"timeout_seconds": 61}, {"max_tokens": True}],
)
def test_invalid_limits_rejected(limits):
    with pytest.raises(ValueError):
        Limits(**limits)


def test_nonfinite_model_output_is_rejected_and_saved(late, tmp_path):
    p = agent("print('{\"actions\": [NaN]}')", max_calls=1)
    out = tmp_path / "invalid-json"
    run_suite([late], [7], "process", out, agent=p)
    assert p.last_record["adapter_status"] == "invalid_response"
    result = json.loads((out / "episodes" / f"{late['id']}--seed-7" / "metrics.json").read_text())
    assert result["invalid_action_requests"] == 1
