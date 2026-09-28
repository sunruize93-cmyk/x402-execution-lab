# Decision Bench · 决策测试模块

**在模拟环境里比较：Agent 应该选谁、等多久、什么时候重试。**

这是 [x402 Execution Lab](https://github.com/sunruize93-cmyk/x402-execution-lab) 的 Python 决策测试模块，由 Arena Execution Bench 合并而来。完整项目介绍和联合工作流见[项目首页](https://github.com/sunruize93-cmyk/x402-execution-lab#readme)；本页保留独立运行方法。[English](README.en.md)。

本模块用合成服务商、虚拟时间和模拟账本比较策略；支付执行模块使用 x402 SDK 和本地测试链检查实际付款流程。两种结果分别保留来源，不把模拟收益当作真实收入。

## 独立上手

需要 Python 3.10+。以下命令从合并后的仓库根目录开始：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ./bench
cd bench
python examples/no_key_demo.py
aeb run --suite mechanism-v1 --policy expected-cost --seed 7 --out runs/first
```

Windows 使用 `.venv\Scripts\Activate.ps1` 激活环境。无 key 示例和规则策略不调用模型，不需要钱包或链节点。下载独立 Python 源码包时，可在解压后的模块目录运行 `python -m pip install .`。

`runs/first/report.md` 汇总各场景的收益、重复付款和结果覆盖情况。每个 episode 还保留场景、公共事件、决策和账目，供重放验证；`evaluator.jsonl` 和 `checkpoint.json` 属于评估器内部数据。

## 比较策略

```bash
aeb run --policy cheapest --seeds 0,1,2,3,4,5 --out runs/cheap
aeb run --policy expected-cost --seeds 0,1,2,3,4,5 --out runs/expected
aeb compare --runs runs/cheap runs/expected --paired-by seed --out runs/comparison
```

比较按相同场景和 seed 配对，不会静默丢弃未匹配的实验。输出含均值差和配对 bootstrap 区间；单个 seed 不给置信区间。

- **场景：**失败风险、延迟确认、预算占用，以及公开／隐藏信息下的混合任务；提供 train、dev、eval 划分。
- **策略：**最低价、最快、预期成本、贝叶斯、Thompson、预算感知、故意错误的重试策略和受限单任务精确 DP。
- **执行边界：**`guarded` 会拦截不安全的重复付款请求；`diagnostic` 只在模拟环境中放行它们，以观察损失。
- **自定义模型：**可通过子进程适配器传入自己的策略，显式设置调用数、token、费用和超时上限。默认示例不发起付费调用。

## 重放与资料

```bash
aeb verify --episode runs/first/episodes/late-unknown-dev--seed-7
aeb replay --trace runs/first/episodes/late-unknown-dev--seed-7/events.jsonl
```

[执行与记账语义](docs/SEMANTICS.md) · [实验协议](docs/EXPERIMENTS.md) · [模型接口](docs/AGENT_INTERFACE.md) · [契约与文件导出](docs/INTEGRATION.md) · [贡献指南](CONTRIBUTING.md)

[历史开发实验](artifacts/mechanism-v1/README.md)保留原始版本、提交和摘要；它们不是合并后重新执行的结果。Arena 导出是带 `synthetic` 标记的文件，不代表已经接入 Arena 402 生产服务。

本模块沿用 [Apache-2.0](LICENSE)，相关来源声明见 [NOTICE](NOTICE)。根目录的 MIT 协议适用于支付执行模块，不替代本模块协议。
