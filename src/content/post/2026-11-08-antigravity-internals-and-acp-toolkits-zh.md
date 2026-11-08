---
title: "逆向 Google Antigravity：owl 对抗引擎与 ACP 工具链"
description: "深度逆向 Google Antigravity CLI (agy v1.5.1/v1.5.3) 的 /boost (owl 三层对抗引擎) 与 19 项 Subagent 反射结构，并开源 paseo-agy-acp、pi-agy-acp、agy-sbx-kit 与 xurl 工具链。"
publishDate: 2026-11-08T16:00:00+08:00
updatedDate: "2026-11-08T16:00:00+08:00"
lang: "zh"
draft: false
tags: ["antigravity", "agents", "reverse-engineering", "acp", "ai"]
---

> **渐进式阅读导航（Progressive Disclosure）**
>
> - **Layer 1（1 分钟速览）**：阅读本文开篇的 **TL;DR 核心结论表** 与 **四层扩展架构全景**，或直接前往站内 **[`/tools/antigravity/` 在线配置器](/tools/antigravity/)** 使用交互式 Subagent YAML 生成器与 `/boost` 规则配置器，在 **[`/lab/`](/lab/#paseo-agy-acp)** 查看全部开源插件。
> - **Layer 2（10 分钟机制与工程实践）**：阅读第一部分的 **`owl` 三层对抗流水线**、**`EGM` vs. `/boost` 业务分工**，以及第二部分的 **ACP 协议桥接与沙箱工具链设计**。
> - **Layer 3（15 分钟二进制取证）**：深入文中的 ELF `.gopclntab` / `.data.rel.ro` / `.rodata` 虚拟地址（VMA）证据链与 Go 伪代码还原。

---

## 引言与 TL;DR：为什么要逆向 `agy` 并构建开源工具链？

Google Antigravity CLI（`agy`）是 Google DeepMind 面向 Agentic Coding 推出的原生命令行与多智能体运行时。与传统的单轮补全或薄封装 CLI 不同，`agy` 在一个编译后的 Go 二进制文件中内置了完整的多智能体派生原语（`invoke_subagent` / `define_subagent`）、多模态工具栈、代号为 **`owl`** 的三层对抗式编码/排障引擎（即 `/boost` 命令），以及原生的 **ACP（Agent Client Protocol）** 服务端模式（`agy acp`）。

然而，在实际重度工程使用中，我们很快会遇到三类痛点：

1. **核心机制黑盒化与文档失真**：`/boost` 究竟是不是一个 `SKILL.md`？为什么直接对模型说「使用 boost 进行排查」会被拒绝？官方文档宣称的「预探测工作区」与「隔离工作树（Ephemeral isolated worktrees）」在底层真的存在吗？`.agents/agents/<name>.md` 到底支持哪些未公开的 YAML 字段？
2. **跨端协同与编排割裂**：当我们希望在 [Paseo](https://paseo.sh)（跨桌面/移动端编排宿主）或 [Pi Coding Agent](https://pi.dev) 中复用 `agy` 订阅内的旗舰模型（如 `gemini-4-argon-high`、`claude-opus-5-5-high`、`gpt-oss-120b-medium`）与原生能力时，缺少高质量的 ACP 协议桥接层。
3. **无头沙箱、轨迹审计与配额瓶颈**：在 Docker 容器或远程 SSH 环境无头运行 `agy` 时，默认的 `localhost:36742` OAuth 回调会卡死；本地 `brain/<id>/` 下的 JSONL 轨迹缺乏统一的跨 Agent URI 读取工具；单一账号遇到 5 小时或周度配额墙时容易中断长任务。

为了彻底解决这些问题，我对 `agy`（v1.5.1 / v1.5.3 `linux/amd64` PIE ELF）进行了静态逆向取证，并围绕其构建了一套完整的开源插件与工具生态（开源工程已汇总于 **[`/lab/`](/lab/#paseo-agy-acp)**，在线配置器位于 **[`/tools/antigravity/`](/tools/antigravity/)**）：

| 核心问题 / 开源模块                      | 逆向真相 / 工程实现结论                                                                                                                                                                                                              | 在线入口 / 仓库                                                             |
| :--------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| **`/boost` 是 `SKILL.md` 吗？**          | **不是。** `/boost` 是编译期硬编码在 `.data` 段（`0xcbad108` 索引 `[9]`，`0xcbad588`）的 **系统级斜杠命令**，底层驱动代号为 **`owl`** 的三层对抗管线（`Orchestrator -> DeepCoder/DeepInvestigator -> WorkerL0/ImprovementWorker`）。 | [本文 §1.1](#11-boost-并非-skillmd13-个系统级斜杠命令全局表-0xcbad108)      |
| **如何不敲 `/` 自然语言触发 `/boost`？** | 默认词法解析器仅识别句首/句尾 `/boost`。但 `DeepCoder` 与 `DeepInvestigator` 默认已注册进主 Agent 的 `AllowedSubagents` 白名单（`0xcc49000`），写入 `~/.gemini/GEMINI.md` 即可实现纯语义触发。                                       | [在线生成器](/tools/antigravity/#boost-generator)                           |
| **Subagent 支持哪些参数与模型？**        | `customizations.AgentFrontmatter` (`0xbf3a5a8`) 共支持 **19 个 YAML 字段**；`model` 仅接受 `inherit` / `flash_lite` / `flash` / `pro` 四个枚举（`0x8309d00`），可通过 `agy --model <id>` + `inherit` 继承任意具体模型。              | [在线生成器](/tools/antigravity/#subagent-generator)                        |
| **`paseo-agy-acp`**                      | Paseo 的原生 Antigravity ACP 插件（`agy-acp`），支持会话恢复、热进程池复用、工具权限审批、Slash 命令缓存、Brain 子智能体轨迹投影与订阅配额监控。                                                                                     | [`fdkevin0/paseo-agy-acp`](https://github.com/fdkevin0/paseo-agy-acp)       |
| **`pi-agy-acp`**                         | Pi Coding Agent 的 `antigravity-acp` 扩展，支持流式推理、图片输入、并行工具调用、隔离状态目录、拦截空闲缓存预热与 `/agy-acp status\|quota\|reset` 12 格配额面板。                                                                    | [`fdkevin0/pi-agy-acp`](https://github.com/fdkevin0/pi-agy-acp)             |
| **`agy-sbx-kit`**                        | Docker Sandboxes v3 无头运行套件（含 `agy-mixin`），内置 YOLO 免批参数、`SSH_CONNECTION=1` 远程 OAuth 复制粘贴回调、宿主机凭证代理与 9 域名网络白名单。                                                                              | [`fdkevin0/agy-sbx-kit`](https://github.com/fdkevin0/agy-sbx-kit)           |
| **`xurl` (`agents://antigravity`)**      | 通过 `agents://antigravity/<session-id>` URI 直接解析本地 `brain/<id>` JSONL 轨迹为 Markdown，并通过 `stream-json` 无头续写会话。                                                                                                    | [`fdkevin0/xurl`](https://github.com/fdkevin0/xurl/tree/feat/antigravity)   |
| **`pi-multi-account`**                   | 跨 Antigravity、Claude、ChatGPT/Codex 等多账号细粒度配额监控、同品质档位自动故障转移与断点续跑路由。                                                                                                                                 | [`fdkevin0/pi-multi-account`](https://github.com/fdkevin0/pi-multi-account) |

### 一图看懂 `agy` 四层扩展架构与开源 Toolkits 全景

```text
+------------------------------------------------------------+
|         External Agent Hosts & Multi-Account Routers       |
|  [ Paseo Desktop / Mobile ]    [ Pi Coding Agent (1.5.x) ] |
|    via paseo-agy-acp             via pi-agy-acp            |
|        (agy-acp)                   + pi-multi-account      |
+--------------|-----------------------------|---------------+
               | ACP (agy acp)               | Quota (/usage)
               v                             v
+------------------------------------------------------------+
|          Google Antigravity CLI (agy) 4-Layer Stack        |
|                                                            |
|  Layer 1: Go Binary Kernel (jetski/cortex)                 |
|    - 13 System Slash Cmds (@ 0xcbad108): /boost (owl), ... |
|    - 9 Allowed Subagents (@ 0xcc49000): DeepCoder, ...     |
|    - AgentFrontmatter (@ 0xbf3a5a8): 19 YAML fields        |
|                                                            |
|  Layer 2: Builtin Assets (builtin/.manifest, 39 files)     |
|  Layer 3: EGM Plugin (7-way Read-Only Goldfish Audit)      |
|  Layer 4: Ponytail Plugin (Minimalist YAGNI Discipline)    |
+--------------|-----------------------------|---------------+
               | Brain JSONL                 | Container VM
               v                             v
+-----------------------------+ +----------------------------+
| xurl (agents://antigravity) | | agy-sbx-kit (Sandboxes v3) |
| - Reads transcript_full     | | - YOLO + SSH_CONNECTION=1  |
| - Stream-JSON write/resume  | | - 9-domain egress policy   |
+-----------------------------+ +----------------------------+
```

---

## 第一部分：二进制逆向揭秘 `/boost` (`owl` 引擎) 与 Subagent 体系

> **逆向基准环境**
>
> - `agy` v1.5.1（SHA-256: `72738cf0445918483956a5f0da33abdfcfb21a12dd9a421fd57d063782826669`）
> - `agy` v1.5.3（`linux/amd64` PIE ELF，`.text` 段基址 `0x6d15000`，`pcHeader.textStart` `0x6d15080`，`.gopclntab` 偏移 `0x1714500`）

### 1.1 `/boost` 并非 `SKILL.md`：13 个系统级斜杠命令全局表 (`0xcbad108`)

在 `agy` 内部包 `google3/third_party/jetski/cortex/slashcommands` 与 `cli/slashcmd` 中，所有斜杠命令由 `cli/slashcmd.AdvertisedResolvers` (`0x9dc5ba0`) 统一汇总，并严格划分为三类：

1. **系统级命令（System Slash Commands，`GetSystemSlashCommandsDefinitions` @ `0x90f8fc0`）**：编译期直接写入 `.data` 全局数组（基址 `0xcbad108`，共 13 项，每项结构体步长 `0x80` = 128 字节）。
2. **技能级命令（Skill Slash Commands，`GetSkillSlashCommands` @ `0x90f9460`）**：扫描磁盘上的 `SKILL.md` 文件，触发时注入 `<SKILL>The user requested you read and use the %q skill...</SKILL>`（`.rodata` `0x6219799`）。
3. **工作流命令（Workflow Slash Commands，`GetWorkflowSlashCommands` @ `0x90f9a00`）**：扫描 `.agents/workflows/*.md`，注入 `<WORKFLOW>` 标签（`.rodata` `0x6212491`）。

当 `slashcommands.init` (`0x90f89a0 .. 0x90f8dc0`) 完成初始化后，全局切片 `0xcb5e5e0` (`len=13, cap=13`) 指向 `0xcbad108`。其中索引 **`[9]`（地址 `0xcbad588`）即为 `/boost`**：

|   索引    | 结构体 VMA      | 命令名 (`+0x00`) | 展开模式 (`+0x10` / `+0x40`)                         | 图标 (`+0x28`) | 可用性钩子 (`+0x60`)             |
| :-------: | :-------------- | :--------------- | :--------------------------------------------------- | :------------- | :------------------------------- |
|   `[0]`   | `0xcbad108`     | `goal`           | 交互式 Goal 包装器 (`0x90fa060`)                     | `timer`        | `0x90fa380` (校验 `"goal_stop"`) |
|   `[1]`   | `0xcbad188`     | `compact`        | CLI 内置上下文压缩处理器                             | `collapse_all` | `0x90fa400`                      |
|   `[2]`   | `0xcbad208`     | `schedule`       | 动态 `<SCHEDULE>`                                    | `schedule`     | `0x90fa460`                      |
|   `[3]`   | `0xcbad288`     | `browser`        | 动态 `<BROWSER>`                                     | `language`     | `0x90fa500`                      |
|   `[4]`   | `0xcbad308`     | `browser-vision` | 动态 `<BROWSER_VISION>`                              | `visibility`   | `0x90fa640`                      |
|   `[5]`   | `0xcbad388`     | `plan`           | 静态 `<PLAN>` (`0x635a57a`, 3735 B)                  | `ballot`       | `0x90fa780`                      |
|   `[6]`   | `0xcbad408`     | `grill-me`       | 静态 `<GRILL_ME>` (`0x6264f1d`, 491 B)               | `forum`        | `0x90fa7c0`                      |
|   `[7]`   | `0xcbad488`     | `teamwork`       | 动态 `<TEAMWORK>` (`native_swarm`)                   | `graph_2`      | `0x90fa7e0` (校验 `"teamwork"`)  |
|   `[8]`   | `0xcbad508`     | `learn`          | 动态 `<LEARN>` (`0x90f8dc0`)                         | `lightbulb_2`  | `0x90fa840`                      |
| **`[9]`** | **`0xcbad588`** | **`boost`**      | **动态 `<ORCHESTRATOR>` (`owl.OrchestratorPrompt`)** | **`bolt`**     | **`0x90fa860` (`init.func10`)**  |
|  `[10]`   | `0xcbad608`     | `deepagent`      | 静态 `<SUBAGENT>...deepagent`                        | `science`      | `0x90fa8c0`                      |
|  `[11]`   | `0xcbad688`     | `review-agent`   | 静态 `<SUBAGENT>...review-agent`                     | `find_in_page` | `0x90fa9a0`                      |
|  `[12]`   | `0xcbad708`     | `help`           | CLI 内置帮助处理器                                   | `help`         | `0x90faa80`                      |

在指令块 `0x90f8c55 .. 0x90f8cc1` 处，启动期提示词装配逻辑等价于以下 Go 伪代码：

```go
// google3/third_party/jetski/cortex/slashcommands/slashcommands.go
// 反汇编地址: 0x90f8c55 .. 0x90f8cc1
func init() {
    // reuseSubagent = true (AL=1): 抽检不通过时通过 send_message 复用同一 Coordinator 实例
    // runReadabilityAndLint = false (BL=0)
    orchestratorBody := owl.OrchestratorPrompt(true, false) // call 0x86a9a00

    // 格式化模板位于 .rodata 0x613a7ea: "<ORCHESTRATOR>\n%s\n</ORCHESTRATOR>"
    systemSlashCommands[9].Prompt = fmt.Sprintf("<ORCHESTRATOR>\n%s\n</ORCHESTRATOR>", orchestratorBody)
}
```

### 1.2 `owl` 引擎全景：三层对抗式多智能体流水线

`/boost` 的核心实现位于 `google3/third_party/jetski/cortex/customizations/builtin/owl` 及其 4 个子包（`owl/common`、`owl/deepcoder`、`owl/deepinvestigator`、`owl/hooks`）。它之所以无法用单个 `SKILL.md` 实现，是因为它在 Go 内核层构建了一套具有**工具剥夺、提示词分区裁剪与工具调用前钩子（Pre-Invocation Hooks）**的三层对抗式管线：

```text
[用户输入: /boost <任务>]
       |
       v  cli/slashcmd.Expand (0x9dc60a0) -> <ORCHESTRATOR>
+------------------------------------------------------------+
| Tier 1: 主智能体 (Main Agent / Orchestrator)               |
| - 路由: Solo Routine vs. Delegation Routine                |
| - 铁律 1 (No Pre-work @ 0x627fa12): 委派前严禁读文件防锚定 |
| - 铁律 2 (Spot-Check @ 0x623f1f8): 独立跑测试做最终抽检    |
+--------------|-----------------------------|---------------+
               | 编码/重构/测试              | 排障/逆向/追踪
               | Workspace="inherit"         | Workspace="inherit"
               v                             v
+-----------------------------+ +----------------------------+
| Tier 2: DeepCoder           | | Tier 2: DeepInvestigator   |
| (0x86a7cc0, Hidden: true)   | | (0x86a8c20, Hidden: true)  |
| - 禁写代码 (Hook 0x8ffb940) | | - 禁改源文件，纯管线编排   |
+--------------|--------------+ +------------|---------------+
               | Step 1: 派发全新 WorkerL0   | Step 1: 派发 WorkerL0
               v                             v
+-----------------------------+ +----------------------------+
| Tier 3: DeepCoderWorkerL0   | | Tier 3: DeepInvWorkerL0    |
| (0x86a7ac0, 10 工具切片)    | | (0x86a89e0, 只读验证)      |
| - 从零实现 + 运行真实测试   | | - 追踪调用链与数据流       |
| - 强制 Skepticism 声明      | | - 强制列出 Remaining Gaps  |
+--------------|--------------+ +------------|---------------+
               | send_message (仅限结束 1 次)| send_message
               v                             v
+-----------------------------+ +----------------------------+
| Step 2: 注入 <prior_attempt>| | Step 2: <prior_attempt>    |
| DeepCoderImprovementWorker  | | DeepInvestigatorImpWorker  |
| (0x86a7bc0, 反橡皮图章)     | | (0x86a8b00)                |
| 1. 读前序报告前先独立审题   | | 1. 先独立理解问题防盲从    |
| 2. 对抗性破坏测试(Break it) | | 2. 质疑前序结论核实证据    |
| 3. 就地修复缺陷并输出报告   | | 3. 补齐前序 Remaining Gaps |
+-----------------------------+ +----------------------------+
```

各层级的二进制设计细节极具工程启发性：

1. **Tier 1 主智能体的「零前置工作（No Pre-work）」与「同实例追问复用」**：
   - 在 `owl.OrchestratorPrompt`（`.rodata` `0x627fa12` & `0x6239bdf`）中，强制规定在 Delegation Routine 下主 Agent 的第一个工具调用必须是 `invoke_subagent`，严禁事先读取文件或制定架构方案（若编写 `implementation_plan.md` 只准写需求，严禁写目录结构，`0x6257477`），从源头防止主 Agent 的先入为主偏见污染子智能体。
   - 当 Tier 2 返回报告后，主 Agent 必须独立检查修改并跑测试；若发现遗漏，由于 `reuseSubagent=true`（`0x623f1f8`），主 Agent 必须通过 `send_message` 发回给**同一个** `DeepCoder`/`DeepInvestigator` 会话 ID。
2. **Tier 2 协调器的「防越权周期钩子」与「追问重置机制」**：
   - `DeepCoder` 与 `DeepInvestigator` 挂载了 `remind_pipeline_coordinator_role` 钩子（`0x8ffb940`，正文构造函数 `CoordinatorReminderBody` @ `0x8ffb5c0`）。每次协调器调用工具时，内核自动注入 4 条警告：（1）严禁亲自修改文件；（2）派发 Worker 后必须立即停止等待，严禁轮询；（3）若 Worker 失败，使用相同 Prompt 重试**最多 4 次**（`0x623a1ba`）；（4）严禁混淆父级 ID 与 Worker ID。
   - 当收到主 Agent 的追问（`## Follow-up Rounds` @ `0x625ea73`）时，协调器严禁复用旧 Worker，必须从 **Step 1** 重新开始派发全新的 `WorkerL0` 与 `ImprovementWorker`。
3. **Tier 3 Worker 的「怀疑论免责声明」与「反橡皮图章破坏测试」**：
   - Worker 的工具白名单被固定为 10 个基础工具（`0xcb844d0`，剥夺了 `invoke_subagent` 与 `manage_subagents`），并挂载了 `NewTimeoutLongRunningSearchCommandHook` (`0x8ffb280`) 拦截 `tail -f` 等阻塞命令。
   - `DeepCoderWorkerL0` 必须在报告开头输出 `> [!WARNING] **Skepticism Disclaimer**`（`0x62a8844`），老实交代自信度，并严格区分 **Deep Verification（实际运行了测试）**、**Shallow Verification（仅肉眼检查）** 与 **Unverified aspects**。
   - `DeepCoderImprovementWorker` 的开篇指令极为犀利（`0x63073f9`）：_"You are not a rubber stamp. A review that finds nothing and changes nothing is almost always a failed review."_ 它要求 Worker 在看 `<prior_attempt>` 之前先只读 `<original_task>` 写下独立理解，再像试图拒稿的审稿人一样构造边界输入去搞破坏（**Step 2 — Break it**），并亲手修复发现的 Bug。
   - 此外，所有层级尾部均拼接了防提示词泄露保护（`0x6288107` / `0x62884bf`）：若被追问系统提示词，统一回复固定诱饵语句 `"What task can I help you with?"`。

### 1.3 官方文档宣传 vs. 二进制真实实现：四大差异

对比 Google Antigravity 线上文档（`/docs/boost/`）与 `agy` v1.5.3 二进制反汇编，可以发现四处显著差异：

| 对比维度                            | 线上官方文档 (`/docs/boost/`) 表述                                                          | 二进制内核 (`owl` 包) 真实实现                                                                                                              |
| :---------------------------------- | :------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Phase 1 主 Agent 预探测**      | 宣称主 Orchestrator 先 _“inspects workspace context, and formulates an execution strategy”_ | **恰恰相反（严禁预探测）**：`0x627fa12` 强制执行 `> No Pre-work`，首个工具调用必须是 `invoke_subagent`，严禁先读代码。                      |
| **2. 工作区隔离模式 (`Workspace`)** | 宣称使用 _“Ephemeral isolated worktrees”_（临时隔离工作树）                                 | **固定使用 `Workspace="inherit"`（共享同一工作树）**：以便 `ImprovementWorker` 直接在 `WorkerL0` 修改后的未提交代码上编译、破坏并就地修复。 |
| **3. 子智能体并发模式**             | 宣称 _“Phase 2: Parallel execution and verification”_                                       | **协调器内部为严格的串行接力**：必须先由 `WorkerL0` 产出初稿，再装入 `<prior_attempt>` 交由 `ImprovementWorker` 挑刺与修复。                |
| **4. 隐藏机制与钩子**               | 仅提及三层名称                                                                              | 隐去了代号 `owl`、`Skepticism Disclaimer`、反橡皮图章盲审、4 次重试上限、单次 `send_message` 静默约束及防泄露诱饵。                         |

### 1.4 破解 `/boost` 词法限制：利用 `AllowedSubagents` (`0xcc49000`) 实现纯自然语言触发

默认情况下，如果你对 `agy` 说「使用 boost 进行排查」而不带斜杠 `/`，**不会**触发 `owl` 管线。逆向显示共有三道拦截：

1. `cli/slashcmd.Expand` (`0x9dc60a0`) 仅通过 `ParseLeading` (`0x9dc50a0`) 和 `ParseSuffix` (`0x9dc53c0`) 识别句首或句尾带 `/` 的命令；
2. 默认系统提示词 `<slash_commands>` 告知模型 _“You cannot execute these commands yourself”_；
3. `DeepCoder` 与 `DeepInvestigator` 的 `Hidden` 位（`+0x40`）为 `1`，被 `SubagentsSection.Content` (`0x9101ff0`) 从主 Agent 的 `<subagents>` 列表中过滤掉了。

**但反汇编 `google3/third_party/jetski/cortex/customizations/builtin/agents` (`0x86ac720 .. 0x86b3e00`) 揭示了一个关键突破口：**

在 `agents.init` (`0x86ac720`) 中，内核初始化了全局内置子智能体准入表 `0xcc49000`（共 9 项：`research`、`research-google`、`jetski-guide`、`browser`、`browser-vision`、`self`、`teamwork`、**`DeepCoder`**、**`DeepInvestigator`**）。只要实验开关 `"enable-owl-slash-command"` (`0x60d47ef`) 开启，`CalculateAllowedSubagents` (`0x86aca60`) 就会将 `DeepCoder` 与 `DeepInvestigator` 放入主 Agent 的运行时允许调用白名单！而 `InvokeSubagentTool.buildSpec` (`0x91da2a0`) 在执行时只查 `AllowedSubagents`，**完全不检查当轮是否输入了 `/boost`，也不拦截 `Hidden: true` 的子智能体**。

因此，只需将以下规则写入 `~/.gemini/GEMINI.md`（也可在 **[`/tools/antigravity/#boost-generator`](/tools/antigravity/#boost-generator)** 中自定义生成），即可彻底打通「使用 boost 进行 xxx」的纯自然语言语义触发：

```markdown
# Boost (OWL Adversarial Pipeline) Semantic Trigger Rule

When the user asks to "use boost", "使用 boost 进行...", or requests boost mode in natural language without typing the `/boost` slash command:

1. Do NOT tell the user to type `/boost`.
2. Follow the **No Pre-work** rule: do NOT read files or search the codebase beforehand.
3. Immediately call `invoke_subagent` with `Workspace: "inherit"`:
   - Set `TypeName: "DeepCoder"` for coding, refactoring, bug fixing, or test writing tasks.
   - Set `TypeName: "DeepInvestigator"` for root-cause analysis, reverse engineering, or codebase research tasks.
   - Pass the user's request verbatim under `**Task**: <user request>`, along with `**Context**:` and `**Scope**:` if applicable.
4. Treat the subagent's report as claims to verify: independently spot-check modified files and run tests before reporting back. If issues remain, use `send_message` to follow up with the SAME `DeepCoder` / `DeepInvestigator` conversationId.
```

### 1.5 `EGM`（大象-金鱼模型）vs. `/boost` (`owl`)：上下游互补工作流

在我的日常 Agentic 工程流中，除了内建的 `/boost`，还重度使用 `EGM`（Elephant-Goldfish Model）插件与 `Ponytail` 极简纪律插件。虽然 `EGM` 与 `/boost` 都致力于消除单智能体长上下文的**确认偏误（Confirmation Bias）**，但两者在业务生命周期上形成了完美的上下游互补：

| 业务维度                | `EGM` (`elephant-goldfish-model` 插件)                                                                                                                                                                                                                    | `/boost` (内建 `owl` 引擎)                                                                                                                            |
| :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. 核心阶段与产物**   | **上半场：架构设计、实施计划与目录契约治理**<br>严守 `Artifact-First` 与 `No Code Generation`，产出设计文档、Implementation Plan 与 `DRIFT_REPORT.md`。                                                                                                   | **下半场：复杂编码实现与深层排障**<br>直接产出通过编译与实证测试的业务代码或代码级根因分析报告。                                                      |
| **2. 主智能体角色**     | **核心执笔者（大象 Elephant）+ 唯一修改者**<br>主 Agent 亲自调研起草文档，并在金鱼盲审后唯一负责修订文档。                                                                                                                                                | **甩手监工 + 最终验收员**<br>委派前严禁读代码（`No Pre-work`），管线跑完后独立运行测试做最终抽检。                                                    |
| **3. 审查者权限与拓扑** | **7 路只读正交金鱼横向并行扇出（Fan-out / Fan-in）**<br>`zoom-out`（砍过度设计）、`design`（架构风险）、`comprehension`（零背景盲审）、`codebase-details`（符号核验）、`implementation-readiness`、`structural`、`style` 全部 `EnableWriteTools: false`。 | **读写合一的单体挑战者纵向串行接力**<br>`ImprovementWorker` 拥有完整写权限与命令执行权（`Workspace="inherit"`），不仅挑刺搞破坏，还必须亲手修好 Bug。 |
| **4. 防锚定技术手段**   | **物理级上下文失忆（Context Amnesia）**<br>每条金鱼在全新会话启动，完全看不到大象起草时的妥协过程与历史对话。                                                                                                                                             | **阅读顺序约束 + 主 Agent 禁读代码**<br>要求 `ImprovementWorker` 在看 `<prior_attempt>` 前先独立审题。                                                |
| **5. 人机交互门控**     | **客观错误自动修 + 主观架构取舍通过 `ask_question` 升级给人类拍板**。                                                                                                                                                                                     | **端到端黑盒全自动闭环**，以实证测试全绿（`Deep Verification`）为收敛条件。                                                                           |

将两者与 `Ponytail` 串联，即构成复杂工程的**三阶段黄金工作流**：

1. **Stage 1（EGM 锁定设计契约）**：`egm-brainstorm` $\rightarrow$ `egm-draft` $\rightarrow$ `egm-review-loop`（7 路只读金鱼并行盲审，把架构漏洞消灭在写代码之前）。
2. **Stage 2（`/boost` 纵向对抗实现）**：将通过盲审的计划交由 `DeepCoder`（`WorkerL0` 初创 $\rightarrow$ `ImprovementWorker` 破坏测试与修复）。
3. **Stage 3（`Ponytail` + `EGM` 收尾验收）**：运行 `/ponytail-review` 砍掉多余包装层，并用 `egm-drift-report` 审计代码实现是否 100% 兑现设计契约。

### 1.6 Subagent 19 项 `AgentFrontmatter` 反射结构 (`0xbf3a5a8`) 与模型继承技巧

当我们在 `.agents/agents/<name>.md`（或全局 `~/.gemini/config/agents/<name>.md`）中持久化定义自定义 Subagent 时，二进制 `.data.rel.ro` 段中的 `customizations.AgentFrontmatter` 反射类型表（`0xbf3a5a8`，字段数组 `0xbf3a608 .. 0xbf3a7c0`）定义了全部 **19 个合法 YAML 字段**：

| 字段分类           | YAML 字段名                                                                             | 类型与逆向校验逻辑                                                                                                                                                                                                                                                                                                                                                    |
| :----------------- | :-------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **基础标识**       | `name`, `description`                                                                   | `string`（必填，不可与内置保留名冲突，由 `ParseAgentScriptItemFromMarkdown` @ `0x8328290` 解析）                                                                                                                                                                                                                                                                      |
| **角色与可见性**   | `mainAgent`, `subagent`, `hidden`, `disabled`                                           | `*bool`（若 `subagent: false` 则禁止被 `invoke_subagent` 调用）                                                                                                                                                                                                                                                                                                       |
| **模型与执行策略** | `model`, `commandExecutionPolicy`                                                       | • `model`（校验函数 `@ 0x830a640`）：仅接受 `inherit`（`1`）、`flash_lite`（`2` $\rightarrow$ `gemini-3.1-flash-lite-preview`）、`flash`（`3` $\rightarrow$ `gemini-3.8-flash-medium`）、`pro`（`4` $\rightarrow$ `gemini-4-argon-high`）<br>• `commandExecutionPolicy`（校验函数 `@ 0x7fb2760`）：严格校验 `off` (`1`)、`auto` (`2`)、`eager` (`3`)、`sandbox` (`4`) |
| **组件与继承控制** | `excludeDefaultComponents`, `inheritCustomizations`, `inheritMcp`                       | `*bool`（`excludeDefaultComponents` 为 v1.2.1 新增，剔除默认提示词段落与内置工具）                                                                                                                                                                                                                                                                                    |
| **工具与能力绑定** | `tools`, `mcpServers`, `skills`, `preloadSkills`, `plugins`, `rules`, `agents`, `hooks` | 控制工具白名单（`[]string`）、独立 MCP 服务、按需/预加载 Skills、允许继续派生的子 Subagent（`agents`）及生命周期 Hooks                                                                                                                                                                                                                                                |

> **实战技巧：如何让 Subagent（包括 `/boost` 下的 Worker）运行 Claude Opus 5.5 等任意具体模型？**
> 虽然 `model:` 字段直接填写 `claude-opus-5-5-high` 会触发 `Invalid model tier` 报错（`.rodata` `0x5e0f52d`），但因为默认的 `model: inherit`（以及 `owl` 引擎内建子智能体的 `MODEL_UNSPECIFIED = 0`）会**原样继承父会话模型**，只需在启动父会话时指定：
>
> ```bash
> agy --model claude-opus-5-5-high
> ```
>
> 此后会话中派生的所有 `inherit` Subagent 与 `/boost` 三层流水线都会自动运行在 `claude-opus-5-5-high` 上！

---

## 第二部分：打通 ACP 协议 — 构建 `paseo-agy-acp`、`pi-agy-acp` 与无头沙箱工具链

完成了对 `agy` 内部机制的逆向后，下一步是通过标准协议将其接入更广阔的工程工作流。`agy` 提供了 `agy acp` 子命令（实现 Agent Client Protocol），但在将其桥接到 **Paseo** 与 **Pi Coding Agent** 的过程中，需要解决一系列非平凡的状态同步、进程生命周期与配额度量问题。

### 2.1 `paseo-agy-acp`：Paseo 的原生 Antigravity ACP Provider 插件

[**`paseo-agy-acp`**](https://github.com/fdkevin0/paseo-agy-acp)（插件 ID `agy-acp`，Provider 名称 `agy`）让用户可以在 Paseo 桌面端、Web、CLI 与移动端直接驱动本地 `agy` 运行时：

```bash
paseo plugin install npm:@fdkevin0/paseo-agy-acp
paseo run --provider agy "Explain this repository"
```

在实现中，`paseo-agy-acp` 重点攻克了五个核心工程细节：

1. **热进程池复用与防符号链接穿透的临时会话清理**：
   每次探测模型目录（Catalog Discovery）都会开启一个未提问的原生 ACP 会话并在读取 `configOptions` 后调用 `session/close`。插件会将健康关闭后的 ACP 进程留在热待机池中供下一个真实会话秒级复用，同时立即清理该临时 UUID 对应的 `conversations/<id>.db`（含 `-wal`/`-shm`）与 `brain/<id>/` 目录（严格校验 UUID 并拒绝跟随符号链接，确保真实历史会话绝对安全）。
2. **1 秒 `available_commands_update` 等待与按 `(cwd, env)` 缓存**：
   为了让 Paseo 的输入框（Composer）在会话就绪瞬间就能弹出 `/boost`、`/teamwork` 等原生斜杠命令，插件在发布 `session.ready` 前设置最多 1 秒的异步等待窗口，并按 `(cwd, env)` 键缓存最新命令表以加速后续会话。
3. **多步推理的上下文窗口占用率折算**：
   `agy` 的轮次响应会将内部多个工具步（steps）的 `inputTokens`、`cachedReadTokens`、`cachedWriteTokens` 累加返回。当未收到原生 `usage_update` 通知时，插件通过跟踪轮次内的工具完成步数 `steps`，按以下公式估算当前上下文水位（默认上限 256,000 tokens，`gpt-oss` 系列为 131,072 tokens）：
   $$\text{singleStepInput} = \text{round}\left(\frac{\text{inputTokens} + \text{cachedReadTokens} + \text{cachedWriteTokens}}{\text{steps}}\right)$$
   $$\text{usedTokens} = \text{singleStepInput} + \text{outputTokens}$$
4. **Brain 子智能体 JSONL 轨迹只读实时投影**：
   当主 Agent 调用 `invoke_subagent` 时，插件校验子会话 `conversationId` 并在 `realpath` 边界保护下增量轮询 `brain/<id>/.system_generated/logs/transcript.jsonl`，将 `USER_INPUT`、`PLANNER_RESPONSE`（思考链与初始运行中工具卡）与 `GENERIC`（按 FIFO 顺序匹配工具完成状态与输出）实时投影为 Paseo 子会话时间线。
5. **5 小时与周度订阅额度监控**：
   通过执行 `agy -p /usage --output-format json`（自动剥离 `acp` 传输参数），解析 `gemini_models` 与 `claude_and_gpt_models` 的 `5h`（18,000 秒）与 `weekly`（604,800 秒）配额窗口，在 Composer 浮层与 `paseo usage ls --json` 中展示精确用量与重置时间。

### 2.2 `pi-agy-acp`：Pi Coding Agent 的 Antigravity 桥接扩展

[**`pi-agy-acp`**](https://github.com/fdkevin0/pi-agy-acp) 将 `agy acp` 注册为 Pi Coding Agent（`1.5.x`）中的 `antigravity-acp` Provider，让 `agy` 订阅内的模型直接驱动 Pi 的本地工具链（支持流式推理文本、图片输入与并行工具调用）：

```bash
pi install npm:pi-agy-acp
```

- **独立状态目录隔离（`PI_AGY_HOME`）**：默认在 `~/.pi/agent/cache/antigravity-acp` 建立专属运行目录，以 `0600` 权限同步 OAuth 令牌，避免桥接进程污染用户日常的 `agy` 会话历史与自定义插件。
- **拦截空闲缓存预热（Veto Prompt-Cache Warming）**：自动否决 Pi 宿主的后台空闲缓存预热请求，防止后台心跳静默消耗宝贵的 5 小时模型配额。
- **TUI 12 格配额看板与低额度告警**：提供 `/agy-acp status|quota|reset` 命令，在 TUI 中渲染 12 格进度条与重置倒计时；每轮对话结束后后台静默刷新状态栏（如 `AGY 80%`），并在剩余额度触及 `20%` 与 `5%` 时触发分级告警。

### 2.3 `agy-sbx-kit`、`xurl` 与 `pi-multi-account`：补齐沙箱、轨迹与多账号高可用

为了支撑长周期自治任务，工具链的另外三块拼图分别解决了**运行环境隔离**、**跨工具会话读取**与**配额耗尽容灾**：

1. **[`agy-sbx-kit`](https://github.com/fdkevin0/agy-sbx-kit)（Docker Sandboxes v3 无头沙箱套件）**：
   - 容器内默认以 `agy --dangerously-skip-permissions --mode=accept-edits` 启动 YOLO 免批模式，以容器边界替代交互式弹窗。
   - **无头 OAuth 认证揭秘**：`agy` 默认尝试打开本地浏览器并监听 `localhost:36742/oauth-callback`。只需设置环境变量 `export SSH_CONNECTION=1`，`agy` 就会判定处于远端环境，自动切换为 **Copy/Paste Fallback** 模式（将宿主机浏览器重定向的 `http://localhost:36742/oauth-callback?code=...` 完整 URL 粘贴回终端即可完成认证）。
   - **个人账号 (`consumer`) vs. 企业 GCP (`gcp`) 凭证差异**：企业账号若走默认 `consumer` 路由会报 `Client is not eligible for Gemini Code Assist for individuals`。必须在 `~/.gemini/antigravity-cli/antigravity-oauth-token` 中同时写入 `"auth_method": "gcp"`、`"project_id"` 与 `"region": "global"`。
   - **最小 9 域名网络白名单**：在 `com.docker.sandbox/network-policy@1` 中仅放行 `antigravity.google`、`antigravity-unleash.goog`、自动更新 Cloud Run 域名、3 个 Google OAuth 域名与 4 个 Cloud Code / Gemini 推理 API 域名。
2. **[`xurl` (`feat/antigravity`)](https://github.com/fdkevin0/xurl/tree/feat/antigravity)（统一 `agents://` URI 会话解析与流式续写）**：
   - 支持通过 `xurl agents://antigravity/<session-id>` 直接读取本地 `brain/<id>/.system_generated/logs/transcript_full.jsonl`（若不存在则自动回退至紧凑版 `transcript.jsonl`）并渲染为结构化 Markdown。
   - 支持通过 `xurl agents://antigravity/<session-id> -d "Continue"` 调用 `agy -p --output-format stream-json --conversation <id>` 实时解析 `step_update` 流式增量并续写会话。
3. **[`pi-multi-account`](https://github.com/fdkevin0/pi-multi-account)（多账号配额感知与自动故障转移）**：
   - 自动发现并管理多个 Antigravity（`google-antigravity-account-N`）、Claude Pro/Max 与 ChatGPT/Codex 账号。
   - 针对 Antigravity 实现**模型级细粒度冷却**：当 `gemini-4-argon` 触发 429 或配额耗尽（Protobuf 省略 `remainingFraction` 代表 `0%`）时，仅冷却该模型资源而不误伤同账号下的 `gemini-3.8-flash` 或 Claude 模型，并在跨账号切换时严格保持模型品质档位（Frontier / Balanced / Fast）与推理等级（Thinking Level）。

---

## 结语：立即体验在线配置生成小工具

本文涉及的 Antigravity ACP 与沙箱开源插件安装命令及仓库入口已汇总至本站 **[`/lab/`](/lab/#paseo-agy-acp)** 页面，基于二进制逆向结论构建的两个纯前端交互式小工具已上线至 **[`/tools/antigravity/`](/tools/antigravity/)** 页面：

1. **[`.agents/agents/<name>.md` Subagent YAML 生成器](/tools/antigravity/#subagent-generator)**：涵盖 `0xbf3a5a8` 反射表的全量 19 个字段、`ModelTier` 选择、`commandExecutionPolicy` 校验、内置保留名冲突检测与预设模板一键导出。
2. **[`GEMINI.md` `/boost` (`owl` 引擎) 语义触发与工作流配置器](/tools/antigravity/#boost-generator)**：勾选即可拼装自然语言触发 `DeepCoder`/`DeepInvestigator` 的 `GEMINI.md` 规则片段、`EGM + /boost + Ponytail` 组合流规则，以及带父模型继承（`--model`）与容器无头认证（`SSH_CONNECTION=1`）的启动脚本。

欢迎前往 **[`/tools/antigravity/`](/tools/antigravity/)** 与 **[`/lab/`](/lab/#paseo-agy-acp)** 直接复制使用，或在 GitHub 上查看各项目的源码与逆向笔记！
