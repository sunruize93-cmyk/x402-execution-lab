# Compatibility and acceptance

Version: **0.1.0**, 2026-09-22. This page distinguishes implemented/tested paths from integrations that remain outside the MVP.

| Component                 | Pinned version / revision                             | Scope                                                        |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `@x402/core`, `@x402/evm` | 2.26.0                                                | v2, exact, EVM EOA EIP-3009                                  |
| viem                      | 2.56.8                                                | EIP-712 verification, local signing/RPC                      |
| Anvil                     | 1.7.1                                                 | disposable chain 31337, no fork                              |
| Solidity compiler         | 0.8.37                                                | bundled local-test-token only; Paris EVM target              |
| JSON Schema / Ajv         | draft-07 / 8.20.0                                     | runtime contracts; generated TS                              |
| Fee disclosure proposal   | PR #1015 / `40af0ef10624a8e08117d2b49cf99787e2bffd49` | flat-fee interpretation; draft, unsigned trust               |
| Arena export              | `arena-lab-export/1`                                  | versioned read-only interchange; no live backend integration |

`tmp` is overridden to 0.2.7 for the compiler's development dependency. All direct versions and the complete resolved tree are locked in `package-lock.json`. CI audits the dependency tree and checks generated types and compiled token artifacts.

## Scripted matrix

All traces are original synthetic fixtures; the fixture manifest includes expected status, failed/incomplete rules, and a trace digest. Tests additionally assert behavioral outcomes independently of that generated manifest.

| Design ID | Case                       | Primary check                                               |
| --------- | -------------------------- | ----------------------------------------------------------- |
| Q01       | expired-quote              | selection/authorization expiry; no retroactive cancellation |
| Q02       | identity-mismatch          | chain, token, payee                                         |
| Q03       | decimal-mismatch           | asset units                                                 |
| F01       | merchant-fee-double-count  | payer total excludes merchant gas/invoice                   |
| F02       | undisclosed-fee            | unknown fee coverage                                        |
| A01       | tampered-authorization     | signature and amount binding                                |
| A02       | unsupported-signature      | custom signature scheme stays unsupported                   |
| X01       | verify-then-revert         | verification does not consume budget                        |
| X02       | timeout-late-confirmation  | one payment and one budget consumption                      |
| X03       | duplicate-business-payment | new nonce can duplicate a business job                      |
| X04       | repeated-authorization     | one payment, additional failed-attempt gas                  |
| X05       | expiry-cancel-race         | no clock-only release; late confirmation wins               |
| C01       | gas-limit-as-cost          | receipt gas versus limit                                    |
| C02       | missing-chain-fee          | incomplete cost coverage                                    |
| R01       | refund-pending             | promised refunds are not received                           |
| R02       | confirmed-uncommitted      | chain and application state separate                        |
| B01       | unsafe-release             | unknown submission holds reservation                        |
| X06       | reorg                      | rollback and reconciliation                                 |
| X07       | provider-only-confirmation | self-report does not become chain evidence                  |

`success` is an additional normal synthetic reference. Thus there are 20 scripted cases, including all 16 design cases.

## Real local integration tests

- Normal HTTP 402 → SDK signature → facilitator → token transfer → receipt/balance observation.
- Actual HTTP abort after broadcast, late receipt, no second authorization, retained pending budget.
- Two different SDK nonces successfully double-pay one job; checker rejects the business duplicate.
- A second transaction with the same authorization reverts and incurs native gas.
- Verification followed by a race: an independent local relayer consumes the nonce; the subsequent settlement reverts. The first transfer is accounted separately, with no duplicate debit or application delivery.
- Signature amount tampering is rejected by offline verification and SDK verification. A separate offline test tampers with the payee.
- Expired and cancelled authorizations revert on the local token; failed execution does not release budget automatically.

## Not accepted / not claimed

Production USDC contracts, real public facilitator providers, testnet/mainnet money, all EVM chains, L2 fee completion, cross-chain paths, Solana, smart accounts, provider fee-quote signatures, separate payer-fee execution, signed cancellation ABI, or production Arena import/deployment have not been validated. The test token's native gas is local execution evidence, not a production fee benchmark. Synthetic providers are not independent commercial implementations.

The first release is a self-check, not an external developer adoption study. The design's external trial and continuation criteria remain future product validation. No upstream proposal acceptance or npm publication is implied by this repository release.
