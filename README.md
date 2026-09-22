# x402 Execution Lab

**Test what happens when an AI payment goes wrong.**

[![CI](https://github.com/sunruize93-cmyk/x402-execution-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/sunruize93-cmyk/x402-execution-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[中文说明](docs/README.zh-CN.md)

A free, open-source tool for testing AI payments on your own computer. Try a payment timeout, an accidental double payment, or a fee mistake using test money. Get a readable report showing what happened.

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

You get **20 ready-made scenarios**, a local test environment, and reports you can open in a browser or check automatically in your build.

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

Open **`artifacts/timeout/report.html`** in your browser. The report shows the amount paid, who covers the fees, the payment status, and any checks that failed or still need evidence. JSON files are saved alongside it for automated checks.

Want to see it catch a mistake? Run the duplicate-payment example:

```sh
node dist/packages/cli/index.js run \
  --case duplicate-business-payment --driver local --out artifacts/duplicate
```

That example deliberately pays twice for one job. **A `FAIL` result is expected:** the lab has detected the mistake. Open `artifacts/duplicate/report.html` to see why.

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
