"""Opt-in HTTPS Chat Completions wrapper, invoked only through ProcessAgent.

Required environment variables: AEB_CHAT_URL (full /chat/completions URL),
AEB_API_KEY, AEB_INPUT_USD_PER_MILLION, AEB_OUTPUT_USD_PER_MILLION.
Prices are user-supplied; this script does not assume a vendor's current price.
No requests are made by importing the module. No automatic retries/redirects.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from decimal import ROUND_CEILING, Decimal

SYSTEM = """You are a buyer in an offline synthetic procurement market.
Maximize delivered service value minus actual payments, fees, and the explicit
delay/failure/non-execution costs. Keep budgets feasible. Unknown submission
is not failed execution; rebroadcast reuses an authorization, while a new
authorization can pay twice. Use only the supplied observation. Choose one
batch per epoch following action_schema. Return exactly {"actions": [...]}.
Do not return hidden reasoning, markdown or extra fields."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    request = json.load(sys.stdin)
    endpoint = os.environ["AEB_CHAT_URL"]
    url = urllib.parse.urlsplit(endpoint)
    if url.username or url.password or url.query or url.fragment:
        raise ValueError("Endpoint must not contain credentials, query or fragment")
    if url.scheme != "https" and not (
        url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ValueError("Use HTTPS, or a loopback HTTP model server")
    rates = [Decimal(os.environ[f"AEB_{kind}_USD_PER_MILLION"]) for kind in ["INPUT", "OUTPUT"]]
    if any(not r.is_finite() or r < 0 for r in rates):
        raise ValueError("Supply finite nonnegative current token prices")
    prompt = json.dumps(request["observation"], separators=(",", ":"))
    # Conservative byte-level input allowance for byte-based tokenizers plus
    # message overhead. Providers with other tokenizers need their own adapter.
    input_bound = len((SYSTEM + prompt).encode()) + 2048
    output_bound = min(1024, request["limits"]["max_tokens"] - input_bound)
    if output_bound < 1:
        raise ValueError("Observation exceeds the configured conservative token reservation")
    upper_cost = rates[0] * input_bound + rates[1] * output_bound
    if upper_cost > request["limits"]["max_usd_micros"]:
        raise ValueError("Request exceeds the declared per-call price reservation")
    payload = {
        "model": request["model"],
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        "max_completion_tokens": output_bound,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + os.environ["AEB_API_KEY"],
        },
    )
    with urllib.request.build_opener(NoRedirect).open(req, timeout=55) as response:
        body = response.read(1048577)
    if len(body) > 1048576:
        raise ValueError("Oversized provider response")
    answer = json.loads(body)
    action = json.loads(answer["choices"][0]["message"]["content"])
    if not isinstance(action, dict) or set(action) != {"actions"}:
        raise ValueError("Model response must match the batch envelope without extra fields")
    usage = answer["usage"]
    inputs, outputs = usage["prompt_tokens"], usage["completion_tokens"]
    if type(inputs) is not int or type(outputs) is not int or min(inputs, outputs) < 0:
        raise ValueError("Provider did not report valid token usage")
    cost = int((rates[0] * inputs + rates[1] * outputs).to_integral_value(rounding=ROUND_CEILING))
    print(
        json.dumps(
            {
                "actions": action["actions"],
                "usage": {"input_tokens": inputs, "output_tokens": outputs, "usd_micros": cost},
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Transport records failure and reserves full cost; do not print request
        # headers, credentials, server response bodies, or provider error text.
        print("Model adapter failed", file=sys.stderr)
        raise SystemExit(1) from None
