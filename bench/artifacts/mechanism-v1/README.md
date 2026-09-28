# Development mechanism artifact

The checked summaries in this directory describe an actual local run of the v0.1 synthetic mechanism suite. No model API was called. Full per-episode evaluator files are generated locally by the reproduction command and are not bundled in the public artifact.

```bash
python scripts/reproduce.py --out runs/reproduction
```

The protocol uses three baselines (`cheapest`, `expected-cost`, `budget-aware`), six seeds (`0` through `5`) and eight dev conditions: 144 baseline episodes. Another 24 episodes exercise the intentionally unsafe retry rule across known/unknown observations and guarded/diagnostic tracks. All 144 baseline episodes are verified by resimulating saved actions and comparing public/evaluator traces and metrics.

The committed JSON files preserve per-scenario utility distributions, tail outcomes, coverage, violations, engine/schema digests and the source revision. The paired comparison uses episodes as the sampling unit. The eval split is excluded. Three complete public golden trajectories are maintained in [tests/golden](../../tests/golden).

Mechanism conclusions are narrow: the hand-calculated risk threshold changes provider preference; uncertainty can trigger repeated simulated payment under an explicitly unsafe policy; budget reservations can prevent a later valuable purchase. These are controlled construction checks. They say nothing about the ability of any LLM, a real provider's reliability, or production Arena performance.

See [the experiment protocol](../../docs/EXPERIMENTS.md) for definitions and [the runtime outputs](../../README.en.md#compare-policies) for complete reproduction commands. Source commit and version information are in each copied manifest.
