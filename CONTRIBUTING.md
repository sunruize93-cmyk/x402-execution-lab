# Contributing

Install with Python 3.10+ and `python -m pip install -e '.[dev]'`. The default test suite uses synthetic local data and no model API key. For the exact development dependency snapshot, install `requirements-dev.lock` before the editable package.

Before sending a change:

```bash
ruff check src tests scripts examples
pytest -q
python scripts/check_docs.py
python scripts/generate_assets.py
git diff --check
python -m build
```

Schema/scenario generator changes must include regenerated packaged assets. Golden traces are intentional fixtures; inspect their changes and explain the economic behavior, not just the new digest. The CI matrix verifies Python 3.10–3.13 and installs the wheel outside the checkout.

Add a small synthetic scenario and a test when changing execution semantics. Check conservation, unknown-state visibility, rejection recovery and the guarded/diagnostic boundary. Keep public observations separate from evaluator state. Do not introduce real keys, chain access, paid calls, or Arena service dependencies into tests.

Preserve world RNG keys for controlled interventions. Add a version change when an existing scenario or engine semantic changes in a way that affects results. Record parameters, split, seed, code/schema/policy version and outcome coverage in artifacts. Report negative or null effects without relabeling them as benchmark success.

New model adapters must record all attempted calls, including failures; enforce declared caps; avoid logging credentials or hidden reasoning; and never auto-retry into an expanded budget. Provider billing limits are adapter-specific and must be stated accurately.

Original contributions are accepted under [Apache-2.0](LICENSE). Imported schemas, datasets or code need explicit upstream license/provenance review; being publicly accessible is insufficient.
