# Report screenshots / 报告截图

Captured on 2026-09-22 from the unchanged HTML renderer at commit `a84c09f6bdfdb03ecf66145e3ddcf88035c5bb63`. These are browser screenshots of actual local runs, not mockups. No text, counts, or status values were replaced in the images.

2026-09-22 实际运行后的浏览器截图，来自临时 Anvil 链和测试代币。图中业务交付状态为模拟；截图没有替换文字、数值或检查结果。

## Reproduce / 复现

After `npm ci` and `npm run build`, run each command separately from the repository root:

```sh
node dist/packages/cli/index.js run \
  --case timeout-late-confirmation --driver local --out artifacts/timeout

# Expected exit code: 1. The report is still generated.
node dist/packages/cli/index.js run \
  --case duplicate-business-payment --driver local --out artifacts/duplicate
```

Open the generated `report.html` files in a browser. The first two images capture the report overview; the third captures the duplicate report's budget and findings section. Images retain the browser's normal viewport. Addresses, transaction hashes, digests, and gas costs change between runs because the accounts and chain are temporary.

| Image                                            | Status             | Chain payments | Failed checks | Payer debit (atomic) |
| ------------------------------------------------ | ------------------ | -------------- | ------------- | -------------------- |
| [timeout-report.png](timeout-report.png)         | pass               | 1              | 0             | 10000                |
| [duplicate-report.png](duplicate-report.png)     | fail               | 2              | 4             | 20000                |
| [duplicate-findings.png](duplicate-findings.png) | same duplicate run | 2              | 4             | 20000                |

Both local runs use 6-decimal test tokens. The screenshot overview does not show every field; scroll down in your report for the amount and evidence tables. All three saved images were visually checked for readable titles, counts, and findings.

## Source trace digests / 来源记录摘要

- `timeout`: `0x53693aa30c50fd26c1cdd60f4bbbf0dbd474341e22348d79ac2f08a3ca1ee965`
- `duplicate`: `0x14189f7080a0108bcf425779da5674f1846c7e019e9aa63d19fc51e651e40e00`
