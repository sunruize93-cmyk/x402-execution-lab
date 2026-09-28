# Report screenshots

## Combined workflow

The current README images show a real combined demo from this checkout: 48 paired-policy episodes, 2 retry episodes, and 2 local-chain payment cases. Both images are normal browser viewport captures; no values were edited.

当前首页配图来自同一次联合演示：50 个模拟回合经过重放核验，本地链案例分别确认 1 笔与 2 笔付款。图中保留来源标签、策略差异和修改建议，详细证据在报告中展开。

After following the root README installation steps:

```sh
npm run demo:combined -- --out artifacts/combined --lang zh-CN
```

Open `report.zh-CN.html` or `report.en.html` in that directory. The report also writes `summary.json` and links to the per-module outputs. Use a new output directory for every run.

- [中文联合报告](combined-zh-CN.png)
- [English combined report](combined-en.png)

Captured benchmark engine digest: `518aae29068d0d1e5fa70f40d6d76cc1f8b81f0658d53b22d95542a52fde8eee`.

Timeout trace digest: `0x5b3fd6974bf4c8cf9703ae4ff97f09538d2e8ceb1e109ca0fb322ae348b99813`.

Duplicate-payment trace digest: `0x4dc0cac63fd5b9ce87cc7e0c10633a446fe8855eb7165b3ff26f027534384e94`.

Local addresses, transaction hashes and gas vary between runs. Compare the outcomes and payment counts; simulated utility is a separate unit from test-token debit.

## Earlier payment-only screenshots

The English and Chinese images show the same actual local duplicate-payment run. Each README uses one viewport-sized diagnostic summary. No report text or values were edited in the images. The report's detailed checks and source context remain available in collapsed panels.

中英文图片来自同一次本地重复付款执行。每份 README 只放一张诊断摘要，截图未替换文字或数值。测试使用临时链与测试代币；应用交付为模拟。

## Reproduce

```sh
npm ci
npm run build

# Expected exit code 1: this case intentionally pays twice.
node dist/packages/cli/index.js run \
  --case duplicate-business-payment --driver local --out artifacts/diagnostic-demo

node dist/packages/cli/index.js diagnose \
  --input artifacts/diagnostic-demo/findings.json \
  --lang zh-CN --out artifacts/diagnostic-zh
```

Open the two `report.html` files in a browser. Both show 2 confirmed payments, 0.02 test tokens debited, 4 failed checks, and 2 diagnostic groups. Captures were visually checked for readable guidance and absence of names, wallet addresses, and transaction hashes in the visible summary. The budget panel was expanded to verify its advice remains accessible.

- [English summary](diagnosis-en.png)
- [中文摘要](diagnosis-zh-CN.png)

Source trace digest: `0xf637046f7889be4f65d504e4239937325249f964197a9931093523c5f6f49c43`.

Renderer SHA-256: `da60c69a1a2f7095db15c78e3504af9ffc9857c7e0409282129cb2b44ffdf278`.

Guide catalog SHA-256: `4d13ab908b2b8fb7abc136142bc8736f911ba2f70aa3bd8f93a2236347ed62c7`.
