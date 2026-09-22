# x402 Execution Lab

**Test what happens when an AI payment goes wrong.**

[![CI](https://github.com/sunruize93-cmyk/x402-execution-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/sunruize93-cmyk/x402-execution-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
**[中文上手指南 →](docs/README.zh-CN.md)** · [Quick start](#try-the-timeout-example) · [Reading the report](#reading-the-report)

**中文简介：** 在本地复现 AI 支付故障，看清钱付了几次、费用由谁承担。[中文指南](docs/README.zh-CN.md)包含完整安装步骤、真实报告截图、字段解释和项目接入方法。

A free, open-source tool for testing AI payments on your own computer. Try a payment timeout, an accidental double payment, or a fee mistake using test money. Get a readable report showing what happened.

![Local timeout report: 21 checks pass and only one chain payment is confirmed](docs/images/timeout-report.png)

_Captured from a real local run with test tokens. The request times out, the original transaction is reconciled, and only one payment is confirmed. Application delivery is simulated._

## Why I built it

Imagine a payment screen gets stuck. You try again. Later, you discover you paid twice.

Software can make the same mistake. A payment request may time out **after the money has already moved**. If an app starts another payment, it could pay for the same purchase twice.

I built this lab to make these cases easy to reproduce, inspect, and test before connecting real funds.

## Where x402 fits

[x402](https://x402.org/) lets software pay for an online service as part of a web request. For example, an AI agent could pay to fetch a piece of data.

Execution Lab gives developers a place to test what happens around that payment, especially when something goes wrong.

```text
Choose a test → Run it locally with test money → Open the report
```

## What can I check?

| What happens                             | What the lab helps you check                                   |
| ---------------------------------------- | -------------------------------------------------------------- |
| A payment request times out              | Did the original payment eventually go through?                |
| The app pays again for the same purchase | Were there two successful payments for one job?                |
| The fees do not add up                   | Who pays each fee, and does the debit match the agreed amount? |
| Money moves, but delivery fails          | Was payment confirmed while the service remained unfinished?   |

You get **20 scripted scenarios**, **8 local execution scenarios**, and reports you can open in a browser or check automatically in your build. Scripted cases use synthetic records; local cases execute test transactions. See the [coverage matrix](docs/compatibility.md) for the two sets.

Use it when adding x402 payments, changing retry behavior, or investigating a recorded payment. The same failure case can be rerun after a fix and shared with another developer.

## Try the timeout example

You need **Node.js 22 or 24** and npm on macOS or Linux. No funded wallet or separate blockchain installation is needed.

```sh
git clone https://github.com/sunruize93-cmyk/x402-execution-lab.git
cd x402-execution-lab
npm ci
npm run build

node dist/packages/cli/index.js run \
  --case timeout-late-confirmation --driver local --out artifacts/timeout
```

This example sends a test payment, interrupts the response, and then checks the original payment's result. It should finish with **one payment, charged once**.

Open **`artifacts/timeout/report.html`** in your browser. No web server or account is needed:

```sh
open artifacts/timeout/report.html      # macOS
# xdg-open artifacts/timeout/report.html  # Linux desktop
```

A headless machine can save the output directory for viewing on your desktop. You should see `PASS`, 21 passing checks, and `Chain payments = 1`.

| Output          | Use it to…                                             |
| --------------- | ------------------------------------------------------ |
| `report.html`   | Inspect payment, fees, and findings in a browser       |
| `findings.json` | Read the check results from another program or CI      |
| `trace.json`    | Recheck this execution offline or share a reproduction |

Want to see it catch a mistake? Run the duplicate-payment example:

```sh
node dist/packages/cli/index.js run \
  --case duplicate-business-payment --driver local --out artifacts/duplicate
```

That example deliberately pays twice for one job. **A `FAIL` result and exit code `1` are expected:** the lab has detected the mistake. The report is still written to `artifacts/duplicate/report.html`.

![Duplicate-payment report: four checks fail and two chain payments are confirmed](docs/images/duplicate-report.png)

Scroll to **Needs attention** for the explanation. `X_BUSINESS_IDEMPOTENCY` checks whether one job was paid more than once, even when both authorizations are individually valid. This case also exposes missing budget reservations.

<details>
<summary>Show the findings and budget ledger</summary>

![Duplicate-payment findings and the budget ledger showing 20000 spent](docs/images/duplicate-findings.png)

</details>

## Reading the report

| Field                               | Meaning                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `pass` / `fail` / `inconclusive`    | Supplied evidence satisfies the checks / violates a check / is insufficient |
| `Chain payments`                    | Distinct confirmed transactions; check for duplicate payments first         |
| `Payer debit` / `Merchant credit`   | Observed token amount paid / received                                       |
| `Native gas (wei)`                  | Native-chain execution cost, recorded separately from payment tokens        |
| `available` / `reserved` / `spent`  | Unallocated budget / held budget / consumed budget                          |
| `Needs attention` / `Rule coverage` | Problems to inspect / all findings and their evidence references            |

Amounts use integer atomic units: this local token has 6 decimals, so `10000` is **0.01 test tokens**, not dollars. The duplicate case spends `20000`. Native gas uses a different asset and unit; it cannot be added directly to the token amount.

Screenshots show actual local runs. Temporary addresses and gas costs vary on reruns; the expected payment counts and check outcomes are the useful comparison. See [screenshot provenance](docs/images/README.md).

## Use it with your project

Start by rechecking the trace you just generated:

```sh
node dist/packages/cli/index.js check \
  --trace artifacts/timeout/trace.json --out artifacts/recheck
```

Then map your application's quotes, authorizations, attempts, receipts, and business states to the [trace schema](packages/contracts/trace.schema.json). This tool expects a lab trace, not arbitrary provider logs. The [adapters guide](docs/adapters.md) explains SDK helpers and JSONL import.

`check` is offline and does not send payments. Default exit codes are `0` for a satisfied policy, `1` for a failed check, `2` for incomplete evidence, and `3` for invalid input or runner errors. Running a built-in scenario does not connect to or modify your app; capturing your own trace is the integration step.

## What works today

**v0.1** includes local payment execution and a checker for saved payment records. The local driver runs real x402 SDK signatures and transactions on a temporary blockchain with test tokens. Delivery in the demo is simulated.

The checker reports inconsistencies; your application owns the fix. Testing public payment providers and production funds remains separate work. See the [compatibility list](docs/compatibility.md) for the exact coverage.

## For developers

| I want to…                                                       | Start here                              |
| ---------------------------------------------------------------- | --------------------------------------- |
| Check my own payment records, use the CLI, or import the library | [Usage and adapters](docs/adapters.md)  |
| Understand how fees, refunds, and payment states are checked     | [Rules and evidence](docs/semantics.md) |
| See the test matrix and supported versions                       | [Compatibility](docs/compatibility.md)  |
| Add a case or run the full test suite                            | [Contributing](CONTRIBUTING.md)         |

```sh
npm run check       # Types, offline tests, and build
npm run test:local  # Real SDK + local blockchain tests
```

**Have a payment failure worth testing?** [Open an issue](https://github.com/sunruize93-cmyk/x402-execution-lab/issues) with a small, sanitized example. If the lab is useful to you, a star helps other developers find it.


## License

[MIT](LICENSE). You can use, modify, and share this project's code under that license. Dependencies retain their own licenses; see [NOTICE](NOTICE).
