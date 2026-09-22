# Security scope

This is a local conformance and evidence tool, not audited payment infrastructure. Do not use its report as authorization to charge a wallet or mutate inventory.

Do not post secrets, production payment signatures, or unsanitized requests in a public issue. For sensitive reports, use this repository's GitHub private vulnerability reporting if available. A nonsensitive reproducible local test is preferred for public issues.

The core never runs transactions. The local driver launches only its own loopback Anvil and ephemeral test accounts. Trace provenance is an assertion from the capture process, not a cryptographic attestation. HTML escapes source strings and forbids scripts/network resources. Input size limits and schema validation reduce accidental misuse; this MVP is not hardened as a public multi-tenant upload service.
