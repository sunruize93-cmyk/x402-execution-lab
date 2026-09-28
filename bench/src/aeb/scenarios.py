from __future__ import annotations

import copy
import json
from importlib.resources import files
from pathlib import Path

from aeb.contracts import validate


def load_scenario(name: str) -> dict:
    path = Path(name)
    if path.is_file():
        scenario = json.loads(path.read_text())
    else:
        if not name.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Scenario name must be a bundled name or an existing JSON file")
        resource = files("aeb").joinpath(f"data/scenarios/{name}.json")
        if not resource.is_file():
            raise ValueError(f"Unknown scenario: {name}")
        scenario = json.loads(resource.read_text())
    validate_scenario(scenario)
    return scenario


def validate_scenario(s: dict) -> None:
    validate("scenario", s)
    for field in ("providers", "jobs"):
        ids = [item["id"] for item in s[field]]
        if len(set(ids)) != len(ids):
            raise ValueError(f"Duplicate {field} IDs")
    for p in s["providers"]:
        if p["network_cost"] > p["fee"]:
            raise ValueError("network_cost must not exceed fee in v0.1")
    for job in s["jobs"]:
        if job["arrival"] >= s["epochs"] or job["deadline"] < job["arrival"]:
            raise ValueError("Invalid job arrival/deadline")
        if not set(job["allowed_providers"]).issubset({p["id"] for p in s["providers"]}):
            raise ValueError("Unknown allowed provider")
    if any(h["provider_id"] not in {p["id"] for p in s["providers"]} for h in s["initial_history"]):
        raise ValueError("Unknown history provider")


def suite(name: str = "mechanism-v1", split: str = "dev") -> list[dict]:
    if name != "mechanism-v1":
        raise ValueError(f"Unknown suite: {name}")
    root = files("aeb").joinpath("data/scenarios")
    return sorted(
        [
            load_scenario(p.name[:-5])
            for p in root.iterdir()
            if p.name.endswith(".json") and load_scenario(p.name[:-5])["split"] == split
        ],
        key=lambda s: s["id"],
    )


def intervention(s: dict, name: str) -> dict:
    """Keep world_id and draws fixed while changing a declared mechanism."""
    s = copy.deepcopy(s)
    s["id"] += "--" + name
    if name == "immediate-confirmation":
        for p in s["providers"]:
            p["confirmation_delay"] = 0
            p["visibility_delay"] = 0
            p["unknown_ppm"] = 0
    elif name == "known-submission":
        for p in s["providers"]:
            p["unknown_ppm"] = 0
    elif name == "structured":
        s["representation"] = "structured"
    elif name == "events":
        s["representation"] = "events"
    elif name == "permuted":
        s["identity_salt"] = s.get("identity_salt", 0) + 1
    else:
        raise ValueError(f"Unknown intervention: {name}")
    return s
