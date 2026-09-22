# Diagnostic screenshots

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
