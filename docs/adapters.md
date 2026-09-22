# Adapter integration

## Standard x402 exact EVM

`jobFromRequirements(requirements, context)` accepts an x402 v2 exact EVM challenge. Context supplies the business job ID, merchant ID, asset decimals, and job deadline. Resolve decimals from an identified asset before capture; do not guess them from `USDC` or another symbol.

`authorizationFromPayload(payload, requirements, context)` supports a standard EOA EIP-3009 `TransferWithAuthorization` payload. It verifies the original EIP-712 signature using viem without RPC. Changing the amount, payee, domain, nonce, or validity invalidates the signature. Additional custom authorization fields are rejected. ERC-1271/6492 contract accounts, Permit2, `upto`, and x402 v1 are not supported by this adapter.

The normalized result does not include the raw signature. Keep raw capture data outside the public repository. Contract enforcement is only identified for the bundled local test token; importing an external token does not grant it that level automatically.

## Local execution

The local driver starts its own Anvil on a dynamically assigned IPv4 loopback port, chain `31337`, with no default funded accounts. It generates ephemeral accounts in memory, funds them through Anvil's test RPC, and deploys the bundled `LocalTestToken`. Runtime bytecode is checked against a committed hash. No user key, seed, external RPC URL, environment wallet, fork URL, or live chain can be configured.

An owned HTTP resource server returns a 402 challenge. The x402 client permits only the deployed test token with a 10,000-atomic per-payment cap. The local facilitator runs the pinned x402 exact SDK. The timeout scenario actually aborts the client HTTP request after broadcast and before returning a receipt; it then reconciles the original transaction without generating a new nonce.

Default local node lifetime: 60 seconds (`--timeout-ms`, allowed 1–300 seconds). RPC calls have 3-second timeouts, HTTP settlement 10 seconds, and receipt waits 5 seconds. Integration tests have 60-second per-case timeouts; CI has a five-minute suite limit. Nodes and HTTP servers are closed in `finally`, and only owned processes are stopped. A timeout checkpoint is written before reconciliation. Runner failures retain `trace.partial.json` whenever a trace has been created; incomplete checkpoints may lack enough data for a conformance result.

The two `transferWithAuthorization` ABI forms (v/r/s and bytes signature) are exposed by the local token. This fixture is not a complete production ERC-20 or USDC implementation. Its direct `cancel` function is test instrumentation, not the EIP-3009 `cancelAuthorization` signed-message interface.

## Pinned fee proposal

`feeProposalQuote()` interprets the **flat** fee quote response at [x402 PR #1015, revision 40af0ef](https://github.com/x402-foundation/x402/pull/1015/commits/40af0ef10624a8e08117d2b49cf99787e2bffd49). The PR was open, draft, and unmerged when checked on 2026-09-22. See its [types](https://github.com/sei-protocol/sei-x402/blob/40af0ef10624a8e08117d2b49cf99787e2bffd49/typescript/packages/extensions/src/facilitator-fees/types.ts).

The adapter requires the exact revision; `main` is rejected. The integration must supply the fee payer and failure policy because the draft response does not establish them. Unknown payer stays unknown. BPS/tiered/hybrid quotes have unknown exact fees. Cross-asset conversion and provider quote signature verification are explicitly unsupported. Client fee preferences remain advisory. The adapter never labels the draft a ratified x402 standard or ranks an undisclosed provider as free.

## Arena export

`importArenaTrace()` accepts only this read-only envelope:

```json
{ "exportVersion": "arena-lab-export/1", "trace": { "schemaVersion": "1.0.0" } }
```

The abbreviated `trace` must in practice contain every required trace field. See [the full example](../examples/arena-export.json). The backend exporter must be implemented by Arena's backend owner; this repository does not access its DB, mutate inventory, or assume a currently deployed exporter. Original event `rawStatus` and evidence provenance are preserved. `accepted_pending_settlement` is not mapped to chain confirmation.

## JSONL

`check --trace file.jsonl` uses an explicit lab stream format, not arbitrary provider logs. The first line is `{ "type": "trace", "trace": <metadata with events: []> }`. Remaining lines are `{ "type": "event", "event": <one schema-valid event> }`. See [timeout.jsonl](../examples/timeout.jsonl). Standard JSON traces are equally supported.

An adapter should map events, preserve raw status and provenance, and call `parseTrace()` before returning. It must not silently manufacture missing fees, confirmation blocks, contract identities, or refund receipts.

## CLI and automated checks

The default check runs every rule in `fees-and-settlement`. It reads local files only; it does not contact a chain or send a payment.

```sh
# List the supplied scenarios.
npm run lab -- list

# Run an entirely scripted case, with no blockchain process.
npm run lab -- run --case timeout-late-confirmation --driver scripted \
  --allow-incomplete --out artifacts/scripted

# Check an existing JSON or JSONL trace.
npm run lab -- check --trace fixtures/v1/timeout-late-confirmation.json \
  --rules fees-and-settlement --allow-incomplete

# Allow incomplete coverage overall, but require these named rules to pass.
npm run lab -- check --trace fixtures/v1/timeout-late-confirmation.json \
  --allow-incomplete --require-rule Q_IDENTITY,Q_UNITS,X_BUSINESS_IDEMPOTENCY

# Rebuild HTML from a saved JSON report.
npm run lab -- report --input artifacts/timeout/findings.json \
  --format html --output artifacts/timeout/report.html
```

Exit codes: **0** satisfies the selected policy; **1** conformance failure; **2** incomplete evidence or required coverage missing; **3** invalid input or runner error. Unknown rule IDs are never silently accepted.

Scripted cases cannot prove contract enforcement. Their otherwise conformant reports remain `inconclusive`. `--allow-incomplete` relaxes exit code 2; it does not turn missing evidence into a passing check.

## Library use

After installing a locally built tarball (`npm pack`), import the checker:

```ts
import { checkTrace, reportExitCode } from 'x402-execution-lab';
import { parseTrace } from 'x402-execution-lab/contracts';

const report = checkTrace(parseTrace(capturedJson));
process.exitCode = reportExitCode(report);
```

No npm release has been published. Install from this repository or a locally generated tarball. `checkTrace` is a pure offline consistency check: it does not fetch receipts, verify the truth of an imported source label, or move money. Input and output contracts are generated from the versioned JSON Schemas in `packages/contracts/`.
