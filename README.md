# x402 Execution Lab

[![CI](https://github.com/sunruize93-cmyk/x402-execution-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/sunruize93-cmyk/x402-execution-lab/actions/workflows/ci.yml)

Check whether an x402 quote, payment authorization, observed debit, and settlement evidence agree. Reproduce payment failures locally without funding a real wallet.

The first case is a payment that **broadcasts successfully, times out over HTTP, and confirms later**. The lab keeps the original authorization and its budget reservation. A different nonce may be valid on-chain and still double-pay the same business job; the checker reports that difference.

**v0.1.0 — local MVP.** One offline checker, one CLI, versioned JSON Schemas and fixtures, and a real x402 SDK / Anvil execution driver. This is not a facilitator marketplace, wallet, payment protocol, or security certification. No npm release has been published.

## Quick start

Node.js 22 or 24, npm, and macOS/Linux are the supported development environment. The pinned Anvil npm dependency supplies the local chain binary; no separate Foundry installation is needed.

```sh
git clone https://github.com/sunruize93-cmyk/x402-execution-lab.git
cd x402-execution-lab
npm ci
npm run build

# Real SDK signatures and transactions on an owned, disposable Anvil chain.
node dist/packages/cli/index.js run \
  --case timeout-late-confirmation --driver local --out artifacts/timeout
```

The run writes `trace.json`, `findings.json`, and a standalone `report.html`. Open the HTML file in your browser. The expected local result is `PASS`, one confirmed payment, `spent: 10000`, and `reserved: 0`.

```sh
# Offline, deterministic replay — no RPC or wallet.
npm run lab -- run --case timeout-late-confirmation --driver scripted \
  --allow-incomplete --out artifacts/scripted

# Negative fixture: two legitimate token transfers pay one job twice. Exits 1.
npm run lab -- run --case duplicate-business-payment --driver local \
  --out artifacts/duplicate

# Check captured evidence, or regenerate HTML from a report.
npm run lab -- check --trace fixtures/v1/timeout-late-confirmation.json \
  --rules fees-and-settlement --allow-incomplete
npm run lab -- report --input artifacts/timeout/findings.json \
  --format html --output artifacts/timeout/report.html
```

Scripted fixtures cannot establish contract enforcement, so their otherwise conformant reports remain **inconclusive**. `--allow-incomplete` changes the exit policy, never the report's findings or provenance.

## What the report separates

| Dimension     | Examples                                                                      |
| ------------- | ----------------------------------------------------------------------------- |
| Authorization | valid, consumed, expired, cancelled, unknown                                  |
| Execution     | submitted, submission_unknown, chain_confirmed, chain_failed, unresolved      |
| Application   | not_delivered, delivered, inventory_committed, reconciliation                 |
| Budget        | available, reserved, spent, refunds_received                                  |
| Evidence      | synthetic, local_chain, testnet_observed, mainnet_observed, provider_reported |

Amounts are atomic integer strings and calculations use `bigint`. Merchant-paid fees and facilitator native gas are separate from the payer's token debit. Missing fees, chain-specific costs, and merchant invoice evidence remain unknown. A refund promise does not reduce actual spending.

Every finding has an evidence reference, scope, status, and enforcement level. An identified local token bytecode and deployment can support `onchain_enforced` for its EIP-3009 call. Signature correctness alone cannot. Offline imports trust their stated evidence origin; they do not independently authenticate a chain or provider.

## CI and library use

```sh
npm run check           # schema drift, types, offline tests, build
npm run test:local      # actual SDK + EIP-3009 + HTTP + Anvil integration tests
npm run contract:check  # reproduce the committed local token bytecode
npm run format:check

# Explicitly allow missing coverage but require these rules to pass.
npm run lab -- check --trace fixtures/v1/timeout-late-confirmation.json \
  --allow-incomplete --require-rule Q_IDENTITY,Q_UNITS,X_BUSINESS_IDEMPOTENCY
```

Exit codes: **0** satisfies the selected policy; **1** conformance failure; **2** incomplete evidence / required coverage missing; **3** invalid input or runner error. `--require-rule` never silently accepts an unknown rule ID.

```ts
import { checkTrace, reportExitCode } from 'x402-execution-lab';
import { parseTrace } from 'x402-execution-lab/contracts';

const report = checkTrace(parseTrace(capturedJson));
process.exitCode = reportExitCode(report);
```

The import example works after installing a locally built tarball (`npm pack`), or once a package is separately published. The GitHub checkout and CLI above work today.

## Repository

```text
packages/contracts/     JSON Schemas and generated TypeScript contracts
packages/core/          pure rules, hashing, double-entry ledger and replay
packages/adapters/      x402 exact EVM, pinned fee proposal, Arena export
packages/local-driver/  owned Anvil + test token, scripted provider
packages/cli/           run, check, report, import-arena
fixtures/v1/            positive/negative traces and expected manifest
examples/               JSONL and integration examples
docs/                   semantics, adapters, compatibility and design
```

Read [semantics](docs/semantics.md), [adapter integration](docs/adapters.md), [compatibility](docs/compatibility.md), [中文说明](docs/README.zh-CN.md), and the [original design](docs/design-v1.zh-CN.md). The original design is historical; the compatibility page records the implemented scope. Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Code, original fixtures, and documentation are Apache-2.0 licensed; see [NOTICE](NOTICE).
