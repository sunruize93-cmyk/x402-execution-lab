# AEB synthetic mechanism run

Policy: `naive-retry`; track: `guarded`.

| Scenario | Episodes | Mean utility | Worst utility | Duplicate payments | Complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| late-known-dev | 6 | 380.00 | 380 | 0 | 6 |

Synthetic simulator results; no model-ranking or production-payment claims.
Utility uses evidence visible by the fixed drain horizon. Unresolved outcomes are censored.
See decision_metrics.json per episode for model usage, errors and stopped epochs.
