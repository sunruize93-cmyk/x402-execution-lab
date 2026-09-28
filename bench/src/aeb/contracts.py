"""One packaged, hash-locked copy of the provisional AEB contract.

The original synthetic contract is retained after the monorepo migration.
It remains separate from the sibling execution trace schema and does not
claim conformance to x402 or EVM payment authorization.
"""

import hashlib
import json
from importlib.resources import files

from jsonschema import Draft202012Validator

from aeb.util import digest

SCHEMA = json.loads(files("aeb").joinpath("data/contracts/aeb-v0.1.json").read_text())
SCHEMA_DIGEST = digest(SCHEMA)
_LOCK = json.loads(files("aeb").joinpath("data/contracts/lock.json").read_text())
if (
    hashlib.sha256(files("aeb").joinpath("data/contracts/aeb-v0.1.json").read_bytes()).hexdigest()
    != _LOCK["sha256"]
):
    raise RuntimeError("Packaged contract hash does not match lock.json")


def validate(kind: str, value: object) -> None:
    schema = {"$schema": SCHEMA["$schema"], "$defs": SCHEMA["$defs"], "$ref": f"#/$defs/{kind}"}
    Draft202012Validator(schema).validate(value)
