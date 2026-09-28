# Arena Execution Bench

**你的 Agent 会不会重复付款？先用模拟钱测一遍。**

[![CI](https://github.com/sunruize93-cmyk/arena-execution-bench/actions/workflows/ci.yml/badge.svg)](https://github.com/sunruize93-cmyk/arena-execution-bench/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

**中文** · [English](README.en.md) · [快速上手](#快速上手) · [下载安装包](https://github.com/sunruize93-cmyk/arena-execution-bench/releases)

一个本地运行的 **AI Agent 支付决策测试场**：模拟付款迟迟未确认、低价但容易失败的服务、被占用的预算，比较策略表现，并回放每一笔模拟账目。

**内置示例不需要真钱、钱包、链节点、GPU 或模型 API key。**

## 为什么做？

付款没有回音，Agent 是继续等，还是再付一次？便宜的服务经常失败，还值得选吗？账上有钱，但钱还被锁着，下一单怎么办？

这些问题要测清楚，得先搭模拟环境、记账和回放工具。我把这套基础工作开源出来，希望帮做 Agent 的朋友**省下从零搭建的时间，专心测试自己的策略**。

## 能帮你做什么？

| 你想排查的问题 | 可以怎么测 |
| --- | --- |
| 没收到确认就重试，会不会付两遍？ | 对照已知／未知状态，观察重付请求是否被拦截，以及放行后的模拟损失 |
| 低价但易失败，真的划算吗？ | 调整费用和失败概率，比较选择与净收益 |
| 预算被占用，会不会错过下一单？ | 改变资金释放时间，检查可用余额和后续任务完成情况 |
| 我改的策略到底有没有用？ | 使用相同场景和 seed 对照内置基线，重放轨迹、比较结果 |

适合做**自动采购、付费工具调用、Agent 支付集成**的开发者，也适合需要可控决策实验的研究者。先跑内置规则，再按需[接入自己的模型](docs/AGENTS.md)。

## 快速上手

需要 Python 3.10+：

```bash
git clone https://github.com/sunruize93-cmyk/arena-execution-bench.git
cd arena-execution-bench
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .

# 无 key 演示：同一个错误重试策略，遇到不同状态和保护规则会怎样？
python examples/no_key_demo.py

# 跑完整机制套件，查看生成的 report.md
aeb run --suite mechanism-v1 --policy expected-cost --seed 7 --out runs/first
```

Windows 使用 `.venv\Scripts\Activate.ps1` 激活环境。可选的子进程模型适配器目前支持 macOS/Linux。

<details>
<summary>展开看一个结果：把“未知”当成“失败”，会发生什么？</summary>

同一组价格、任务和随机条件下，一个故意写错的重试策略得到以下结果：

| 情况 | 模拟重复付款次数 |
| --- | ---: |
| 提交状态已知，开启保护 | 0 |
| 提交状态未知，开启保护 | 0 |
| 提交状态未知，允许危险的新授权 | 6 |

运行上面的无 key 示例即可复现（seed 7）。这是一个规则策略的诊断案例；每次模拟付款都受预算约束，服务价值只计算一次。

</details>

## 比较策略

```bash
aeb run --policy cheapest --seeds 0,1,2,3,4,5 --out runs/cheap
aeb run --policy expected-cost --seeds 0,1,2,3,4,5 --out runs/expected
aeb compare --runs runs/cheap runs/expected --paired-by seed --out runs/comparison
```

已经提供四类场景、规则／统计基线、一个适用范围明确的单任务精确 DP，以及轨迹重放、配对分析和公共 Arena 文件导出。模型接口支持调用数、token、费用核算和超时限制。

当前 v0.1 的 **65 项测试通过，168 个本地模拟 episode 已完成并重放验证**。[查看结果与复现方法](artifacts/mechanism-v1/README.md)。

## 想继续用、改或贡献？

- **了解实现：**[英文完整说明](README.en.md) · [执行与记账语义](docs/SEMANTICS.md)
- **做实验：**[场景文件](src/aeb/data/scenarios) · [实验协议](docs/EXPERIMENTS.md) · [模型接口](docs/AGENTS.md)
- **参与贡献：**[提交 Issue](https://github.com/sunruize93-cmyk/arena-execution-bench/issues) · [贡献指南](CONTRIBUTING.md)

欢迎带着一个场景、一个 seed 和一个复现结果来提 Issue。补充场景、接入模型、改进文档都很有帮助。**如果这个工具对你有用，也欢迎点个 Star，让更多人找到它。**

目前全部结果来自合成模拟，尚未运行付费 LLM 对比。Lab 契约使用明确标记的临时版本；Arena 接入提供文件导出，生产端仍需后端对接。[详细边界](docs/INTEGRATION.md)。

## 开源协议

Copyright © 2026 Arena Execution Bench contributors。原创代码、文档、合成场景和测试轨迹采用 **[Apache-2.0](LICENSE)**，允许按协议商用、修改和分发。分发时需附带协议、保留相关声明并标注修改；具体条款见英文协议原文。

[中文使用说明](LICENSING.md) · [版权与来源声明](NOTICE)
