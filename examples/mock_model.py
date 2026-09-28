"""Offline fixture for the model transport. This is not an LLM experiment."""

import json
import sys

from aeb.policies import RulePolicy

request = json.load(sys.stdin)
response = RulePolicy("expected-cost").decide(request["observation"])
response["usage"] = {"input_tokens": 0, "output_tokens": 0, "usd_micros": 0}
print(json.dumps(response))
