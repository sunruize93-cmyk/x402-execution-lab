"""Run the no-key dev artifact: 3 baselines x 6 seeds x 8 conditions.

Usage: python scripts/reproduce.py --out runs/reproduction
The eval split is not used for tuning or this dev artifact.
"""

import argparse
from pathlib import Path

from aeb.evaluation.compare import compare, markdown
from aeb.runner import run_suite, verify_episode
from aeb.scenarios import load_scenario, suite
from aeb.util import write_json


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    if args.out.exists():
        p.error("Output must be a new directory")
    args.out.mkdir(parents=True)
    for policy in ["cheapest", "expected-cost", "budget-aware"]:
        run_suite(suite(), list(range(6)), policy, args.out / policy)
        for episode in (args.out / policy / "episodes").iterdir():
            verify_episode(episode)
    comparison = compare(args.out / "cheapest", args.out / "expected-cost")
    write_json(args.out / "comparison.json", comparison)
    (args.out / "comparison.md").write_text(markdown(comparison))
    for condition in ["known", "unknown"]:
        for track in ["guarded", "diagnostic"]:
            run_suite(
                [load_scenario(f"late-{condition}-dev")],
                list(range(6)),
                "naive-retry",
                args.out / f"retry-{condition}-{track}",
                track,
            )
    print(
        f"Verified 144 baseline episodes; also generated 24 retry diagnostic episodes in {args.out}"
    )


if __name__ == "__main__":
    main()
