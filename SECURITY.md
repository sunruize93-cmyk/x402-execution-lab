# Security and trust boundaries

AEB executes synthetic payments only. It has no wallet signing, database, blockchain, Arena administration, or production authorization capability. Both simulation tracks enforce conserved nonnegative cash. Diagnostic deliberately permits a new authorization for an already submitted job, so its results are never eligible for production rankings.

Treat `scenario.json`, `evaluator.jsonl`, `checkpoint.json`, and model decisions as private evaluation artifacts. Use `aeb export-arena` for the allowlisted public handoff. Public unknown-state observations keep their reservations until evidence is disclosed. Missing or pending settlement evidence is not success.

Process adapters are trusted local programs, not sandboxed plugins. They inherit the invoking process's environment and OS permissions. Keep API keys in the environment, do not pass them as CLI arguments, and isolate adversarial agents outside the evaluator's filesystem. The included HTTPS wrapper refuses redirects and redacts provider error bodies. No paid calls occur in CI.

For vulnerabilities, use the repository's GitHub private vulnerability-reporting channel when enabled. Do not post credentials or private evaluator data in public issues. Ordinary simulator bugs can be reported as minimal synthetic scenarios with version, seed, policy and the relevant public trace.
