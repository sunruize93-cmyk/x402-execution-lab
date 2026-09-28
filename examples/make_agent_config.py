"""Create a runnable, no-key transport config with absolute executable paths."""

import json
import sys
from pathlib import Path

config = {
    "command": [sys.executable, str(Path(__file__).with_name("mock_model.py").resolve())],
    "model": "offline-rule-fixture",
    "prompt_version": "aeb-buyer-v1",
    "limits": {
        "max_calls": 10,
        "max_tokens": 100000,
        "max_usd_micros": 1000000,
        "per_call_tokens": 10000,
        "per_call_usd_micros": 100000,
        "timeout_seconds": 60,
        "episode_seconds": 900,
    },
}
print(json.dumps(config, indent=2))
