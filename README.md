# ▲ Monad PreFlight

> 🌐 **中文** · [English](README.en.md)

**签名之前，先看清楚。**

**在线体验：[monad-preflight.vercel.app](https://monad-preflight.vercel.app)** — 默认连接测试网，自带浏览器钱包并领取 [测试网 MON](https://faucet.monad.xyz) 即可使用。

PreFlight 是 Monad 网络上的交易「副驾驶」。你用自然语言说出想做的事——它准备交易、基于链上实时状态模拟、逐条解释会发生什么以及可能出什么问题，然后才由你决定是否签名。交易上链后，PreFlight 还会核对链上实际结果是否与预期一致，逐行比对。

支持 **Monad 主网与测试网**。诞生于 Monad Playground 黑客松（Moss Onchain Agent 方向：*prepare → simulate → explain → 再让用户决定*），以生产标准打造。

一个仓库里包含三样东西：**核心引擎**（无 UI 的确定性 TypeScript SDK——`src/lib`，通过 `src/lib/sdk.ts` 导出）、**应用**（你正在阅读的参考集成），以及 **Risk API**（`workers/risk-api.ts`，把引擎封装成无状态 HTTP 服务，供钱包和 dApp 使用）。集成方请从 [docs/INTEGRATION.md](docs/INTEGRATION.md) 开始。

---

## 要解决的问题

用户常常在「盲签」。钱包弹窗展示的是原始十六进制 calldata、一个 gas 数字和一个确认按钮——这正是资金丢失的方式：打错地址、给盗币者无限额度授权、那些注定会失败却仍烧 gas 的交易。钱包只展示 *你被要求签什么*；几乎没有任何东西展示 *实际会发生什么*。

## PreFlight 能做什么

| | |
|---|---|
| 🗣 **自然语言意图** | `send 0.5 MON to alice`、`approve … to spend 100 USDC`、`wrap 1 MON`、`unwrap all my WMON`、`revoke …'s access` — 或者粘贴从任一 dApp 弹窗复制来的原始交易 JSON，PreFlight 会解释它原本要做什么。也支持简体中文（`发送 0.5 MON 到 0x…`），确定性解析，无需 AI |
| 🧳 **多步旅程** | `wrap 1 MON then send 0.5 WMON to 0x…` 会变成一个有序旅程——每一步都单独模拟、解释并*单独签名*。第二个签名永远不会藏在第一个后面 |
| 🔬 **真实模拟** | 每个计划都通过实时 RPC 的 `debug_traceCall` 执行：完整调用树、解码事件、revert 原因、gas——不是猜测，而是基于当前链上状态的演练 |
| 🎯 **就绪仪表** | 一个分数、一个结论（Cleared / Hold / Grounded）、一句建议——因为没人会读十五条警告 |
| 💡 **资产变动预览** | "你发送 0.5 MON · 0x12…cd 收到 0.5 MON · 费用 ≈ 0.0002 MON"——从 trace 中的 Transfer/Approval 事件和原生价值流解码而来 |
| 🚨 **风险告警器** | 15 条确定性规则加 4 项链上对手方检查：无限授权、授权给个人钱包的「盗币者模式」、从未使用（打错？）的收款人、必然 revert、转向零地址的销毁等等——按严重程度排序，无行话 |
| ⏱ **漂移检测** | 在你签名前立即重新模拟，并告诉你阅读期间链是否发生了变化——「模拟后再签名」诚实的收尾 |
| 🎭 **反欺诈（Monad 上线攻击）** | 地址投毒仿真、代币符号伪装、零金额转账诱饵——基于*你自有*联系人和代币做确定性检测，无需黑名单 |
| ⚡ **实测而非宣称** | 每份飞行计划都打印其完整检查的真实延迟（模拟 + 链上读取，含你的往返）；`npm run bench` 可在任意机器复现 |
| 🏚 **授权机库** | 扫描近期窗口内的链上 Approval 事件，实时核验每个额度，展示发现的授权对象——一键撤销。它会标明区块窗口，并在部分扫描失败时如实说明而非暗示清白 |
| ✒️ **签名检查器** | 在签名前解释 EIP-712 permit（ERC-2612、Permit2）。签名不消耗 gas 且在钱包里看不出内容——这正是盗币者偏爱它的原因 |
| 👁 **旁观者模式** | 只读检查任意地址，无需钱包——检查朋友的账户是否有盗币授权，或在交互前做审计 |
| ✍️ **你的钥匙，你的钱包** | PreFlight 从不接触私钥；由你自己的钱包签名。它只负责*准备*和*解释* |
| ✅ **上链后核验** | 交易确认后，将收据与签名前模拟逐条对比：结果、每一笔代币变动、费用——匹配或标记 |
| 🌏 **中文 / English** | 双语词典（每语言 121 个键，经 parity 测试）贯穿所有面板，并支持中文意图解析。由链上数据生成的文本（风险发现、解释）目前仅有英文——见路线图 |
| 🤖 **可选 AI 副驾驶** | Claude 解析规则语法无法处理的措辞并撰写简短叙述——严格限定在模拟器已验证的事实内，并明确标注。无 AI 应用也 100% 可用 |
| 🧰 **引擎 SDK + Risk API** | 整个流水线是无 UI 库（`assessTransaction`——一次调用：模拟 → 风险 → 评分 → 解释）加一个无状态确定性 HTTP 服务，供钱包和 dApp 使用。应用只是参考集成——[docs/INTEGRATION.md](docs/INTEGRATION.md) |

完整功能参考：[docs/FEATURES.md](docs/FEATURES.md)。

## 为 Monad 当下的需求而建

社区对这个夏天生态系统的公开难题表达得很明确，本项目正是针对它们。

**「我们需要新一代高性能 Monad 应用。」** *（@emil_pepil 及社区反复提及的诉求，2026 年 7 月。）* PreFlight 的核心交互只有在如此快的链上才顺畅：每次准备都执行一次完整 `debug_traceCall` 模拟加十余次链上实时读取，签名时再跑一次（漂移检测），落地后再跑一次（上链后核验）。这条流水线的实测延迟会打印在每份飞行计划上——你的数字、你的网络，不是我们的宣传——`npm run bench` 可在任意机器复现。诚实的样本：从我们位置最差的测试席位（地球另一端，经代理），完整检查约 p50 ≈ 1.8 秒*含 10 余次网络往返*；你离 RPC 越近，这部分消失得越多。

**留住流动性。** *（「它现在最需要的是……能多年来持续留在 Monad 的流动性……真实而粘性的网络效应」——@zayn4pf。）* 用户会离开让他们被洗劫的链，留在能看清所签内容的链。这就是为什么引擎以 SDK 和无状态 [Risk API](docs/risk-api.md) 形式发布：把签名前保护做成任何 Monad 钱包或 dApp 都能嵌入的生态属性，而不仅是某个应用的功能。在 [Phantom 宣布将于 2026 年 8 月 26 日终止 Monad 支持](https://www.cryptotimes.io/2026/07/25/phantom-pulls-the-plug-on-monad-less-than-a-year-after-launch/) 后，这更重要而非更次要——链原生的安全基础设施不应依赖任何单一钱包留存。

**以及 Monad 实际遭遇的攻击。** 主网上线 48 小时内，骗子就[用伪造 ERC-20 转账淹没整条链](https://coinjournal.net/news/monad-mainnet-scam-alerts-rise-as-fake-erc20-transfers-spread-across-new-chain/)——伪造的 Transfer 事件（有些看似来自联合创始人 James Hunsaker 自己的钱包）在历史记录里植入仿冒地址，把用户引向恶意授权；[盗币者正是系统性瞄准这个窗口期的新链](https://www.blockaid.io/blog/how-wallet-drainers-exploit-new-blockchain-launches)。PreFlight 确定性检测整条杀伤链——模仿你已存联系人的仿冒收款人（地址投毒）、在错误地址佩戴已知符号的代币（伪装）、零金额转账（投毒原语）——全部本地比对，没有会过期或被审查的黑名单。详见 [SECURITY.md](SECURITY.md)。

## 实时 vs. 模拟（诚实对照表）

核心流程里一切都是实时的：准备（viem）、模拟（`debug_traceCall` 配合 callTracer + withLog）、风险评估（链上查询：代码、nonce、余额）、签名（你的钱包）、上链后（已确认收据）。**唯一**可选的部分是 AI 层，且其输出在 UI 中明确标注。**产品中没有任何部分是 mock。** 当 RPC 无法提供深度 trace 时，PreFlight 会诚实地降级：执行基础检查并*告知你*预览只是部分的。

## 安全模型

- **私钥：** 永不接触。PreFlight 构建未签名交易；钱包负责签名。
- **AI 密钥（本地模式）：** 自带 Anthropic 密钥，仅存于浏览器 localStorage，仅发送给 Anthropic。生产部署请使用自带的 [origin-locked 代理](docs/ai-proxy.md)，让密钥永不进入浏览器。
- **无追踪：** 无分析、除 RPC（以及启用 AI 时的 Anthropic）外无任何第三方调用。
- **模拟诚实性：** 模拟是针对*当下*状态的尽力而为预览，不是对已确认结果的保证——上链后检查正是为了让其可验证而存在，UI 也如实说明。

## 运行

```bash
npm install
npm run dev          # → http://localhost:5173
```

需要浏览器钱包（MetaMask 或兼容）。PreFlight 会自动添加/切换网络——默认 Monad 测试网（10143），通过切换器可切到主网（143）。测试网 gas：[faucet](https://faucet.monad.xyz)。

```bash
npm test             # 685 个单元测试（离线、确定性）
npm run test:e2e     # 13 个 LIVE 测试，针对真实 Monad 测试网与主网 RPC——
                     # 从近期区块发现真实代币并核验整条流水线，外加 RPC 故障转移、
                     # 费用读取、合约指纹、Multicall3 余额与授权扫描
npm run build        # 严格类型检查 + 生产构建
npm run verify:sdk   # 构建引擎 SDK（dist-sdk/）并对产物做冒烟测试
```

## 工作原理

```
 "send 0.5 MON to 0xabc…"       或        粘贴原始 tx JSON
        │
        ▼
 parseIntent ────────── 规则语法；Claude 兜底（可选，已标注）
        ▼
 buildTx (viem) ─────── 未签名交易：to / data / value + 人类可读摘要
        ▼
 simulateTx ─────────── debug_traceCall → 调用树、事件、revert 原因、
        │               gas；链上读取 ERC-20 元数据；RPC 故障转移
        ▼
 assessRisks ────────── 15 条确定性规则 → 按严重程度排序的发现
        ▼
 composeExplanation ─── 自然语言、第二人称、零行话
        ▼
 飞行计划 ───────────── 你阅读、你决定、你的钱包签名
        ▼
 comparePostFlight ──── 已确认收据 vs. 模拟，逐行比对
```

每个模块都很小、有单元测试、并写成可逐行解释。类型契约在 `src/lib/types.ts`；设计系统在 [DESIGN.md](DESIGN.md)（字体：B612——由空客为驾驶舱显示器定制；PreFlight 是仪表盘，所以用驾驶舱字体排印）。

## 部署

静态应用——任何静态托管都行。完整指南：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。生产环境使用 AI 副驾驶时，请部署 [Cloudflare Worker 代理](docs/ai-proxy.md)（密钥在服务端、origin-locked、限流）。

### 演示代币（测试网）

```powershell
$env:PRIVATE_KEY = "0x<已充值的测试网密钥>"
npm run deploy:token
```

部署 `contracts/DemoToken.sol`——tUSD、6 位小数（故意的：用来证明小数运算）、公开 `faucet()` 每次调用发放 100 tUSD。把地址粘贴到 *设置 → Teach PreFlight a token*（设置 → 教 PreFlight 一个代币）。

## 路线图

- **Swap 支持**：通过链上 DEX 路由，同样的 准备→模拟→解释 流程
- **钱包扩展伴侣**：拦截任一 dApp 的请求并就地做 pre-flight（扩展会嵌入与应用相同的 `assessTransaction` 流水线）
- ~~Risk API~~ — **已发布**为参考 worker：[docs/risk-api.md](docs/risk-api.md)。仍待做：生产级加固（鉴权、配额、缓存）并落地首个集成伙伴
- *发送*批量交易（EIP-5792 `wallet_sendCalls`）——批量*解释器*已发布；组合与提交尚未完成
- 超出近期区块窗口的历史授权扫描（基于索引器）
- 把生成的叙述（风险发现、解释、模拟说明）翻译成中文——UI 界面今天已完全双语
- 内置 Monad 蓝筹代币（USDe、sUSDe…）的权威代币注册表，让符号伪装防护零配置生效——刻意延后，等新部署的地址稳定并能在链上交叉验证之后；错误的权威条目比没有更糟
- Aave v3 动词解码（supply / withdraw / borrow / repay），让 Monad 上流量最高的 DeFi 流程以自然语言呈现，而不是「不可读的原始调用」


## 许可证

[MIT](LICENSE)
