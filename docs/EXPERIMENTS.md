# Experiment protocol

This v0.1 artifact is a development mechanism validation. The generator, seed list, constraints and metric definitions are public. It does not establish model superiority or a publication-level empirical claim.

## Mechanism suite

| Family | Conditions | Controlled contrast |
| --- | --- | --- |
| Risk | low/high explicit failure loss | Fee versus probability-weighted loss |
| Late confirmation | known/unknown submission | Same prices, actual outcomes and disclosure times; different observed submission state |
| Liquidity | released/locked | Same initial assets and later demand; failure releases the first reservation at epoch 0 or 4 |
| Mixed | public/hidden failure probability | Same world draws; public parameters versus equal visible initial history |

Each family appears in train, dev and eval. The dev release uses seeds `0,1,2,3,4,5` for three policies: `cheapest`, `expected-cost`, `budget-aware`. That gives 144 episodes. The retry diagnostic adds six seeds for two observations and two tracks, giving 24 more episodes. Ten decision epochs and ten drain epochs are used. No real-time clock or model calls influence the world.

The train/eval generators change loss/value parameter combinations. The code and tests use dev for mechanism checks. The eval combinations are published and were not used for this reported run; this is a transparent split, not a claim of permanently uncontaminated holdout data.

## Hand calculations

For required procurement with zero service surplus, C charges 400 and fails with probability 0.10; B charges 420 and fails with probability 0.001. Submission fees apply regardless of rail success.

```text
expected utility(C) = -400 - 0.10 L
expected utility(B) = -420 - 0.001 L
B preferred iff L > 20 / 0.099 = 202.020202...
```

At `L=100`, C costs 410 in expectation versus B's 420.1. At `L=400`, C costs 440 versus B's 420.4. Tests check these values and the chosen provider, rather than using a small noisy sample to establish the threshold. The disclosed non-execution cost is 2000; see [the cost definition](SEMANTICS.md).

The liquidity pair starts with 700. Job `early` reserves 600 plus a 10 fee and certainly fails. Job `opportunity` arrives at epoch 1, needs 600 plus a 20 fee, has deadline 2, and delivers value 1400. Immediate release allows utility 770. Release at epoch 4 prevents that second purchase, giving -10. The budget-aware policy declines the first opportunity, incurs its explicit 100 non-execution cost and completes the second, giving 680. This is a deliberately hand-checkable liquidity test with a disclosed required-work tradeoff.

## Reproduce, inspect, compare

```bash
python scripts/reproduce.py --out runs/reproduction
aeb compare --runs runs/reproduction/cheapest runs/reproduction/expected-cost \
  --paired-by seed --out runs/paired
aeb replay --trace runs/reproduction/cheapest/episodes/risk-low-dev--seed-0/events.jsonl
aeb verify --episode runs/reproduction/cheapest/episodes/risk-low-dev--seed-0
```

`replay` recomputes metrics and validates event ordering and cash conservation. `verify` reconstructs the world from the saved scenario and actions, checks every observation digest, and compares public events, evaluator events, and metrics. It makes no model calls. Re-running a live model is a different experiment and need not reproduce its actions.

The public trace is the source for public metrics. `evaluator.jsonl`, `checkpoint.json`, and `scenario.json` can reveal hidden parameters and must remain outside agent prompts and default Arena exports. Outputs are separated per episode. A new run refuses an existing output directory.

## Statistics and comparisons

Report per-scenario utility distributions, mean, minimum, worst-decile mean, violations, and outcome coverage. The worst decile uses the lowest `ceil(n/10)` episodes. The comparison uses 2,000 percentile-bootstrap draws over paired episode differences, with a fixed analysis RNG. One pair has no reported confidence interval. Within-episode jobs are dependent and never counted as extra independent samples.

The comparison is `right utility - left utility`. If the right run is a fair same-information baseline, this is a signed baseline gap; it can be negative. No global weighted economic-intelligence score or oracle-optimal regret is produced. Bootstrap intervals with six pairs describe this small pilot and can be unstable. No multiple-comparison significance claim is made.

Cross-track comparisons require `--allow-track-difference`. Mechanism comparisons with changed scenario IDs require `--intervention`, which pairs by `world_id` and seed and refuses ambiguous multiple conditions. This flag records intentional pairing but does not prove that the user changed only one causal factor; inspect scenario JSON diffs. Baseline comparisons require identical scenario digests, splits, engine digests, schema digests and call granularity.

```bash
aeb run --scenario late-unknown-dev --policy naive-retry --track diagnostic \
  --seeds 0,1,2,3,4,5 --out runs/unknown
aeb run --scenario late-unknown-dev --intervention known-submission \
  --policy naive-retry --track diagnostic --seeds 0,1,2,3,4,5 --out runs/known
aeb compare --runs runs/unknown runs/known --intervention --out runs/knowledge-effect
```

Other interventions are `immediate-confirmation`, `permuted`, `events`, and `structured`. The immediate intervention changes confirmation delay, disclosure delay and unknown-submission probability together, so it is an execution-availability bundle. The dedicated liquidity pair isolates release timing. The representation pair exposes the same public history; structured state is only a deterministic fold of those events, not new evidence.

## Optional model pilot

The design's 2 models × 6 seeds × 4 conditions × 10 epochs equals 480 primary decisions. No such paid pilot has been run here. First measure usage through an explicitly authorized small call budget, then freeze current pricing, prompt/model versions, input/output limits and a run-level cap. The model adapter does not retry invalid output. Dispatch-stopped epochs and failed calls remain in the artifacts; capped runs cannot enter ordinary paired comparison.

A final research sample should be designed from pilot variance and a declared minimum meaningful effect. The initial design's unverified candidate citations are not reproduced as established prior-art claims. Additional comparisons, a general POMDP oracle, upstream schema conformance, real-provider calibration and deployment acceptance remain separate work.
