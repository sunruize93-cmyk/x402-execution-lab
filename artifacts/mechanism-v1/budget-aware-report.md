# AEB synthetic mechanism run

Policy: `budget-aware`; track: `guarded`.

| Scenario | Episodes | Mean utility | Worst utility | Duplicate payments | Complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| late-known-dev | 6 | 380.00 | 380 | 0 | 6 |
| late-unknown-dev | 6 | 380.00 | 380 | 0 | 6 |
| liquidity-locked-dev | 6 | 680.00 | 680 | 0 | 6 |
| liquidity-released-dev | 6 | 680.00 | 680 | 0 | 6 |
| mixed-hidden-dev | 6 | 1853.33 | 1335 | 0 | 6 |
| mixed-public-dev | 6 | 2010.83 | 2000 | 0 | 6 |
| risk-high-dev | 6 | -420.00 | -420 | 0 | 6 |
| risk-low-dev | 6 | -416.67 | -500 | 0 | 6 |

Synthetic simulator results; no model-ranking or production-payment claims.
Utility uses evidence visible by the fixed drain horizon. Unresolved outcomes are censored.
See decision_metrics.json per episode for model usage, errors and stopped epochs.
