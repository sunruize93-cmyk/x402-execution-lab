# x402 Execution Lab

**先在电脑上试试：AI 付款出错时，会发生什么？**

[English](../README.md) · [MIT 开源](../LICENSE) · [GitHub](https://github.com/sunruize93-cmyk/x402-execution-lab)

这是一个给开发者用的免费开源测试工具。你可以在自己的电脑上，用测试币模拟付款超时、重复付款和费用错误，再打开报告看结果。

## 为什么做它？

假设你付款时，页面一直转圈。你又试了一次，后来才发现付了两遍。

软件也会遇到同样的问题：**请求超时了，不代表钱没付出去。** 如果程序直接发起第二笔付款，就可能为同一件事付两次钱。

我做这个工具，是想让开发者在接入真实资金前，就能把这些情况跑一遍，找到哪里出了问题。

## 它和 x402 有什么关系？

[x402](https://x402.org/) 让软件在请求在线服务时完成付款。比如，一个 AI 助手可以自动付费，获取一份数据。

Execution Lab 提供一个本地测试环境，让你检查这笔付款遇到意外时，程序有没有处理好。

```text
选一个场景 → 用测试币在本地运行 → 打开报告看结果
```

## 为什么用它？

你可以直接从 **20 个现成场景**开始，反复运行同一种错误，检查修复是否有效，也能把结果分享给其他开发者。

| 遇到的情况             | 报告帮你检查什么                         |
| ---------------------- | ---------------------------------------- |
| 付款请求超时           | 原来的付款后来有没有成功？               |
| 程序重新付款           | 同一件事是不是付了两遍？                 |
| 费用对不上             | 哪些费用由谁承担，实际扣款是否符合约定？ |
| 钱已付出，服务却没完成 | 付款成功和服务完成有没有被混为一谈？     |

适合正在给 AI 应用接入 x402、修改付款重试逻辑，或者排查一笔历史付款的开发者。报告既能在浏览器中阅读，也能放进自动测试流程。

## 先跑一个例子

需要 Node.js 22 或 24、npm，以及 macOS 或 Linux。**不用给钱包充值，也不用单独安装区块链软件。**

```sh
git clone https://github.com/sunruize93-cmyk/x402-execution-lab.git
cd x402-execution-lab
npm ci
npm run build

node dist/packages/cli/index.js run \
  --case timeout-late-confirmation --driver local --out artifacts/timeout
```

这个例子会先发起付款，中断响应，再核对原来那笔付款的结果。预期结果是：**只付一次，只扣一次。**

打开 `artifacts/timeout/report.html`，就能看到付款金额、费用承担方、付款状态，以及发现的问题。用于程序读取的 JSON 文件也会一起保存。

想看看它如何发现错误，可以运行：

```sh
node dist/packages/cli/index.js run \
  --case duplicate-business-payment --driver local --out artifacts/duplicate
```

这个例子会故意为同一件事付两次钱。**显示 `FAIL` 是预期结果，说明工具发现了重复付款。** 报告在 `artifacts/duplicate/report.html`。

## 当前做到哪一步？

v0.1 已提供本地付款测试和付款记录检查。演示使用真实 x402 SDK，在临时区块链上转移测试币；服务交付环节是模拟的。

工具负责发现问题，应用负责修复。真实支付服务商和生产资金接入还需要另外验证。具体范围见[兼容性清单](compatibility.md)。

## 想继续了解

- [命令行、自己的付款记录和代码接入](adapters.md)
- [费用、退款和付款状态的检查规则](semantics.md)
- [测试与贡献指南](../CONTRIBUTING.md)

有想测试的付款问题，欢迎[提 issue](https://github.com/sunruize93-cmyk/x402-execution-lab/issues)，附一个去除敏感信息的小例子。觉得有用，也欢迎点个 Star。

项目使用 [MIT 许可证](../LICENSE)，依赖库保留各自的许可证，见 [NOTICE](../NOTICE)。
