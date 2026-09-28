import pytest

from aeb.scenarios import load_scenario


@pytest.fixture
def late():
    return load_scenario("late-unknown-dev")


def select(world, provider=None, action_id="select"):
    obs = world.observation()
    quotes = obs["quotes"]
    if provider:
        quotes = [q for q in quotes if q["provider_id"] == world.aliases[provider]]
    quote = min(quotes, key=lambda q: (q["fee"], q["id"]))
    return {
        "actions": [
            {
                "actionId": action_id,
                "kind": "select",
                "jobId": quote["job_id"],
                "quoteId": quote["id"],
            }
        ]
    }


def action(kind, action_id="a", **kwargs):
    return {"actions": [dict(actionId=action_id, kind=kind, **kwargs)]}
