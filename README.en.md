# Arena Execution Bench

[![CI](https://github.com/sunruize93-cmyk/arena-execution-bench/actions/workflows/ci.yml/badge.svg)](https://github.com/sunruize93-cmyk/arena-execution-bench/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[中文首页](README.md) · [Quick start](#start-in-one-minute) · [Examples](examples/no_key_demo.py) · [Download](https://github.com/sunruize93-cmyk/arena-execution-bench/releases)

**Before your agent spends real money, test it with simulated money.**

AEB is a local sandbox for **AI agent payment decisions**. Simulate delayed confirmations, compare fees against failure risk, and see what happens when a budget is tied up. Run a policy, inspect its results, and replay every simulated transaction.

**The built-in demo needs no wallet, chain node, GPU, or model API key.**

## Why I built it

An agent can complete a purchase and still mishandle a missing confirmation or an unavailable balance. Testing those cases takes a simulator, accounting rules, and reproducible inputs. I wanted to share that setup so other developers can spend their time testing their policies.

The goal is a useful contribution to the agent tooling community: something you can run, adapt, and improve with a concrete failure case.

## What can you test?

| Your question | What AEB gives you |
| --- | --- |
| Will a retry pay twice? | Known/unknown confirmation scenarios; compare guards and deliberately unsafe retries |
| Is the cheapest provider worth it? | Configurable fees and failure probabilities; compare choices and net utility |
| Can the agent afford its next job? | Explicit available/reserved balances and delayed fund release |
| Did my policy improve? | Shared scenarios/seeds, built-in baselines, saved traces and paired comparisons |

Useful for developers building agents that purchase services or call paid tools, teams prototyping payment integrations, and researchers who need controlled decision experiments. Use the built-in rules or connect your own model through the [agent interface](docs/AGENTS.md).

## Start in one minute

```bash
git clone https://github.com/sunruize93-cmyk/arena-execution-bench.git
cd arena-execution-bench
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'

aeb run --suite mechanism-v1 --policy expected-cost --seed 7 --out runs/first
aeb replay --trace runs/first/episodes/late-unknown-dev--seed-7/events.jsonl
aeb verify --episode runs/first/episodes/late-unknown-dev--seed-7
python examples/no_key_demo.py
```

On Windows, activate with `.venv\Scripts\Activate.ps1`. The simulator is portable; the optional process adapter currently targets POSIX systems for process-group termination. PyPI publication is not required; install from this repository or a built wheel.

## The first experiment

Keep prices, jobs, actual confirmation times and random draws identical. Change the observed submission label from `submitted` to `submission_unknown`. A deliberately unsafe `naive-retry` policy issues a fresh authorization on unknown status.

| Observation | Track | Utility, seed 7 | Duplicate payments |
| --- | --- | ---: | ---: |
| Known submission | Guarded | 380 | 0 |
| Unknown submission | Guarded | 380 | 0 |
| Known submission | Diagnostic | 380 | 0 |
| Unknown submission | Diagnostic | -1540 | 6 |

The unsafe rule keeps retrying while any unknown attempt remains, including after another attempt has delivered. This fixture verifies the consequence of that bug; it is not a measurement of LLM behavior. Both tracks always enforce nonnegative cash balances. Diagnostic relaxes only the new-authorization guard, inside the simulator.

Reproduce the table with `python examples/no_key_demo.py`. See [the experiment definitions](docs/EXPERIMENTS.md) and [checked development results](artifacts/mechanism-v1/README.md).

## Included

| Component | v0.1 behavior |
| --- | --- |
| Engine | Integer double-entry cash accounts, stable event queue, virtual time, fixed drain horizon |
| State | Separate hidden settlement and public evidence; unknown is distinct from failed |
| Contracts | Validated observations/actions/scenarios, packaged schema with a SHA-256 lock |
| Scenarios | Risk threshold, late confirmation, liquidity, mixed procurement; 8 conditions in each of train/dev/eval |
| Policies | Cheapest, fastest, expected utility, Bayesian posterior mean, Thompson sampling, budget-aware threshold, unsafe retry fixture |
| Exact reference | Finite-horizon DP for one public, immediate-outcome job; unsupported worlds are rejected |
| Evaluation | Net utility, on-time delivery, duplicate/budget requests and effects, fees, lock duration, recovery, censoring, tails |
| Reproduction | Saved observations/actions, public/evaluator traces, checkpoints, deterministic replay, episode-level bootstrap |
| Model adapter | Optional JSON process interface, HTTPS Chat Completions example, explicit dispatch caps and failure accounting |
| Arena handoff | Allowlisted file export marked synthetic, with production ranking eligibility disabled |

The action vocabulary is `select`, `wait`, `query`, `reject`, and `retry`. Retry explicitly distinguishes `rebroadcast` from `new_authorization`. One batch is requested per decision epoch. Invalid input consumes an epoch and produces a rejection event.

## Compare policies

```bash
aeb run --policy cheapest --seeds 0,1,2,3,4,5 --out runs/cheap
aeb run --policy expected-cost --seeds 0,1,2,3,4,5 --out runs/expected
aeb compare --runs runs/cheap runs/expected --paired-by seed --out runs/comparison
python scripts/reproduce.py --out runs/reproduction
```

Comparisons pair independent episodes by scenario and seed, never individual jobs. They reject missing pairs, changed scenarios, incompatible engines and model runs stopped by dispatch caps. Explicit flags permit mechanism or track comparisons. The signed baseline utility gap is not a clairvoyant oracle regret.

## How it fits together

```mermaid
flowchart TD
    S[Versioned scenario + seed] --> W[Discrete-event world]
    W --> F[Public evidence projection]
    F --> P[Rule policy or optional model]
    P --> G[Action schema + authorization and budget guards]
    G --> W
    W --> L[Conserved integer ledger]
    F --> T[Public trace + metrics + Arena file export]
    W --> E[Private evaluator trace + checkpoint]
```

Arena402 is an optional replay host. This repository does not contain Arena identity, wallets, Runtime, Connector, admin pages, or a second product frontend. Arena-owned APIs must ingest and project the public file before serving it to the website.

## Extend or inspect

- [Economic and execution semantics](docs/SEMANTICS.md): fees, utility, public evidence, and censoring.
- [Experiment protocol](docs/EXPERIMENTS.md): thresholds, causal pairs, splits, and statistical scope.
- [Agent interface](docs/AGENTS.md): implement an adapter and control calls, tokens, time, and estimated spend.
- [Arena export and contract status](docs/INTEGRATION.md): public handoff, provisional schema, upstream migration.
- [Contributing](CONTRIBUTING.md) and [security boundaries](SECURITY.md).

```bash
pytest -q
ruff check src tests scripts examples
python scripts/check_docs.py
python -m build
```

The standalone wheel bundles all scenarios and the schema. To create a custom scenario, copy a JSON file from [the scenario directory](src/aeb/data/scenarios), change the declared parameters, and pass its path through `aeb run --scenario`. The owned generator is [generate_assets.py](scripts/generate_assets.py).

## Research and protocol boundaries

[Magentic Marketplace](https://github.com/microsoft/multi-agent-marketplace) already provides an environment for studying agentic markets and economic outcomes. AEB isolates payment-state uncertainty and liquidity with a smaller, controlled simulator. Whether these mechanisms justify a distinct research benchmark remains an empirical question; this release makes no first-of-its-kind claim.

No released execution-lab schema was available for this implementation. AEB therefore labels its schema `aeb-provisional-0.1`; it does not claim x402 or upstream Lab conformance. Buyer-paid execution fees are a synthetic contract, not a statement about vanilla x402 payment paths. The only supported fee payer in v0.1 is the buyer, with submission-charged or success-charged fees.

Version 0.1.0 is a synthetic simulator. No paid LLM pilot, real-provider evaluation, or production Arena integration is claimed. The published artifact contains 168 locally replayed episodes; these validate the mechanisms, not an LLM leaderboard.

## License and contributions

Copyright © 2026 Arena Execution Bench contributors. Original code, documentation, synthetic scenarios, and golden traces are licensed under [Apache-2.0](LICENSE). Commercial use, modification, and redistribution are permitted subject to its terms. See the [plain-language licensing guide](LICENSING.md) and [NOTICE](NOTICE).

Found a useful case? [Open an issue](https://github.com/sunruize93-cmyk/arena-execution-bench/issues) with the scenario, seed, and what happened. New scenarios, adapters, and clearer documentation are welcome. If the project helps, a star helps others find it.
