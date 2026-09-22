# x402 Execution Lab：开源项目设计方案

## 0. 文档状态与结论

- 日期／版本：2026-09-22，design-v1。
- 状态：设计方案；尚未创建仓库、实现代码、发布包或完成生产接入。
- 实现后更新：仓库现已实现本地 MVP，并按维护者要求改用 MIT 许可证；本文保留初始设计记录，第 13 节的 Apache-2.0 为当时的建议。当前范围见 [兼容性清单](compatibility.md)，许可见 [LICENSE](../LICENSE)。
- 对应候选：x402 quote / receipt conformance + local test environment。
- 建议仓库名：`x402-execution-lab`，名称占用未核实。
- 一句话：**让开发者在本地检查一笔 x402 支付的报价、授权、实际扣款与结算证据是否一致。**

先做一个开发者可以放进 CI 的小工具：输入标准付款要求和一组执行证据，输出可定位的问题与机器可读报告。它不承担资金托管、不替用户选择最优 Facilitator，也不宣称是一种新支付协议。

默认估算：一名熟悉 TypeScript／EVM 的工程师，10 个工作日完成有限的本地 MVP；外部供应商接入和提案合并不计入可控交付承诺。

## 1. 为谁解决什么问题

| 使用者 | 实际问题 | 可交付价值 |
|---|---|---|
| x402 Resource Server 开发者 | HTTP 请求成功，但商家到底收到多少钱、结算到哪一步不清楚 | 把付款、链确认和业务提交分别报告 |
| Facilitator 实现者 | 修改费用或重试策略后，不知道是否破坏金额／nonce／状态语义 | 版本化测试向量与 adapter conformance suite |
| Agent 钱包开发者 | quote 有 max fee 字段，但不知道哪一层真正验证它 | 每项约束标注 enforcement level |
| Benchmark 作者 | 用一条 success 布尔值模拟所有付款结果 | 标准化、带来源的执行 trace 和失败场景 |

第一条用户故事：开发者运行一个本地 case，在没有真实钱包资金的情况下重现“Facilitator 已提交，但 HTTP 超时，客户端错误地生成新授权再付款”的问题。报告指出是哪一项业务幂等约束被破坏，并保留证据链。

## 2. 与 prior art 的关系

