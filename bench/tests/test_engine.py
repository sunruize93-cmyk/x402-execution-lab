import copy

import pytest
from conftest import action, select

from aeb.engine.ledger import Ledger
from aeb.environments import ExecutionMarket
from aeb.evaluation.metrics import metrics
from aeb.observations.projection import project
from aeb.policies import RulePolicy
from aeb.runner import run_episode
from aeb.scenarios import intervention, load_scenario, suite


def test_ledger_atomic_and_conserved():
    ledger = Ledger(100)
    ledger.transfer("buyer.available", "buyer.reserved", 70, "reserve")
    before = dict(ledger.balances)
    with pytest.raises(ValueError):
        ledger.transfer("buyer.available", "merchant.available", 31, "bad")
    assert dict(ledger.balances) == before
    with pytest.raises(ValueError):
        ledger.apply({"postings": [{"account": "buyer.available", "delta": 10}]})
    with pytest.raises(ValueError):
        ledger.transfer("buyer.available", "buyer.reserved", True, "bad")
    assert ledger.buyer() == dict(available=30, reserved=70, spent=0, receivable=0)


def test_unknown_does_not_release_or_expose_hidden_confirmation(late):
    w = ExecutionMarket(late, 7)
    w.step(select(w))
    assert w.observation()["ledger"] == dict(available=2180, reserved=320, spent=0, receivable=0)
    w.step(action("wait"))  # actual chain confirmed at epoch 2, disclosure at 4
    assert w.ledger.buyer()["spent"] == 320
    assert w.observation()["ledger"]["reserved"] == 320
    assert w.observation()["attempts"][0]["status"] == "submission_unknown"
    w.step(action("query", "query", attemptId="attempt-1"))
    assert w.observation()["ledger"]["reserved"] == 0
    assert w.observation()["ledger"]["spent"] == 320


def test_pre_submission_rejection_charges_nothing(late):
    for p in late["providers"]:
        p["rejection_ppm"] = 1000000
    w = ExecutionMarket(late)
    w.step(select(w))
    assert w.observation()["ledger"]["available"] == late["budget"]
    assert len(w.attempts) == 0
    assert any(e["type"] == "submission_rejected" for e in w.events)


@pytest.mark.parametrize("rule,fee", [("on_submission", 20), ("on_success", 0)])
def test_revert_fee_contract(late, rule, fee):
    late["fee_rule"] = rule
    for p in late["providers"]:
        p["failure_ppm"] = 1000000
    w = ExecutionMarket(late)
    w.step(select(w))
    w.finish()
    m = metrics(w.events)
    assert m["execution_fees"] == fee
    assert m["service_payments"] == 0
    assert m["buyer"]["available"] == late["budget"] - fee


def test_refund_is_receivable_until_evidence(late):
    for p in late["providers"]:
        p.update(service_failure_ppm=1000000, refund_delay=3, visibility_delay=0)
    w = ExecutionMarket(late)
    w.step(select(w))
    w.advance(2)
    assert w.observation()["ledger"] == dict(available=2180, reserved=0, spent=320, receivable=300)
    w.advance(5)
    assert w.observation()["ledger"] == dict(available=2480, reserved=0, spent=20, receivable=0)
    w.finish()
    assert metrics(w.events)["refunds"] == 300


@pytest.mark.parametrize("track,duplicates", [("guarded", 0), ("diagnostic", 1)])
def test_new_authorization_has_track_specific_effect(late, track, duplicates):
    w = ExecutionMarket(late, 0, track)
    w.step(select(w))
    w.step(action("retry", attemptId="attempt-1", retryMode="new_authorization"))
    w.finish()
    m = metrics(w.events)
    assert m["duplicate_payment_requests"] == 1
    assert m["duplicate_payments"] == duplicates
    assert m["dangerous_retries_allowed"] == duplicates


@pytest.mark.parametrize("track", ["guarded", "diagnostic"])
def test_rebroadcast_is_idempotent(late, track):
    w = ExecutionMarket(late, 0, track)
    w.step(select(w))
    for i in range(5):
        w.step(action("retry", str(i), attemptId="attempt-1", retryMode="rebroadcast"))
    w.finish()
    m = metrics(w.events)
    assert m["service_payments"] == 300
    assert m["execution_fees"] == 20
    assert len(w.attempts) == 1


