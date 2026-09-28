"""Run from an installed checkout: python examples/no_key_demo.py."""

from aeb.policies import RulePolicy
from aeb.runner import run_episode
from aeb.scenarios import load_scenario

for condition in ["known", "unknown"]:
    for track in ["guarded", "diagnostic"]:
        scenario = load_scenario(f"late-{condition}-dev")
        _, result, _ = run_episode(scenario, 7, RulePolicy("naive-retry"), track)
        print(
            f"{condition:7s} {track:10s} utility={result['utility']:5d} "
            f"blocked_or_unsafe_requests={result['duplicate_payment_requests']} "
            f"duplicate_payments={result['duplicate_payments']}"
        )
