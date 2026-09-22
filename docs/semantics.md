# Evidence, rules, and replay

## Input contract

`packages/contracts/trace.schema.json` is the runtime contract (JSON Schema draft-07, version `1.0.0`). `report.schema.json` owns findings and report output. TypeScript definitions are generated and checked for drift. Unknown properties, numeric/fractional/negative atomic amounts, unsupported versions, duplicate IDs, unresolved references, and unordered observations fail validation before rules run. Input files are limited to 10 MiB; arrays to 10,000 entries. These bounds are not a guarantee against deliberately expensive input.

One trace represents **one business job** with multiple quotes, authorizations, and attempts. Event ordering is observation order, using integer Unix seconds. Multiple events may have the same timestamp; array order breaks ties. Capture must occur after every observation. `observedAt` on an authorization means its signing/issuance time; it is not the import time. Addresses are matched case-insensitively; the job hash binds the exact stored JSON values.

An evidence record contains a source label, a SHA-256 digest of canonical JSON, and a description. Digests link records to separately retained source evidence; a digest without the underlying evidence is not proof of authenticity. The CLI stores only digests and normalized fields, never the original payment signature or private request body. Free-form descriptions may still contain sensitive text supplied by an importer: redact them at the source.

`jobHash = SHA256(JCS({domain: "execution-lab/job/v1", job}))`, prefixed with `0x`. JCS means RFC 8785 canonical JSON. It is an internal association hash, **not an additional field signed by EIP-3009**. Standard EIP-712 signature verification stays in the exact adapter.

## Fees

`feeComponents: null` means undisclosed. An empty array means explicitly no separate fees. A nullable amount is unknown, never zero. `payerTotalMaxAtomic` is the disclosed exact total/cap: service plus same-token payer fees. Merchant/provider fees do not belong in it. This MVP flags a different declared total; it does not model spare discretionary fee headroom.

Each fee component records who pays, asset, amount, and whether it is quoted or paid. Merchant net is computed only if the merchant fees have paid evidence in the service token. Cross-asset merchant invoices remain unknown. Native receipt cost is `gasUsed * effectiveGasPrice`; receipt gas is distinct from a transaction gas limit. L2 data fees require explicit evidence and are never estimated from missing fields. No fiat or FX estimates are produced.

Balances are per-attempt deltas observed in isolation by the local driver. A captured production delta must not include unrelated concurrent transfers. Same-transaction retry observations are deduplicated; conflicting observations fail. Failed transactions may have native gas but cannot have token transfer debit/credit.

## State and budget

The event reducer never initiates a payment. A provider-reported confirmation or failure cannot move the chain projection. Synthetic fixtures may move a **simulated** projection and always retain synthetic labels. Canonical block evidence must meet `minConfirmations`; this is a policy threshold, not absolute economic finality.

`verify_success`, HTTP 200, and transaction hashes do not consume budget. `submission_unknown` retains it. A successful canonical transaction consumes budget once per network/transaction hash, with the authorization amount used conservatively when actual debit evidence is missing. That missing evidence remains inconclusive. A second confirmed payment for the job is recorded as additional spending and reported as a business duplicate. Unreserved actual spending is never hidden; it can make available budget negative and produces a failure.

The double-entry journal uses these transfers:

| Event             | Debit     | Credit                       |
| ----------------- | --------- | ---------------------------- |
| Opening budget    | available | funding                      |
| Reserve           | reserved  | available                    |
| Canonical payment | spent     | reserved (excess: available) |
| Safe release      | available | reserved                     |
| Observed refund   | available | refunds_received             |
| Payment reorg     | reserved  | spent                        |

`available + reserved + spent - refunds_received == initialBudget`. Refunds are independently evidenced and deduplicated by transaction hash. This MVP supports one aggregate refund per transaction per job; multi-log refund attribution and refund reorgs require a future schema. Original spend is not rewritten by a refund.

Release requires **every authorization** to be consumed or proven closed and no unresolved reorg. A closure includes a canonical block, signed-validity comparison for expiration, nonce-unused observation, and an explicit assertion that pending attempts have been reconciled. Cancellation means a confirmed cancellation with no transfer, not a request to cancel. A failed transaction or the local clock alone is insufficient. The offline checker relies on the adapter for the truth of these closure observations.

A payment reorg invalidates confirmation, reverses spending to reserved, and invalidates the application completion projection. It never changes real external inventory. Reconciliation requires fresh chain evidence. Reorg history remains visible even after later confirmation.

`inventory_committed` requires an application delivery followed by an application commit **and** a chain-confirmed payment. The local driver's application events are simulated; only its token execution is chain-observed. `confirmed-uncommitted` must not be displayed as completed business settlement.

## Enforcement and CI

`signer_checked` describes checks an adapter performed while inspecting the signed authorization; it is not a restriction on arbitrary later off-chain behavior. The internal association, budget and application rules are `application_checked`. Fee proposal preferences are `advisory`; unsupported signature paths or fee executions stay unsupported/unknown. `onchain_enforced` is limited to the bundled test token's recognized runtime bytecode, deployment, chain, token identity, and applicable `transferWithAuthorization` call. It does not apply to the business job hash or an arbitrary max-markup field.

Report status precedence is `fail > inconclusive > pass`. `not_applicable` is separate and not counted as evaluated coverage. `--allow-incomplete` only relaxes exit code 2. `--require-rule` requires all applicable findings for each named rule to pass and rejects missing rule IDs. The default rule set is `fees-and-settlement`; unknown rule-set names are errors.
