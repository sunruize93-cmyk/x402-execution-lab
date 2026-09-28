"""One packaged, hash-locked copy of the provisional AEB contract.

No released execution-lab contract was supplied. This deliberately does not
claim conformance to x402, EVM, or an upstream Lab release.
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