@pytest.mark.parametrize("track", ["guarded", "diagnostic"])
def test_budget_guard_applies_to_both_tracks(late, track):
    late["budget"] = 319
    w = ExecutionMarket(late, 0, track)
    w.step(select(w))
    w.finish()
    assert metrics(w.events)["budget_violation_requests"] == 1
    assert w.ledger.buyer()["available"] == 319


@pytest.mark.parametrize("bad", [{}, {"actions": [{"kind": "buy"}]}, {"actions": "wait"}, None])
def test_invalid_input_consumes_one_epoch(late, bad):
    w = ExecutionMarket(late)
    w.step(bad)
    assert w.clock.epoch == 1
    assert w.events[-1]["data"]["reason"] == "invalid_action_schema"


def test_duplicate_action_id_is_rejected(late):
    w = ExecutionMarket(late)
    w.step(action("wait"))
    w.step(action("wait"))
    assert w.events[-1]["data"]["reason"] == "duplicate_action_id"


def test_expired_job_does_not_release_live_authorization(late):
    late["jobs"][0]["deadline"] = 0
    w = ExecutionMarket(late)
    w.step(select(w))
    assert w.observation()["ledger"]["reserved"] == 320
    assert not w.observation()["quotes"]
    w.finish()
    assert metrics(w.events)["delay_cost"] == 20


def test_drain_censoring_is_explicit(late):
    for p in late["providers"]:
        p["visibility_delay"] = 100
    w = ExecutionMarket(late)
    w.step(select(w))
    w.finish()
    m = metrics(w.events)
    assert m["pending_attempts"] == 1
    assert m["buyer"]["reserved"] == 320
    assert not m["complete_outcome_coverage"]
    with pytest.raises(ValueError):
        w.step(action("wait"))


def test_no_double_failure_penalty(late):
    late["jobs"][0]["failure_cost"] = 71
    for p in late["providers"]:
        p["failure_ppm"] = 1000000
    w = ExecutionMarket(late)
    w.step(select(w))
    w.finish()
    assert metrics(w.events)["utility"] == -20 - 71


def test_hidden_parameters_cannot_enter_observation(late):
    late["knowledge"] = "hidden"
    altered = copy.deepcopy(late)
    for p in altered["providers"]:
        p["failure_ppm"] = 998877
        p["service_failure_ppm"] = 334455
    assert ExecutionMarket(late).observation() == ExecutionMarket(altered).observation()


def test_future_job_visibility(late):
    late["jobs"].append(dict(late["jobs"][0], id="secret_future", arrival=3))
    late["future_jobs_visible"] = False
    obs = ExecutionMarket(late).observation()
    assert "secret_future" not in str(obs)


@pytest.mark.parametrize("scenario", [s["id"] for s in suite()])
def test_rng_and_accounting_invariants_across_seeds(scenario):
    s = load_scenario(scenario)
    for seed in range(6):
        w, m, _ = run_episode(s, seed, RulePolicy("cheapest"))
        w2, m2, _ = run_episode(s, seed, RulePolicy("cheapest"))
        assert w.events == w2.events
        assert w.evaluator == w2.evaluator
        assert m == m2
        assert sum(w.ledger.balances.values()) == s["budget"]
        assert min(w.ledger.balances.values()) >= 0
        assert project(w.events)["ledger"] == w.ledger.buyer()
        assert m["duplicate_payments"] == 0


def test_unused_random_draws_do_not_advance_world(late):
    a, b = ExecutionMarket(late, 3), ExecutionMarket(late, 3)
    for i in range(100):
        a._draw("other-job", "other-provider", i, "noise")
    a.step(select(a))
    b.step(select(b))
    a.finish()
    b.finish()
    assert a.events == b.events


def test_provider_permutation_preserves_economic_outcomes(late):
    a, ma, _ = run_episode(late, 3, RulePolicy("expected-cost"))
    b, mb, _ = run_episode(intervention(late, "permuted"), 3, RulePolicy("expected-cost"))
    assert ma["utility"] == mb["utility"]
    assert a.attempts["attempt-1"]["success"] == b.attempts["attempt-1"]["success"]
