"""Exercise the optional model HTTP wrapper against a local fake server only."""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from aeb.agents.process import Limits, ProcessAgent
from aeb.environments import ExecutionMarket


@pytest.mark.parametrize(
    "response_mode,status",
    [("valid", "ok"), ("invalid", "process_error"), ("redirect", "process_error")],
)
def test_chat_wrapper_local_protocol(monkeypatch, late, response_mode, status):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            requests.append(json.loads(body))
            if response_mode == "redirect":
                self.send_response(302)
                self.send_header("Location", "/redirect-target")
                self.end_headers()
                return
            content = (
                '{"actions": []}' if response_mode == "valid" else '{"actions": [], "extra": true}'
            )
            result = {
                "choices": [{"message": {"content": content}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 2},
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        monkeypatch.setenv(
            "AEB_CHAT_URL", f"http://127.0.0.1:{server.server_port}/chat/completions"
        )
        monkeypatch.setenv("AEB_API_KEY", "local-test-placeholder")
        monkeypatch.setenv("AEB_INPUT_USD_PER_MILLION", "1")
        monkeypatch.setenv("AEB_OUTPUT_USD_PER_MILLION", "2")
        script = Path(__file__).resolve().parents[1] / "examples/chat_completions_agent.py"
        agent = ProcessAgent(
            [sys.executable, str(script)],
            Limits(per_call_tokens=100000),
            "fake-local-model",
            "aeb-buyer-v1",
        )
        agent.decide(ExecutionMarket(late).observation())
        assert agent.last_record["adapter_status"] == status
        assert len(requests) == 1  # no repair retry or redirect following
        assert requests[0]["max_completion_tokens"] <= 1024
        assert "evaluator" not in requests[0]["messages"][1]["content"]
        if status == "ok":
            assert agent.usd_micros == 14
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
