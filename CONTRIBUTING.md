# Contributing

Use Node.js 22 or 24 and `npm ci`. The repository has one npm package with internal module boundaries, not independently published workspace packages.

Before proposing changes, run:

```sh
npm run check
npm run test:local
npm run contract:check
npm run format:check
npm audit
git diff --check
```

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

Open an issue with a minimal sanitized trace and expected behavior, or submit a focused pull request. Do not file live secrets or replayable payment authorizations. Contributions are under Apache-2.0. Original fixtures share that license; imported third-party traces need permission and provenance.
