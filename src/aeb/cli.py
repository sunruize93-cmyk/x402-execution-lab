from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import ValidationError

from aeb import __version__
from aeb.agents.process import Limits, ProcessAgent
from aeb.evaluation.compare import compare, markdown
from aeb.export import arena_export
from aeb.policies import POLICY_NAMES
from aeb.runner import replay, run_suite, verify_episode
from aeb.scenarios import intervention, load_scenario, suite
from aeb.util import read_jsonl, write_json


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AEB: offline synthetic execution-market benchmark")
    p.add_argument("--version", action="version", version=__version__)
    commands = p.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="List bundled synthetic scenarios")
    listing.add_argument("--split", choices=["train", "dev", "eval"], default="dev")
    run = commands.add_parser(
        "run", help="Run one scenario or a suite, without model calls by default"
    )
    run.add_argument("--suite", default="mechanism-v1")
    run.add_argument("--scenario", action="append", help="Bundled name or JSON path; repeatable")
    run.add_argument("--split", choices=["train", "dev", "eval"], default="dev")
    run.add_argument("--policy", choices=POLICY_NAMES + ["process"], default="expected-cost")
    seed = run.add_mutually_exclusive_group()
    seed.add_argument("--seed", type=int, default=7)
    seed.add_argument("--seeds", help="Comma-separated unique integer episode seeds")
    run.add_argument("--track", choices=["guarded", "diagnostic"], default="guarded")
    run.add_argument("--out", type=Path, required=True)
    run.add_argument("--agent-config", type=Path, help="Opt-in process agent configuration")
    run.add_argument(
        "--intervention",
        choices=["immediate-confirmation", "known-submission", "structured", "events", "permuted"],
    )
    rp = commands.add_parser("replay", help="Recompute metrics from public events")
    rp.add_argument("--trace", type=Path, required=True)
    rp.add_argument("--out", type=Path)
    verify = commands.add_parser(
        "verify", help="Verify saved observations, actions, events and metrics"
    )
    verify.add_argument("--episode", type=Path, required=True)
    cmp = commands.add_parser("compare", help="Paired episode-level analysis")
    cmp.add_argument("--runs", type=Path, nargs=2, required=True)
    cmp.add_argument("--paired-by", choices=["seed"], default="seed")
    cmp.add_argument(
        "--intervention", action="store_true", help="Pair one condition per world_id and seed"
    )
    cmp.add_argument("--allow-track-difference", action="store_true")
    cmp.add_argument("--out", type=Path, required=True)
    export = commands.add_parser("export-arena", help="Export allowlisted synthetic public replay")
    export.add_argument("--trace", type=Path, required=True)
    export.add_argument("--out", type=Path, required=True)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "list":
            for s in suite(split=args.split):
                print(f"{s['id']:<28} {s['family']:<18} {s['knowledge']}")
            return 0
        if args.command == "run":
            scenarios = (
                [load_scenario(s) for s in args.scenario]
                if args.scenario
                else suite(args.suite, args.split)
            )
            if args.intervention:
                scenarios = [intervention(s, args.intervention) for s in scenarios]
            seeds = [int(s) for s in args.seeds.split(",")] if args.seeds else [args.seed]
            agent = None
            if args.policy == "process":
                if args.agent_config is None:
                    raise ValueError("--policy process requires --agent-config")
                config = json.loads(args.agent_config.read_text())
                agent = ProcessAgent(
                    config["command"],
                    Limits(**config["limits"]),
                    config["model"],
                    config["prompt_version"],
                )
            elif args.agent_config:
                raise ValueError("--agent-config requires --policy process")
            result = run_suite(scenarios, seeds, args.policy, args.out, args.track, agent)
            print(json.dumps(result, indent=2))
            print(f"Saved {args.out.resolve() / 'report.md'}")
        elif args.command == "replay":
            result = replay(args.trace)
            if args.out:
                write_json(args.out, result)
            print(json.dumps(result, indent=2))
        elif args.command == "verify":
            print(json.dumps(verify_episode(args.episode)))
        elif args.command == "compare":
            result = compare(
                *args.runs,
                intervention=args.intervention,
                allow_track_difference=args.allow_track_difference,
            )
            if args.out.exists():
                raise ValueError("Comparison output already exists")
            args.out.mkdir(parents=True)
            write_json(args.out / "comparison.json", result)
            (args.out / "report.md").write_text(markdown(result))
            print(markdown(result))
        elif args.command == "export-arena":
            if args.out.exists():
                raise ValueError("Export output already exists")
            write_json(args.out, arena_export(read_jsonl(args.trace)))
            print(f"Synthetic public replay saved to {args.out}")
        return 0
    except ValidationError as exc:
        location = "/".join(map(str, exc.absolute_path)) or "root"
        print(f"aeb: schema validation failed at {location} ({exc.validator})", file=sys.stderr)
        return 2
    except (ValueError, OSError, KeyError, TypeError, IndexError) as exc:
        print(f"aeb: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
