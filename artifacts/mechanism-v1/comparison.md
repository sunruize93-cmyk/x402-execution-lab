# Paired AEB comparison

right minus left utility; signed same-information baseline gap, not oracle regret

paired percentile bootstrap, 2000 resamples of independent episode seeds per scenario

| Scenario | Pairs | Mean difference | 95% interval |
| --- | ---: | ---: | --- |
| late-known-dev | 6 | 0.00 | [0.00, 0.00] |
| late-unknown-dev | 6 | 0.00 | [0.00, 0.00] |
| liquidity-locked-dev | 6 | 0.00 | [0.00, 0.00] |
| liquidity-released-dev | 6 | 0.00 | [0.00, 0.00] |
| mixed-hidden-dev | 6 | 84.17 | [0.00, 252.50] |
| mixed-public-dev | 6 | 238.33 | [-39.17, 511.67] |
| risk-high-dev | 6 | 46.67 | [-20.00, 180.00] |
| risk-low-dev | 6 | 0.00 | [0.00, 0.00] |

Exploratory synthetic comparisons. Jobs within an episode are not independent samples.
Intervals do not establish real-provider performance or LLM generalization.
Inspect per-run reports for constraint violations, censoring and tail outcomes.