EIP-3009 已提供带 nonce、金额和时间窗的 token 转账授权；EIP-712 提供结构化签名。新工具应检查已有语义，不重新设计它们。[EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)、[EIP-712](https://eips.ethereum.org/EIPS/eip-712)

x402 的费用披露已有 [issue #1016](https://github.com/x402-foundation/x402/issues/1016) 与 [Draft PR #1015](https://github.com/x402-foundation/x402/pull/1015)。本次重新核验 PR 仍 open／draft、未合并，因此 adapter 必须固定 revision，不能把草案字段命名成已正式采用的通用标准。

已有 x402 安全研究覆盖支付授权与执行问题；本项目的独立价值应是日常可用的费用／证据互操作工具与公开测试资产，不能仅凭记录延迟和 gas 就宣称研究创新。[x402 安全与性能研究](https://arxiv.org/abs/2607.19545)

| 直接复用 | 我们补充 | 首版不做 |
|---|---|---|
| x402 exact EVM SDK、EIP-3009／712 实现、现有 RPC 库 | 统一证据输入、费用归属、失败分类、可重复测试与报告 | 新合约、新 Paymaster、新 oracle |
| 上游费用提案与 provider 原始响应 | proposal-version adapter、unsupported 显示 | 自封的新 RFQ 标准 |
| Arena 既有 intent／mandate／账本语义 | Arena trace 导入器 | 改动 Arena 生产资金逻辑 |

## 3. 明确产品边界

### MVP 包含

1. 单一 EVM 本地链，标准 EIP-3009 exact payment 路径。
2. 一个真实 SDK／本地执行 adapter；一个 scripted provider adapter，用来注入失败和费用披露场景。
3. unsigned job、quote、payment authorization 和执行证据的关联验证。
4. 报价过期、金额单位、asset／chain／payee 一致性、费用归属和付款上限检查。
5. 成功、revert、提交结果未知、迟到确认、重复提交等状态的本地 replay。
6. JSON 与可读 HTML 报告、版本化 fixtures、CI 命令。

使用本地测试 token 时标注 `local-test-token`。ABI／签名行为测试通过，不代表生产 USDC 合约部署或全链支持已经通过验证。

### MVP 排除

- 自动路由／真实竞价、真实余额托管、代签私钥服务。
- 跨链 bridge、Solana／所有 EVM 链、AA Paymaster 的完整成本模型。
- 服务价值判断、全球 Facilitator 信誉排名。
- “已审计”“生产安全”“完全兼容所有 x402”认证标签。
- 把两家 fixture 当成两个独立生产供应商。

## 4. 最重要的设计决定：检查器与付款执行分开

```text
Test case / captured trace / Arena export
                  |
                  v
          Source adapter + schema validation
                  |
                  v
    Normalized job / quote / authorization / evidence
                  |
          +-------+----------------+
          |                        |
          v                        v
     Rule evaluator          State / ledger replay
          |                        |
          +------------+-----------+
                       v
           Findings + coverage + provenance
                       |
                 JSON / HTML / CI

Optional local execution driver
   -> x402 SDK -> local Facilitator -> Anvil / test token
   -> produces evidence for the checker above
```

核心库不能因导入一个 trace 自动发网络请求或交易。本地 driver 只允许显式配置的测试链；未来网络执行是独立 opt-in adapter。报告生成器也不应执行 provider 返回的脚本或把服务响应当作指令。

## 5. 模块与建议仓库结构

```text
x402-execution-lab/
  packages/
    contracts/       JSON Schema、事件名、错误码、版本契约
    core/            纯函数检查、状态归约、费用与预算运算
    adapters/        x402 exact EVM、fee proposal、Arena trace
    local-driver/    本地链与 scripted provider
    cli/             case runner、report、CI entrypoint
  fixtures/          正例、反例、预期输出与来源说明
  examples/          从 402 challenge 到最终报告的最小示例
  docs/              语义说明、adapter 指南、兼容性清单
```

一个仓库即可，不把 schemas、CLI、simulator fixtures 分拆成新 repo。运行时验证以 JSON Schema 为唯一契约源；TypeScript 类型从它派生或自动核对。第二个开源项目使用发布后的 schema／fixtures，不复制后再各自修改。

建议依赖：固定版本 x402 SDK、成熟 EVM 签名／RPC 库、JSON Schema validator、Node 测试工具；本地执行用 Anvil。具体版本在实现首日锁定，本文不把未测过的版本组合写成保证可运行的安装命令。

## 6. 数据契约

| 对象 | 必需信息 | 约束 |
|---|---|---|
| `PaymentJob` | schemaVersion、jobId、merchantId、network、assetId、decimals、payee、serviceAmountAtomic、deadline | 金额为整数字符串；assetId 绑定链上资产身份，不只用 USDC symbol |
| `ExecutionQuote` | quoteId、jobHash、providerId、feePayer、feeComponents、payerTotalMaxAtomic、expiresAt、failureFeePolicy、sourceRevision | 缺失值为 unknown，不当成零费用 |
| `AuthorizationEvidence` | scheme、domain、amount、payee、nonce／authorizationRef、validity、签名验证结果 | 不保存私钥；公开 fixture 仅使用本地演示授权 |
| `ExecutionEvidence` | attemptId、jobId、quoteId、network、txHash、observedStatus、timestamps、rawEvidenceDigest | job 与 attempt 一对多；尝试次数不等于成功付款次数 |
| `CostEvidence` | gasUsed、effectiveGasPrice、extraChainFees、actualDebit、actualCredit、FX 来源及时间 | 不把网络成本自动加入买方扣款；FX 缺失则不伪造美元精度 |
| `Finding` | ruleId、severity、status、evidenceRefs、explanation、scope | 结论仅在已检查对象与版本范围内有效 |

所有来源必须标记：`synthetic`、`local_chain`、`testnet_observed`、`mainnet_observed` 或 `provider_reported`。provider 自报 receipt 未经链核对时仍是自报，不升级为 chain-observed。

`jobHash` 的内部规范化使用确定的 canonical JSON 规则和域标签，例如 `execution-lab/job/v1`；它只用于本工具的关联与一致性检查，不假装是 x402、EIP-3009 已签署的字段。对现有付款签名，继续按原协议编码验签。

### 示例：商家包价，不向买方额外扣执行费

以下数值为设计示例，单位均为 6-decimal test token：

| 项目 | 值 |
|---|---:|
| 买方签署转账 | 10,000 atomic = 0.01 token |
| 买方实际扣款 | 10,000 |
| 商家链上收款 | 10,000 |
| 商家另付 Facilitator 账单 | 1,000 |
| 商家最终净收入 | 9,000，仅在账单有证据时可认定 |
| Facilitator native gas 成本 | 独立原生资产字段；可附 FX 估值 |

这时买方 total 仍是 10,000，不是 11,000。如果商家账单暂未结算，报告显示“商家净额未确认”。若买方另付执行费，必须有可核对的第二授权／现有兼容执行路径；MVP 不为它新建收费合约。

## 7. 约束的执行级别

每项 policy 都输出以下之一，不给整笔交易一个笼统的“安全”勾选：

| 级别 | 含义 | 示例 |
|---|---|---|
| `onchain_enforced` | 对应已识别合约／账户校验真实约束该付款 | EIP-3009 的签署金额和 nonce |
| `signer_checked` | 当前 signer 在签名前检查，不能据此限制所有后续链外行为 | 所选 quote 尚未过期 |
| `application_checked` | 应用执行策略检查 | 本地预算预留、同一 job 不再签新授权 |
| `advisory` | 请求表达了偏好，但执行端未承诺强制 | 某提案中的 max markup preference |
| `unsupported` / `unknown` | 当前 adapter 无法保证／没有足够证据 | 无合约支持的 actual-gas markup cap |

`onchain_enforced` 必须记录约束的合约、代码／部署识别依据和适用调用；仅看到签名正确不能给这个级别。签名的额外 JSON 字段不自动成为 token 合约校验项。[EIP-712](https://eips.ethereum.org/EIPS/eip-712)

## 8. 状态机与预算

为避免一个状态同时代表四种事实，采用分维度投影：

```text
authorization: absent -> valid -> consumed / expired / cancelled
execution:     not_submitted -> submitted / submission_unknown
               -> chain_confirmed / chain_failed / unresolved
application:   not_delivered -> delivered -> inventory_committed
budget:        available -> reserved -> consumed / released
```

这是工具内投影，不要求上游改成同样的 enum。原始状态必须保留。`chain_confirmed` 表示满足当前配置的确认策略，并记录链／区块依据；如观测到 reorg，需失效旧确认并进入 reconciliation，不能维持成功标记。

核心规则：

1. HTTP 200、verify success、txHash 均不等于链上最终结算或服务交付。
2. 网络 timeout 不证明没提交；`submission_unknown` 保留预算并先 reconciliation。
3. 找不到 txHash 不自动等于可安全释放；授权仍可能被兑现。只有已证明的失败且无残存可执行授权，或安全失效／取消及观察边界成立，才允许释放相关预留。
4. 同一 EIP-3009 nonce 可防止授权再次成功，却不自动阻止同一业务 job 用另一个 nonce 再付款。
5. 外部应用的库存只在其权威状态机提交；本工具可以发现异常，不能替它修改库存。

预算账本至少分 `available`、`reserved`、`spent` 和 `refunds_received`。退款有独立证据；“应退”不是“已退”。使用显式 double-entry 测试账户检查守恒，不用一个 balance 变量同时承担净资产和可用额度。

## 9. MVP 测试矩阵

| ID | 情形 | 预期结果 |
|---|---|---|
| Q01 | quote 过期 | 拒绝新选用；不声称已提交付款会自动撤销 |
| Q02 | quote chain／asset／payee 与 job 不符 | 关联检查失败 |
| Q03 | 6 与 18 decimals 混淆 | 明确金额／资产错误 |
| F01 | 商家包价又加 gas 到 payer total | 重复计费提示 |
| F02 | provider 未披露执行费 | unknown／incomplete，不按免费排名 |
| A01 | 改变 EIP-3009 value／payee | 本地验签／执行失败 |
| A02 | 自定义签名结构冒充 EIP-3009 | unsupported／schema mismatch |
| X01 | verify 成功但链上 revert | 不产生成功付款或库存提交 |
| X02 | HTTP timeout 后迟到确认 | 保留原 intent，最终只消费一次预算 |
| X03 | 同 job 新 nonce 造成第二次支付 | 业务重复付款 finding，即使两次链交易都合法 |
| X04 | 同一有效授权重复提交 | 最多一次成功；第二次 gas 浪费单列 |
| X05 | 授权过期、取消与提交并发 | 按最终可验证状态处理，不仅按本地时钟释放 |
| C01 | receipt gas 与 gas limit 混用 | 成本口径错误 |
| C02 | 缺少链特有费用 | partial-cost coverage，不输出 total-cost verified |
| R01 | 退款承诺存在但退款未到账 | refund pending，不减少实际支出 |
| R02 | 链确认后业务提交失败 | confirmed-uncommitted，不能展示 settled |

首版可只实现通用 EVM base fee 项；不支持的 L2 data fee 必须降级 coverage，不能因为缺字段返回 0。

## 10. CLI 与报告体验

下面是**拟议接口，尚不是已存在的可执行命令**：

```text
x402-lab run --case timeout-late-confirmation --driver local
x402-lab check --trace trace.jsonl --rules fees-and-settlement
x402-lab report --input findings.json --format html
```

报告第一页应回答：检查了谁、哪个版本、哪条链、多少规则、哪些未覆盖；实际费用归谁承担；当前结算是否已确认；发现的关键差异是什么。展示 raw evidence 的引用／digest，不默认渲染可被再次使用的付款签名或私密请求内容。

建议结果枚举 `pass / fail / inconclusive / not_applicable`。退出码区分 conformance fail、证据不全和运行器错误；CI 可以设置“哪些 coverage 缺失导致失败”，不能让没有运行的检查显示通过。

## 11. 与另外两份方案的关系

- `arena-execution-bench` 消费发布的 JSON Schema、失败 fixtures 与证据标签；其经济模型由自身拥有。
- Arena402 消费工具输出，或从后端导出脱敏 trace；浏览器不读数据库、不直接计算权威账本。
- 两者均不能把 lab report 当作自动扣费许可，也不能把本地测试 token 的成功升级为生产收款证明。

首次 Arena 接入建议只读：对一个历史 intent 展示 quote／授权／receipt 是否对应。等证据导出稳定后，再讨论把规则放到服务端 preflight。

## 12. 10 个工作日计划

| 时间 | 工作 | 验收 |
|---|---|---|
| D1–D2 | 固定协议 revision、schema、金额与费用归属 | 正反样例可验证，unknown 语义清楚 |
| D3–D4 | 纯检查器、scripted provider、状态 replay | 成功与 timeout 两条完整 trace |
| D5–D6 | 本地链／test token／标准 x402 adapter | 从 challenge 到 receipt；可重复本地执行 |
| D7–D8 | 关键失败测试、原始证据关联、CI | 重复支付／迟到确认测试有真实断言 |
| D9 | 报告、教程、兼容性说明 | 新用户无需真实资金即可运行 |
| D10 | 一次外部开发者试用或自查、修正文档 | 已测／未测能力逐项列出，准备 v0.1 |

建议本地 case 默认 60 秒硬超时、套件 5 分钟；慢 case 独立配置。任何失败应保留 trace，不自动无限重试。此处是运行器设计，不代表本次已经执行测试。

## 13. 发布与继续投入标准

建议代码使用 Apache-2.0；原始合成 fixtures 可采用兼容开放许可，外部抓取 trace 按来源权限处理。依赖许可证在发布前核对。首版交付目标为一个仓库、一个 CLI、一个公开兼容性清单，不创建多个 npm 品牌。

公开贡献优先给上游提供小型可复现 case：费用 schema 歧义、标准验签不兼容、unknown 恢复等。不要泛发“我们创建了一个新标准”的宣传 PR。

继续条件：至少两种独立实现暴露不同且可重现的集成问题；有开发者愿意把套件放进 CI；测试资产能随上游版本维护。若只剩 JSON 美化，缩成现有 x402 测试工具的扩展；若上游接受大部分能力，则优先上游维护，独立 repo 不必成为目标本身。

## 14. 首次实现的起点

**先做 `timeout -> late confirmation -> no duplicate business payment` 这一个 case。** 它同时牵涉付款授权、预算预留、网络证据和恢复，能检验这套抽象是否有真实价值。第二个 case 再做 fee payer／total debit，随后扩展其余矩阵。
