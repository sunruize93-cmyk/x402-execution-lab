# Contributing

This repository contains two independently installable modules: the TypeScript payment lab at the root and the Python decision benchmark in `bench/`. They share documentation, issue tracking, CI, and a combined example. Each keeps its own trace schema and evidence semantics.

For the payment lab, use Node.js 22 or 24 and `npm ci`. The root has one npm package with internal module boundaries, not independently published workspace packages.

Before proposing changes, run:

```sh
npm run check
npm run test:local
npm run contract:check
npm run format:check
npm run licenses:check
npm audit
git diff --check
```

For benchmark changes, use Python 3.10–3.13 and run from `bench/`:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
ruff check src tests scripts examples
pytest -q
python scripts/check_docs.py
python scripts/generate_assets.py
git diff --exit-code -- src/aeb/data
python -m build
```

On Windows, activate with `.venv\Scripts\Activate.ps1`. The optional process adapter and the local payment driver require macOS/Linux. See [the benchmark contribution guide](bench/CONTRIBUTING.md) for accounting, experiment, adapter, and fixture requirements. The checked development dependency snapshot is [bench/requirements-dev.lock](bench/requirements-dev.lock).

For changes to the integration, build the lab, install the benchmark, and run the shared no-key example from the repository root:

```sh
npm run build
python -m pip install ./bench
npm run demo:combined -- --out artifacts/contribution-check
```

Use a new output directory for each run. CI checks Node.js 22/24 and Python 3.10–3.13, installs the Python wheel outside the checkout, and runs the combined example. Root Prettier excludes `bench/` to preserve Python formatting and byte-locked benchmark assets.

## Engineering rules

- Keep `packages/core` pure: no RPC, HTTP, signing, wallet, process, or filesystem side effects. Network execution belongs only in an explicitly invoked local driver.
- JSON Schema is the runtime source of truth. Generate TypeScript instead of manually maintaining competing trace/report contracts. Treat a breaking schema change as a versioned change.
- Use atomic integer strings at boundaries and `bigint` for money. Missing values are unknown, not free or zero. Do not mix native gas and token debits.
- Do not promote provider reports, synthetic data, or a passing signature to on-chain settlement or enforcement. Keep deployment/bytecode basis and source labels visible.
- Preserve budget on an unknown submission. Test the recovery path as well as the initial failure; do not count repeated observations as repeated payments.
- Render imported strings as text. Reports have no provider scripts or remote dependencies. Never commit private keys, real signatures, seed phrases, credentials, or private captures.
- Local tests may only use the owned disposable Anvil and generated demo accounts. No production funds, external RPCs, or paid services are part of CI.
- Document implemented and unimplemented behavior in the existing compatibility page. Do not imply upstream endorsement or live Arena integration.

Keep regression tests behavior-focused. New negative fixtures should identify a failed/incomplete rule and independently assert the ledger or settlement consequence. Add adapter limitations explicitly rather than inventing unsupported values.

## Contributions and licensing

Open an issue with a minimal sanitized trace and expected behavior, or submit a focused pull request. Do not file live secrets or replayable payment authorizations.

Contributions to the root payment lab and its original fixtures are under [MIT](LICENSE). The imported benchmark module, including its code, documentation, synthetic scenarios, and golden traces, remains under [Apache-2.0](bench/LICENSE); preserve its [NOTICE](bench/NOTICE). Keep this distinction in packages and redistributed copies. Imported third-party traces need permission and provenance; dependencies retain their own licenses.

Commit changes to packaged schemas together with their generator and digest lock. Do not reformat the benchmark's byte-locked schema or regenerate historical evidence just to change repository paths. Record a new run and its source revision when execution semantics change. Keep `runs/`, local virtual environments, wallet material, and private evaluator captures out of Git. The curated summaries under `bench/artifacts/mechanism-v1/` are intentional public evidence and remain tracked.

## Repository layout

```text
packages/contracts/     JSON Schemas and generated TypeScript contracts
packages/core/          pure rules, hashing, double-entry ledger and replay
packages/adapters/      x402 exact EVM, pinned fee proposal, Arena export
packages/local-driver/  owned Anvil + test token, scripted provider
packages/cli/           run, check, report, diagnose, import-arena
fixtures/v1/            positive/negative traces and expected manifest
examples/               JSONL and integration examples
docs/                   semantics, adapters, compatibility and design
bench/                  Apache-2.0 Python decision benchmark and its documentation
bench/artifacts/        curated synthetic development summaries
.github/workflows/      shared Node, Python and integration checks
```
