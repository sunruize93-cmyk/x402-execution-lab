# x402 Execution Lab

本工具在本地核对一笔 x402 支付的报价、授权、实际扣款和结算证据，并用可复现的失败场景测试集成逻辑。

目前交付的是 **v0.1.0 本地 MVP**：一个仓库、一个 CLI、离线检查器、JSON Schema、20 个合成场景、真实 SDK＋Anvil 本地链测试、JSON／HTML 报告和 CI。未发布 npm 包。

```sh
npm ci
npm run build
node dist/packages/cli/index.js run --case timeout-late-confirmation --driver local --out artifacts/timeout
```

打开 `artifacts/timeout/report.html` 查看结果。该场景会在真实本地交易广播后中断 HTTP 请求，再核对原交易的迟到确认：只付款一次，预算只消费一次。临时账户由程序生成，不需要你的钱包或真实资金。

```sh
npm run check
npm run test:local
```

退出码：`0` 满足所选策略；`1` 发现违反规则的行为；`2` 证据不全；`3` 输入或运行器错误。合成场景无法证明真实合约强制执行，因此默认返回 `2`；可用 `--allow-incomplete` 放宽 CI 策略，报告仍保留不完整项。

付款签名正确、HTTP 200、存在 txHash、链上确认、业务库存提交是不同事实。商家支付的费用和 Facilitator 的原生 gas 不会被自动加到买方扣款里；缺失费用保持 unknown；退款承诺不算实际到账。

本地 token 明确标为 `local-test-token`。生产 USDC、外部 Facilitator、所有 EVM 链、真实 Arena 后端导出器和资金业务接入均未验收。详细范围见 [兼容性清单](compatibility.md)，输入语义见 [semantics](semantics.md)，接入方式见 [adapters](adapters.md)。原始[设计方案](design-v1.zh-CN.md)保留为需求依据。
