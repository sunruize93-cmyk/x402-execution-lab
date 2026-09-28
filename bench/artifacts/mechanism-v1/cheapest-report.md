# AEB synthetic mechanism run

Policy: `cheapest`; track: `guarded`.

| Scenario | Episodes | Mean utility | Worst utility | Duplicate payments | Complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| late-known-dev | 6 | 380.00 | 380 | 0 | 6 |
| late-unknown-dev | 6 | 380.00 | 380 | 0 | 6 |
| liquidity-locked-dev | 6 | -10.00 | -10 | 0 | 6 |
| liquidity-released-dev | 6 | 770.00 | 770 | 0 | 6 |
| mixed-hidden-dev | 6 | 1772.50 | 1335 | 0 | 6 |
| mixed-public-dev | 6 | 1772.50 | 1335 | 0 | 6 |
| risk-high-dev | 6 | -466.67 | -800 | 0 | 6 |
| risk-low-dev | 6 | -416.67 | -500 | 0 | 6 |

Synthetic simulator results; no model-ranking or production-payment claims.
Utility uses evidence visible by the fixed drain horizon. Unresolved outcomes are censored.
See decision_metrics.json per episode for model usage, errors and stopped epochs.
