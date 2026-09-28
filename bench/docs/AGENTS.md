# Agent adapter interface

## Structured protocol

A policy receives only the observation dictionary and returns a batch matching the packaged action schema. Observation fields include episode ID, epoch, visible jobs/quotes, optional disclosed future jobs, buyer budget knowledge, public history, initial public provider history, and the action schema. Provider identities and quote order are permuted. Hidden failure probabilities become `null`; hidden outcomes and random draws are never supplied.

```json
{"actions": [{"actionId": "e0-buy", "kind": "select", "jobId": "purchase", "quoteId": "purchase:provider-1"}]}
```

Quote and attempt IDs must come from the observation. A short `reason` of at most 256 characters is optional. Internal reasoning is neither requested nor scored. Actions and results determine metrics.

The process adapter starts a new executable for each epoch, passes one JSON request on standard input, and expects one JSON response on standard output. It uses an argument list, no shell. Each child runs in a fresh temporary directory. Absolute paths to the Python executable and script avoid dependence on the caller's directory.

```json
{
  "actions": [],
  "usage": {"input_tokens": 1234, "output_tokens": 80, "usd_micros": 2500}
}
```

The request wraps the observation with `model`, `prompt_version`, and `limits`. One USD equals 1,000,000 `usd_micros`. Stderr is not persisted, preventing provider errors or credential echoes from being copied into artifacts. Valid actions, an output digest, parse status, usage, latency and error status are recorded. Malformed output is not silently repaired and no automatic retry occurs. Raw failed output is represented by a digest, not copied into public events.

## No-key transport demo

```bash
python examples/make_agent_config.py > /tmp/aeb-mock-config.json
aeb run --scenario late-unknown-dev --policy process \
  --agent-config /tmp/aeb-mock-config.json --out runs/mock-model
```

This fixture runs the expected-cost rule over the model transport with zero tokens/cost. It is not an LLM result. The subprocess adapter currently requires POSIX process-group termination; the default Python simulator and rule policies do not have that restriction.

## Connect a model explicitly

Use [chat_completions_agent.py](../examples/chat_completions_agent.py) as the command script in a copy of the generated config. Set `model` to the exact deployed model ID and `prompt_version` to the prompt version you are testing. Keep the Python executable and script paths absolute. This example follows the [Chat Completions request and usage interface](https://developers.openai.com/api/reference/resources/chat); compatible servers must accept `max_completion_tokens` and return prompt/completion token counts. Other providers can implement the same small process interface.

Provide `AEB_CHAT_URL` as the full endpoint, `AEB_API_KEY` through your environment, and current `AEB_INPUT_USD_PER_MILLION` and `AEB_OUTPUT_USD_PER_MILLION` prices. The script requires HTTPS except for loopback local servers and refuses redirects. API keys are never placed in scenarios, commands, manifests or traces. No real endpoint is contacted by installation, tests, default examples, or the reproduction script.

The included wrapper uses a conservative byte-based input-token bound plus message overhead, reserves at most 1024 output tokens, and refuses a call that exceeds its declared token/cost reservation. This assumes a byte-based tokenizer and token-only billing; other tokenizers, tool fees or service charges require a provider-specific bound. The price inputs are caller-supplied, not fetched or assumed current. Freeze them alongside the model configuration when publishing a model experiment. Real vendor compatibility and paid-model quality were not tested for this release.

## Dispatch limits

| Limit | Default | Behavior |
| --- | ---: | --- |
| Model calls per run | 10 | Shared across all seeds and scenarios |
| Accounted tokens per run | 100,000 | Reserve `per_call_tokens` before dispatch |
| Accounted cost per run | 1,000,000 micro-USD | Reserve `per_call_usd_micros` before dispatch |
| Per-call reservation | 10,000 tokens; 100,000 micro-USD | Must cover the wrapper's request cap |
| Call timeout | 60 seconds | Kill the process group; do not retry |
| Episode dispatch time | 900 seconds | Stop new calls; continue finite simulation/drain with empty actions |

Timeouts and missing usage consume the full declared reservation. Valid reported usage consumes its reported tokens and cost. An adapter reporting above its cap is recorded and halted; the violation is not hidden. A process wrapper is trusted code and must actually enforce the provider-side bounds. Local termination cannot cancel vendor billing already accepted. The system controls dispatch and conservative accounting, not an external provider's billing ledger.

When limits stop dispatch, remaining epochs stay in `decisions.jsonl` with `dispatch_stopped`, and the manifest sets `decision_coverage_complete=false`. Such runs cannot enter the ordinary paired comparison. Invalid model responses are retained as failed decision opportunities and do not remove the episode. No automatic budget expansion, model substitution or recovery loop exists.

## Artifacts and recovery

Every epoch writes an atomic replacement of public events, private evaluator records, decisions and the checkpoint. Completed episodes also have public metrics and decision-usage metrics. The checkpoint is evaluator-only. `aeb verify` restores the deterministic execution by replaying saved actions; it does not restore a model process or make additional model calls. A killed/interrupted run stays explicitly incomplete; automatic paid resumption is not implemented.

The observation boundary prevents accidental prompt leakage; it is not an OS sandbox. An untrusted executable could access files or inherited environment variables under the current OS user. Use a separate container/account with only the public JSON interface when evaluating adversarial executables. This repository never grants a process adapter wallet authority.
