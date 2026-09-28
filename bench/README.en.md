# Decision Bench

**Compare an agent's provider selection, waiting and retry decisions in a reproducible simulator.**

This Python module joins the former Arena Execution Bench with [x402 Execution Lab](https://github.com/sunruize93-cmyk/x402-execution-lab). See the [project overview](https://github.com/sunruize93-cmyk/x402-execution-lab#readme) for the combined workflow. This page covers independent module use. [中文](README.md).

Decision Bench compares policies with synthetic providers, virtual time and a simulated ledger. The sibling payment module checks payment evidence and runs x402 transactions on a local test chain. Their outputs keep their respective provenance; simulated utility is not real revenue.

## Start in one minute

Python 3.10+ is required. From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ./bench
cd bench
python examples/no_key_demo.py
aeb run --suite mechanism-v1 --policy expected-cost --seed 7 --out runs/first
```

On Windows, activate with `.venv\Scripts\Activate.ps1`. Built-in rule policies and the no-key example need no model API, wallet or chain node. An independent Python source distribution can be installed with `python -m pip install .` from its extracted module directory.

Open `runs/first/report.md` for scenario-level utility, duplicate payments and outcome coverage. Each episode stores the scenario, public events, decisions and metrics for replay. Evaluator records and checkpoints are internal experiment artifacts, not public agent inputs.

## Compare policies

```bash
aeb run --policy cheapest --seeds 0,1,2,3,4,5 --out runs/cheap
aeb run --policy expected-cost --seeds 0,1,2,3,4,5 --out runs/expected
aeb compare --runs runs/cheap runs/expected --paired-by seed --out runs/comparison
```

The comparison pairs equal scenarios and seeds, rejects unmatched runs and reports a paired bootstrap interval. One-seed comparisons have no confidence interval. Jobs in an episode are not independent samples.

- **Scenarios:** execution risk, delayed confirmation, locked liquidity, and mixed tasks with public or hidden provider information; train/dev/eval splits.
- **Policies:** cheapest, fastest, expected cost, Bayesian, Thompson, budget aware, deliberately unsafe retry, and a bounded single-job exact DP.
- **Tracks:** `guarded` blocks unsafe duplicate requests; `diagnostic` admits them only in the simulator to expose their cost.
- **Your model:** a subprocess adapter accepts custom policies with explicit call, token, estimated-cost and timeout limits. Default commands make no paid calls.

## Replay and extend

```bash
aeb verify --episode runs/first/episodes/late-unknown-dev--seed-7
aeb replay --trace runs/first/episodes/late-unknown-dev--seed-7/events.jsonl
```

[Execution semantics](docs/SEMANTICS.md) · [Experiment protocol](docs/EXPERIMENTS.md) · [Agent interface](docs/AGENT_INTERFACE.md) · [Contracts and exports](docs/INTEGRATION.md) · [Contributing](CONTRIBUTING.md)

[Historical development artifacts](artifacts/mechanism-v1/README.md) retain the original revision and summaries; they are not new measurements of the merged project. Arena export is a synthetic file handoff, not a deployed Arena 402 integration. The packaged AEB contract remains distinct from the lab's payment trace schema.

This module retains [Apache-2.0](LICENSE) and its [NOTICE](NOTICE). The root MIT license covers the payment module and does not replace this module's license.
