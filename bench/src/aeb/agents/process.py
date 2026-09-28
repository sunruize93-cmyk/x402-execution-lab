from __future__ import annotations

import json
import math
import os
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass

from aeb.util import canonical, digest


def _reject_nonfinite_constant(value: str):
    raise ValueError("Nonfinite constants are not valid JSON")


class BudgetExhausted(RuntimeError):
    pass


@dataclass
class Limits:
    max_calls: int = 10
    max_tokens: int = 100000
    max_usd_micros: int = 1000000
    per_call_tokens: int = 10000
    per_call_usd_micros: int = 100000
    timeout_seconds: float = 60
    episode_seconds: float = 900

    def __post_init__(self):
        for name in [
            "max_calls",
            "max_tokens",
            "max_usd_micros",
            "per_call_tokens",
            "per_call_usd_micros",
        ]:
            if type(getattr(self, name)) is not int or getattr(self, name) < 1:
                raise ValueError(f"{name} must be a positive integer")
        if not (0 < self.timeout_seconds <= 60 and 0 < self.episode_seconds <= 900):
            raise ValueError("Timeouts must be in (0,60] and (0,900] seconds")


class ProcessAgent:
    """One JSON input/output process per epoch, no retries or shell execution.

    The adapter must enforce provider-side per-call caps. These limits stop
    dispatch locally; they cannot cancel billing already accepted by a vendor.
    A timeout or missing usage is conservatively charged the full reservation.
    """

    def __init__(self, command: list[str], limits: Limits, model: str, prompt_version: str):
        if os.name != "posix":
            raise ValueError("Process adapters require POSIX process-group support")
        if (
            not isinstance(command, list)
            or not command
            or not all(isinstance(x, str) and x for x in command)
        ):
            raise ValueError("agent command must be a nonempty argument list")
        self.command, self.limits = command, limits
        self.model, self.prompt_version = model, prompt_version
        self.calls = self.tokens = self.usd_micros = 0
        self.halted = False
        self.episode_started = time.monotonic()
        self.last_record: dict = {}

    def start_episode(self):
        self.episode_started = time.monotonic()

    def decide(self, observation: dict) -> dict:
        limit = self.limits
        remaining_time = limit.episode_seconds - (time.monotonic() - self.episode_started)
        if (
            self.halted
            or self.calls >= limit.max_calls
            or self.tokens + limit.per_call_tokens > limit.max_tokens
            or self.usd_micros + limit.per_call_usd_micros > limit.max_usd_micros
            or remaining_time <= 0
        ):
            raise BudgetExhausted("Model dispatch limit reached; no automatic budget increase")
        self.calls += 1
        started = time.monotonic()
        request = {
            "observation": observation,
            "model": self.model,
            "prompt_version": self.prompt_version,
            "limits": {
                "max_tokens": limit.per_call_tokens,
                "max_usd_micros": limit.per_call_usd_micros,
            },
        }
        # A bounded file read avoids retaining arbitrarily large model output in RAM.
        with tempfile.TemporaryDirectory(prefix="aeb-agent-") as tmp:
            with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                status, raw, response = "ok", b"", {}
                proc = None
                try:
                    proc = subprocess.Popen(
                        self.command,
                        stdin=subprocess.PIPE,
                        stdout=output,
                        stderr=errors,
                        cwd=tmp,
                        start_new_session=True,
                    )
                    proc.communicate(
                        canonical(request).encode(),
                        timeout=min(limit.timeout_seconds, remaining_time),
                    )
                    if proc.returncode:
                        status = "process_error"
                    output.seek(0)
                    raw = output.read(1048577)
                    if len(raw) > 1048576:
                        status = "response_too_large"
                    elif status == "ok":
                        response = json.loads(raw, parse_constant=_reject_nonfinite_constant)
                        if not isinstance(response, dict):
                            status = "invalid_response"
                            response = {}
                except subprocess.TimeoutExpired:
                    status = "timeout"
                    if proc is not None:
                        try:
                            os.killpg(proc.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass  # exited between the timeout and termination
                        proc.communicate()
                except (OSError, ValueError, UnicodeError):
                    status = "invalid_response"
        usage = response.get("usage", {}) if status == "ok" else {}
        good_usage = isinstance(usage, dict) and all(
            type(usage.get(k)) is int and usage[k] >= 0
            for k in ["input_tokens", "output_tokens", "usd_micros"]
        )
        if good_usage:
            tokens = usage["input_tokens"] + usage["output_tokens"]
            cost = usage["usd_micros"]
            if tokens > limit.per_call_tokens or cost > limit.per_call_usd_micros:
                status, self.halted = "usage_exceeded_declared_cap", True
        else:
            tokens, cost = limit.per_call_tokens, limit.per_call_usd_micros
            if status == "ok":
                status = "missing_usage"
        self.tokens += tokens
        self.usd_micros += cost
        self.last_record = {
            "adapter_status": status,
            "model": self.model,
            "prompt_version": self.prompt_version,
            "response_digest": digest(raw.hex()),
            "latency_seconds": time.monotonic() - started,
            "usage": usage if good_usage else None,
            "usage_estimated": not good_usage,
            "accounted_tokens": tokens,
            "accounted_usd_micros": cost,
        }
        if not math.isfinite(self.last_record["latency_seconds"]):
            raise AssertionError("Nonfinite timing")
        # Errors consume one decision opportunity, with no hidden repair/retry.
        return (
            {"actions": response["actions"]}
            if status == "ok" and "actions" in response
            else {"invalid_model_response": True}
        )
