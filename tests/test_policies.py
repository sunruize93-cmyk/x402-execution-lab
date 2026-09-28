import pytest

from aeb.environments import ExecutionMarket
from aeb.observations.projection import normalized
from aeb.policies import RulePolicy
from aeb.policies.baselines import exact_choice, expected_utility, posterior
from aeb.runner import run_episode
from aeb.scenarios import intervention, load_scenario


@pytest.mark.parametrize("label,provider", [("low", "cheap"), ("high", "balanced")])
def test_hand_calculated_risk_threshold(label, provider):
    w = ExecutionMarket(load_scenario(f"risk-{label}-dev"), 7)
    obs = w.observation()
    job = obs["jobs"][0]
    utilities = {
        w.reverse_aliases[q["provider_id"]]: expected_utility(job, q, 0, "on_submission")
        for q in obs["quotes"]
    }
    assert utilities["cheap"] == pytest.approx(-400 - 0.1 * job["failure_cost"])
    assert utilities["balanced"] == pytest.approx(-420 - 0.001 * job["failure_cost"])
    decision = RulePolicy("expected-cost").decide(obs)["actions"][0]
    assert decision["quoteId"].endswith(w.aliases[provider])


def test_liquidity_only_changes_later_opportunity():
    outcomes = {}
    for condition in ["released", "locked"]:
        s = load_scenario(f"liquidity-{condition}-dev")
        _, outcomes[condition], _ = run_episode(s, 7, RulePolicy("cheapest"))
    assert outcomes["released"]["utility"] == 770
    assert outcomes["locked"]["utility"] == -10
    s = load_scenario("liquidity-locked-dev")
    _, aware, _ = run_episode(s, 7, RulePolicy("budget-aware"))
    assert aware["utility"] == 680


def test_representation_has_equal_information(late):
    a, b = ExecutionMarket(late), ExecutionMarket(intervention(late, "events"))
    for _ in range(late["epochs"]):
        left, right = a.observation(), b.observation()
        assert normalized(left)["jobs"] == normalized(right)["jobs"]
        assert normalized(left)["attempts"] == normalized(right)["attempts"]
        pa, pb = RulePolicy().decide(left), RulePolicy().decide(right)
        assert pa == pb
        a.step(pa)
        b.step(pb)


def test_posterior_uses_equal_visible_history():
    s = load_scenario("mixed-hidden-dev")
    w = ExecutionMarket(s)
    for alias in w.aliases.values():
        assert posterior(w.observation(), alias) == (2, 3)


def test_dp_matches_hand_enumerated_retry_choice(late):
    late["epochs"] = 2
    late["jobs"][0].update(amount=10, value=30, failure_cost=5)
    late["budget"] = 20
    late["providers"] = [
        dict(
            late["providers"][0],
            fee=2,
            network_cost=1,
            failure_ppm=500000,
            unknown_ppm=0,
            confirmation_delay=0,
            visibility_delay=0,
        )
    ]
    w = ExecutionMarket(late)
    obs = w.observation()
    # Stop=-0; one attempt E=0.5*(30-10-2)+0.5*(-2-5)=5.5.
    # Retry improves E to 0.5*18+0.5*(-2+5.5)=10.75, so select.
    assert exact_choice(obs, obs["jobs"][0], obs["quotes"], False) == obs["quotes"][0]["id"]
    late["jobs"][0]["value"] = 0
    obs = ExecutionMarket(late).observation()
    assert exact_choice(obs, obs["jobs"][0], obs["quotes"], False) is None


def test_dp_rejects_unmodeled_async_world(late):
    with pytest.raises(ValueError, match="immediate"):
        RulePolicy("exact-dp").decide(ExecutionMarket(late).observation())
