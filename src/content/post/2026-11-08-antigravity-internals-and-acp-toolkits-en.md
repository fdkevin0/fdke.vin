---
title: "Inside Google Antigravity: owl Engine & ACP Toolkits"
description: "Binary reverse-engineering of Google Antigravity CLI (agy v1.5.1/v1.5.3) — uncovering the /boost (owl) 3-tier adversarial pipeline, 19 Subagent YAML fields, and open-source ACP toolkits."
publishDate: 2026-11-08T16:00:00+08:00
updatedDate: "2026-11-08T16:00:00+08:00"
lang: "en"
draft: false
tags: ["antigravity", "agents", "reverse-engineering", "acp", "ai"]
---

This post has two parts. Part 1 reverse-engineers the Antigravity CLI (`agy`) binary: the `owl` 3-tier adversarial pipeline behind `/boost`, and the 19 fields a Subagent accepts. Part 2 covers the open-source tools I built on top of ACP. If you only want the tools, open the [interactive configurator](/tools/antigravity/) or the plugin list in [Lab](/lab/#paseo-agy-acp).

---

## Introduction: Why reverse-engineer agy

Google Antigravity CLI (`agy`) is Google DeepMind's native terminal and multi-agent runtime for agentic coding. Unlike thin API wrappers, `agy` ships a single compiled Go binary containing native subagent spawning primitives (`invoke_subagent` / `define_subagent`), a multimodal tool stack, a 3-tier adversarial coding and root-cause analysis engine codenamed **`owl`** (exposed via `/boost`), and a native **ACP (Agent Client Protocol)** server (`agy acp`).

In heavy day-to-day engineering, however, three friction points quickly emerge:

1. **Opaque Internals & Documentation Drift**: Is `/boost` just a `SKILL.md` file? Why does asking the model in natural language to _"use boost to debug this"_ fail to trigger the pipeline? Do the _"Phase 1 workspace pre-inspection"_ and _"ephemeral isolated worktrees"_ described in the official docs actually exist in the binary? And what is the complete set of YAML fields supported by `.agents/agents/<name>.md`?
2. **Cross-Client Orchestration Gaps**: When orchestrating tasks from [Paseo](https://paseo.sh) (across desktop, web, CLI, and mobile) or [Pi Coding Agent](https://pi.dev), we needed native ACP bridges capable of reusing Antigravity's flagship models (`gemini-4-argon-high`, `claude-opus-5-5-high`, `gpt-oss-120b-medium`), tool approvals, slash commands, and quota telemetry.
3. **Headless Sandboxes, Transcripts & Quota Walls**: Running `agy` inside an isolated Docker container or remote SSH session breaks the default `localhost:36742` OAuth listener; reading local `brain/<id>/` JSONL trajectories lacked a unified URI tool; and single-account 5-hour or weekly quota walls can halt long autonomous runs.

To solve all three, I performed static binary analysis on `agy` (v1.5.1 / v1.5.3 `linux/amd64` PIE ELF) and built an open-source suite of plugins and tools (open-source repositories indexed on **[`/lab/`](/lab/#paseo-agy-acp)** and interactive browser generators on **[`/tools/antigravity/`](/tools/antigravity/)**):

| Question                             | Answer                                                                                                  | Link                                                             |
| :----------------------------------- | :------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------- |
| Is `/boost` a `SKILL.md`?            | No. It is a system slash command compiled into the binary, driving the 3-tier `owl` pipeline.           | [§1.1](#11-boost-is-not-a-skillmd-the-13-system-slash-commands)  |
| Can `/boost` run without typing `/`? | Yes. `DeepCoder` and `DeepInvestigator` are already allowed subagents; one `GEMINI.md` rule unlocks it. | [Configurator](/tools/antigravity/#boost-generator)              |
| What can a Subagent configure?       | 19 YAML fields. `model` takes four tiers, but `inherit` passes through any concrete parent model.       | [Generator](/tools/antigravity/#subagent-generator)              |
| `paseo-agy-acp`                      | Antigravity ACP provider for Paseo with session resume, tool approvals, and quota tracking.             | [GitHub](https://github.com/fdkevin0/paseo-agy-acp)              |
| `pi-agy-acp`                         | Antigravity extension for Pi Coding Agent with streaming reasoning, image input, and quota bars.        | [GitHub](https://github.com/fdkevin0/pi-agy-acp)                 |
| `agy-sbx-kit`                        | Runs `agy` headless in Docker Sandboxes, keeps tokens on the host, and allows only 9 egress domains.    | [GitHub](https://github.com/fdkevin0/agy-sbx-kit)                |
| `xurl`                               | Reads local session transcripts as Markdown via `agents://antigravity/<id>` and can continue them.      | [GitHub](https://github.com/fdkevin0/xurl/tree/feat/antigravity) |
| `pi-multi-account`                   | Quota-aware multi-account rotation and automatic failover.                                              | [GitHub](https://github.com/fdkevin0/pi-multi-account)           |

### The 4-layer extension architecture and toolkits

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

## Part 1: Reverse-engineering /boost and Subagents

> **Target Binary Baselines**
>
> - `agy` v1.5.1 (SHA-256: `72738cf0445918483956a5f0da33abdfcfb21a12dd9a421fd57d063782826669`)
> - `agy` v1.5.3 (`linux/amd64` PIE ELF, `.text` base `0x6d15000`, `pcHeader.textStart` `0x6d15080`, `.gopclntab` offset `0x1714500`)

### 1.1 /boost is not a SKILL.md: the 13 system slash commands

Inside `google3/third_party/jetski/cortex/slashcommands` and `cli/slashcmd`, all slash commands are aggregated by `cli/slashcmd.AdvertisedResolvers` (`0x9dc5ba0`) into three distinct categories:

1. **System Slash Commands (`GetSystemSlashCommandsDefinitions` @ `0x90f8fc0`)**: Compiled directly into a `.data` global struct array at `0xcbad108` (13 entries, each `0x80` = 128 bytes wide).
2. **Skill Slash Commands (`GetSkillSlashCommands` @ `0x90f9460`)**: Backed by `SKILL.md` files on disk, wrapping the prompt in `<SKILL>The user requested you read and use the %q skill...</SKILL>` (`.rodata` `0x6219799`).
3. **Workflow Slash Commands (`GetWorkflowSlashCommands` @ `0x90f9a00`)**: Backed by `.agents/workflows/*.md` scripts, wrapping the prompt in `<WORKFLOW>` (`.rodata` `0x6212491`).

After `slashcommands.init` (`0x90f89a0 .. 0x90f8dc0`) finishes relocation, global slice `0xcb5e5e0` (`len=13, cap=13`) points to `0xcbad108`. Entry **`[9]` at `0xcbad588` is `boost`**:

|   Index   | Struct VMA      | Name (`+0x00`)   | Expansion (`+0x10` / `+0x40`)                           | Icon (`+0x28`) | Availability Hook (`+0x60`)        |
| :-------: | :-------------- | :--------------- | :------------------------------------------------------ | :------------- | :--------------------------------- |
|   `[0]`   | `0xcbad108`     | `goal`           | Interactive Goal wrapper (`0x90fa060`)                  | `timer`        | `0x90fa380` (checks `"goal_stop"`) |
|   `[1]`   | `0xcbad188`     | `compact`        | Built-in context compaction handler                     | `collapse_all` | `0x90fa400`                        |
|   `[2]`   | `0xcbad208`     | `schedule`       | Dynamic `<SCHEDULE>`                                    | `schedule`     | `0x90fa460`                        |
|   `[3]`   | `0xcbad288`     | `browser`        | Dynamic `<BROWSER>`                                     | `language`     | `0x90fa500`                        |
|   `[4]`   | `0xcbad308`     | `browser-vision` | Dynamic `<BROWSER_VISION>`                              | `visibility`   | `0x90fa640`                        |
|   `[5]`   | `0xcbad388`     | `plan`           | Static `<PLAN>` (`0x635a57a`, 3735 B)                   | `ballot`       | `0x90fa780`                        |
|   `[6]`   | `0xcbad408`     | `grill-me`       | Static `<GRILL_ME>` (`0x6264f1d`, 491 B)                | `forum`        | `0x90fa7c0`                        |
|   `[7]`   | `0xcbad488`     | `teamwork`       | Dynamic `<TEAMWORK>` (`native_swarm`)                   | `graph_2`      | `0x90fa7e0` (checks `"teamwork"`)  |
|   `[8]`   | `0xcbad508`     | `learn`          | Dynamic `<LEARN>` (`0x90f8dc0`)                         | `lightbulb_2`  | `0x90fa840`                        |
| **`[9]`** | **`0xcbad588`** | **`boost`**      | **Dynamic `<ORCHESTRATOR>` (`owl.OrchestratorPrompt`)** | **`bolt`**     | **`0x90fa860` (`init.func10`)**    |
|  `[10]`   | `0xcbad608`     | `deepagent`      | Static `<SUBAGENT>...deepagent`                         | `science`      | `0x90fa8c0`                        |
|  `[11]`   | `0xcbad688`     | `review-agent`   | Static `<SUBAGENT>...review-agent`                      | `find_in_page` | `0x90fa9a0`                        |
|  `[12]`   | `0xcbad708`     | `help`           | Built-in CLI help handler                               | `help`         | `0x90faa80`                        |

At instruction block `0x90f8c55 .. 0x90f8cc1`, `slashcommands.init` wires up `/boost` as follows:

```go
// google3/third_party/jetski/cortex/slashcommands/slashcommands.go
// Disassembly range: 0x90f8c55 .. 0x90f8cc1
func init() {
    // reuseSubagent = true (AL=1): follow-ups reuse the same Coordinator via send_message
    // runReadabilityAndLint = false (BL=0)
    orchestratorBody := owl.OrchestratorPrompt(true, false) // call 0x86a9a00

    // Format string at .rodata 0x613a7ea: "<ORCHESTRATOR>\n%s\n</ORCHESTRATOR>"
    systemSlashCommands[9].Prompt = fmt.Sprintf("<ORCHESTRATOR>\n%s\n</ORCHESTRATOR>", orchestratorBody)
}
```

### 1.2 Inside the owl engine: a 3-tier adversarial pipeline

The `/boost` runtime lives in `google3/third_party/jetski/cortex/customizations/builtin/owl` and its four subpackages (`owl/common`, `owl/deepcoder`, `owl/deepinvestigator`, `owl/hooks`). It cannot be expressed as a mere `SKILL.md` because the Go runtime enforces **tool stripping, prompt-section whitelisting, and pre-invocation hooks** across three tiers:

```text
[User Input: /boost <task>]
       |
       v  cli/slashcmd.Expand (0x9dc60a0) -> <ORCHESTRATOR>
+------------------------------------------------------------+
| Tier 1: Main Agent / Orchestrator                          |
| - Route: Solo Routine vs. Delegation Routine               |
| - Rule 1 (No Pre-work @ 0x627fa12): First tool call MUST   |
|   be invoke_subagent; pre-reading files is banned          |
| - Rule 2 (Spot-Check @ 0x623f1f8): Verify returned claims  |
+--------------|-----------------------------|---------------+
               | Coding / Refactor / Test    | Root-Cause / RE
               | Workspace="inherit"         | Workspace="inherit"
               v                             v
+-----------------------------+ +----------------------------+
| Tier 2: DeepCoder           | | Tier 2: DeepInvestigator   |
| (0x86a7cc0, Hidden: true)   | | (0x86a8c20, Hidden: true)  |
| - Banned from coding        | | - Read-only coordinator    |
+--------------|--------------+ +------------|---------------+
               | Step 1: Spawn WorkerL0      | Step 1: Spawn WorkerL0
               v                             v
+-----------------------------+ +----------------------------+
| Tier 3: DeepCoderWorkerL0   | | Tier 3: DeepInvWorkerL0    |
| (0x86a7ac0, 10-tool slice)  | | (0x86a89e0, read-only)     |
| - Build from scratch + test | | - Trace end-to-end calls   |
| - Skepticism Disclaimer     | | - List Remaining Gaps      |
+--------------|--------------+ +------------|---------------+
               | send_message (once)         | send_message (once)
               v                             v
+-----------------------------+ +----------------------------+
| Step 2: Pass <prior_attempt>| | Step 2: <prior_attempt>    |
| DeepCoderImprovementWorker  | | DeepInvestigatorImpWorker  |
| (0x86a7bc0, Anti-Rubber-St) | | (0x86a8b00)                |
| 1. Read <original_task> 1st | | 1. Form own view first     |
| 2. Break it with edge cases | | 2. Challenge prior claims  |
| 3. Fix defects in-place     | | 3. Resolve Remaining Gaps  |
+-----------------------------+ +----------------------------+
```

Key mechanisms recovered from the binary:

1. **Tier 1 "No Pre-work" & Same-Instance Follow-up Reuse**:
   - `owl.OrchestratorPrompt` (`.rodata` `0x627fa12` & `0x6239bdf`) forbids the main agent from reading files, searching the codebase, or designing file structures before calling `invoke_subagent`. This prevents the orchestrator's premature assumptions from anchoring downstream workers.
   - When the coordinator returns, the main agent must independently spot-check modified files and run tests. If issues remain, `reuseSubagent=true` (`0x623f1f8`) mandates sending follow-ups via `send_message` to the **same** `DeepCoder`/`DeepInvestigator` `conversationId`.
2. **Tier 2 Pre-Invocation Role Hook & Follow-up Resets**:
   - Both coordinators attach `NewRemindPipelineCoordinatorRoleHook` (`0x8ffb940`, body builder `CoordinatorReminderBody` @ `0x8ffb5c0`), which injects 4 periodic rules on tool calls: (1) never edit files yourself; (2) stop immediately after spawning a worker—do not poll; (3) retry failed workers with the same prompt **up to 4 times** (`0x623a1ba`); (4) never confuse the parent ID with worker IDs.
   - On follow-up rounds (`## Follow-up Rounds` @ `0x625ea73`), coordinators are forbidden from reusing old workers and must restart from **Step 1** with fresh worker instances.
3. **Tier 3 Skepticism Disclaimers, "Break it" Reviews & Prompt Decoys**:
   - Workers are restricted to a 10-tool slice (`0xcb844d0`, removing `invoke_subagent` and `manage_subagents`) and guarded by 4 pre-tool hooks (`0xcb84490`, including `NewTimeoutLongRunningSearchCommandHook` @ `0x8ffb280` to block `tail -f` hangs).
   - `DeepCoderWorkerL0` must begin its report with `> [!WARNING] **Skepticism Disclaimer**` (`0x62a8844`), explicitly separating **Deep Verification** (actual test execution), **Shallow Verification** (code reading only), and **Unverified aspects**.
   - `DeepCoderImprovementWorker` (`0x63073f9`) opens with: _"You are not a rubber stamp. A review that finds nothing and changes nothing is almost always a failed review."_ It requires the worker to write down its independent understanding of `<original_task>` **before** looking at `<prior_attempt>`, then actively try to **Break it** with boundary inputs and fix any discovered bugs in-place.
   - Every tier ends with a prompt-protection block (`0x6288107` / `0x62884bf`) that forces the model to reply with the exact decoy phrase `"What task can I help you with?"` if probed for its system instructions.

### 1.3 The docs vs. the binary: 4 discrepancies

Comparing the public documentation at `antigravity.google/docs/boost/` against the `owl` disassembly in `agy` v1.5.3 reveals four notable contradictions:

| Dimension                           | Official `/docs/boost/` Claim                                                                        | Binary Kernel (`owl` Package) Reality                                                                                                                                          |
| :---------------------------------- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Phase 1 Workspace Inspection** | Claims the primary orchestrator _“inspects workspace context, and formulates an execution strategy”_ | **Strictly prohibited (`> No Pre-work` @ `0x627fa12`)**: The orchestrator's very first tool call in Delegation Routine must be `invoke_subagent`.                              |
| **2. Subagent Workspace Isolation** | Claims `/boost` uses _“Ephemeral isolated worktrees”_                                                | **Hardcoded to `Workspace="inherit"` (shared working tree)**: `ImprovementWorker` compiles, breaks, and patches `WorkerL0`'s uncommitted edits directly in the same workspace. |
| **3. Execution Topology**           | Claims _“Phase 2: Parallel execution and verification”_                                              | **Strict sequential relay inside each coordinator**: `WorkerL0` must finish first so its report can be wrapped into `<prior_attempt>` for `ImprovementWorker`.                 |
| **4. Undocumented Mechanisms**      | Mentions only the 3-tier names                                                                       | Omits the `owl` codename, mandatory `Skepticism Disclaimer`, anti-rubber-stamp blind review, 4x retry cap, single `send_message` silence rule, and prompt-leak decoy.          |

### 1.4 Triggering /boost with natural language

Out of the box, saying _"use boost to fix this race condition"_ without a leading or trailing `/boost` will **not** trigger the `owl` pipeline due to three guards:

1. `cli/slashcmd.Expand` (`0x9dc60a0`) only matches leading (`ParseLeading` @ `0x9dc50a0`) or trailing (`ParseSuffix` @ `0x9dc53c0`) slash tokens;
2. The default `<slash_commands>` prompt tells the main agent _“You cannot execute these commands yourself”_;
3. `DeepCoder` and `DeepInvestigator` have `Hidden: true` (`+0x40 = 1`), so `SubagentsSection.Content` (`0x9101ff0`) omits them from the `<subagents>` prompt listing.

**However, disassembling `google3/third_party/jetski/cortex/customizations/builtin/agents` (`0x86ac720 .. 0x86b3e00`) uncovers a clean bypass:**

During `agents.init` (`0x86ac720`), the runtime initializes the global built-in subagent admission table at `0xcc49000` (`research`, `research-google`, `jetski-guide`, `browser`, `browser-vision`, `self`, `teamwork`, **`DeepCoder`**, **`DeepInvestigator`**). Whenever the `"enable-owl-slash-command"` flag (`0x60d47ef`) is active, `CalculateAllowedSubagents` (`0x86aca60`) adds both `"DeepCoder"` and `"DeepInvestigator"` to the main agent's runtime `AllowedSubagents` whitelist. When `InvokeSubagentTool.buildSpec` (`0x91da2a0`) executes, it checks only `AllowedSubagents`—it **never** checks whether `/boost` was typed on that turn, nor does it block `Hidden: true` subagents!

Adding the following rule to `~/.gemini/GEMINI.md` (customizable via **[`/tools/antigravity/#boost-generator`](/tools/antigravity/#boost-generator)**) enables 100% natural-language semantic triggering of the `owl` pipeline:

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

### 1.5 EGM and /boost: complementary workflows

While both `EGM` (`elephant-goldfish-model`) and `/boost` (`owl`) are designed to defeat single-agent **Confirmation Bias**, they operate at opposite halves of the software engineering lifecycle:

| Dimension                              | `EGM` (`elephant-goldfish-model` Plugin)                                                                                                                                                                                | `/boost` (Built-in `owl` Engine)                                                                                                                                                  |
| :------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Target Lifecycle & Deliverable**  | **Upstream: Architecture Design, Plans & Contracts**<br>Enforces `Artifact-First` and `No Code Generation` to produce specs, Implementation Plans, and `DRIFT_REPORT.md`.                                               | **Downstream: Complex Coding & Root-Cause Debugging**<br>Produces compiled, test-verified code changes or code-level root-cause reports.                                          |
| **2. Main Agent Role**                 | **Primary Author (Elephant) + Sole Editor**<br>Researches the codebase, drafts the document, and applies revisions after review.                                                                                        | **Hands-Off Dispatcher + Final Spot-Checker**<br>Banned from pre-reading code (`No Pre-work`); runs independent tests after the pipeline completes.                               |
| **3. Reviewer Permissions & Topology** | **7 Read-Only Orthogonal Goldfish (Parallel Fan-out / Fan-in)**<br>`zoom-out`, `design`, `comprehension`, `codebase-details`, `implementation-readiness`, `structural`, `style` all run with `EnableWriteTools: false`. | **Read-Write Monolithic Challenger (Sequential Relay)**<br>`ImprovementWorker` has full write/command access (`Workspace="inherit"`) to break and fix `WorkerL0`'s code in-place. |
| **4. Anti-Anchoring Mechanism**        | **Physical Context Amnesia**<br>Each Goldfish spawns in a clean session with zero access to the Elephant's drafting history.                                                                                            | **Prompt Reading-Order Constraint + No Pre-work**<br>Instructs `ImprovementWorker` to read `<original_task>` before `<prior_attempt>`.                                            |
| **5. Human-in-the-Loop Gating**        | **Auto-fixes objective errors; escalates architectural trade-offs via `ask_question`**.                                                                                                                                 | **Autonomous black-box loop** converging on `Deep Verification` (passing tests).                                                                                                  |

Combining `EGM`, `/boost`, and `Ponytail` yields a clean 3-stage workflow:

1. **Stage 1 (EGM Design & Blind Review)**: `egm-brainstorm` $\rightarrow$ `egm-draft` $\rightarrow$ `egm-review-loop` (7 read-only Goldfish reviewers audit the plan before any code is written).
2. **Stage 2 (`/boost` Adversarial Implementation)**: Delegate the locked plan to `DeepCoder` (`WorkerL0` initial build $\rightarrow$ `ImprovementWorker` adversarial break & fix).
3. **Stage 3 (`Ponytail` + `EGM` Final Audit)**: Run `/ponytail-review` to strip unnecessary abstraction layers and `egm-drift-report` to verify contract compliance.

### 1.6 The 19 Subagent fields and model inheritance

Persistent custom subagents live in `.agents/agents/<name>.md` (or `~/.gemini/config/agents/<name>.md`). Extracting the `customizations.AgentFrontmatter` reflection descriptor from `.data.rel.ro` at `0xbf3a5a8` (field array `0xbf3a608 .. 0xbf3a7c0`) reveals all **19 valid YAML fields**:

| Category                     | YAML Field Names                                                                        | Type & Binary Validation Logic                                                                                                                                                                                                                                                                                                                                         |
| :--------------------------- | :-------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity**                 | `name`, `description`                                                                   | `string` (Required; cannot collide with built-in agent names; parsed by `ParseAgentScriptItemFromMarkdown` @ `0x8328290`)                                                                                                                                                                                                                                              |
| **Role & Visibility**        | `mainAgent`, `subagent`, `hidden`, `disabled`                                           | `*bool` (`subagent: false` prevents invocation via `invoke_subagent`)                                                                                                                                                                                                                                                                                                  |
| **Model & Execution Policy** | `model`, `commandExecutionPolicy`                                                       | • `model` (validated @ `0x830a640`): Accepts only `inherit` (`1`), `flash_lite` (`2` $\rightarrow$ `gemini-3.1-flash-lite-preview`), `flash` (`3` $\rightarrow$ `gemini-3.8-flash-medium`), `pro` (`4` $\rightarrow$ `gemini-4-argon-high`)<br>• `commandExecutionPolicy` (validated @ `0x7fb2760`): Accepts `off` (`1`), `auto` (`2`), `eager` (`3`), `sandbox` (`4`) |
| **Inheritance & Isolation**  | `excludeDefaultComponents`, `inheritCustomizations`, `inheritMcp`                       | `*bool` (`excludeDefaultComponents`, added in v1.2.1, strips default system prompt sections and built-in tools)                                                                                                                                                                                                                                                        |
| **Capabilities & Hooks**     | `tools`, `mcpServers`, `skills`, `preloadSkills`, `plugins`, `rules`, `agents`, `hooks` | Configures tool whitelists (`[]string`), agent-scoped MCP servers, progressive or preloaded skills, allowed child subagents (`agents`), and lifecycle hooks                                                                                                                                                                                                            |

> **Tip: Running Subagents (and `/boost` Workers) on Claude Opus 5.5 or Any Specific Model**
> Putting `model: claude-opus-5-5-high` directly in YAML fails with `Invalid model tier` (`.rodata` `0x5e0f52d`). However, because `model: inherit` (and `MODEL_UNSPECIFIED = 0` on all `owl` subagents) inherits the parent session's active model, launching the parent with:
>
> ```bash
> agy --model claude-opus-5-5-high
> ```
>
> automatically runs every `inherit` subagent and `/boost` worker on `claude-opus-5-5-high`.

---

## Part 2: Open-source tools built on ACP

With `agy`'s internal mechanics mapped out, the second half of this effort focused on connecting `agy acp` to external agent hosts, headless containers, and multi-account routers.

### 2.1 paseo-agy-acp: Antigravity for Paseo

[**`paseo-agy-acp`**](https://github.com/fdkevin0/paseo-agy-acp) (plugin ID `agy-acp`, provider `agy`) integrates Antigravity into Paseo across desktop, web, CLI, and mobile clients:

```bash
paseo plugin install npm:@fdkevin0/paseo-agy-acp
paseo run --provider agy "Explain this repository"
```

Key engineering highlights:

1. **Warm ACP Process Pooling & Symlink-Safe Temporary Cleanup**:
   Catalog discovery opens an unprompted native ACP session to read `configOptions` and immediately calls `session/close`. When `session/close` succeeds on a healthy runtime, the plugin deletes only that validated UUID's temporary `conversations/<id>.db` (plus `-wal`/`-shm`) and `brain/<id>/` directory (refusing symlinks) while keeping the initialized ACP process warm for the next real conversation.
2. **1-Second `available_commands_update` Window & Per-`(cwd, env)` Caching**:
   Waits up to 1 second before emitting `session.ready` so native slash commands (`/boost`, `/teamwork`, etc.) are immediately available in the Paseo Composer, caching the command list per `(cwd, env)` for subsequent sessions.
3. **Multi-Step Context Window Occupancy Estimation**:
   Because `agy` sums `inputTokens`, `cachedReadTokens`, and `cachedWriteTokens` across internal tool steps within a turn, `paseo-agy-acp` tracks completed tool boundaries (`steps`) and estimates active context window occupancy (against 256,000 max tokens, or 131,072 for `gpt-oss` models) when native `usage_update` notifications are absent:
   $$\text{singleStepInput} = \text{round}\left(\frac{\text{inputTokens} + \text{cachedReadTokens} + \text{cachedWriteTokens}}{\text{steps}}\right)$$
   $$\text{usedTokens} = \text{singleStepInput} + \text{outputTokens}$$
4. **Read-Only Brain Subagent Transcript Projection**:
   Validates child `conversationId` values from `invoke_subagent` and tails `brain/<id>/.system_generated/logs/transcript.jsonl` with `realpath` containment, projecting subagent thoughts, messages, and FIFO-matched tool completions into Paseo's timeline.
5. **5-Hour & Weekly Subscription Quota Tracking**:
   Executes `agy -p /usage --output-format json` to surface `5h` and `weekly` quota buckets for `gemini_models` and `claude_and_gpt_models` in both the Composer popover and `paseo usage ls --json`.

### 2.2 pi-agy-acp: Antigravity for Pi Coding Agent

[**`pi-agy-acp`**](https://github.com/fdkevin0/pi-agy-acp) registers the `antigravity-acp` provider in Pi Coding Agent (`1.5.x`), allowing models hosted on Google Antigravity to execute Pi's local tools with streaming text, reasoning levels, image inputs, and parallel tool calls:

```bash
pi install npm:pi-agy-acp
```

- **Isolated State Directory (`PI_AGY_HOME`)**: Defaults to `~/.pi/agent/cache/antigravity-acp`, syncing the OAuth token with `0600` permissions while keeping bridge sessions isolated from your primary `~/.gemini/antigravity-cli` state.
- **Automatic Prompt-Cache Warming Veto**: Vetoes Pi's idle background prompt-cache warming so background heartbeats never drain your 5-hour Antigravity quota.
- **12-Cell TUI Quota Bars & Low-Quota Alerts**: Provides `/agy-acp status|quota|reset` with 12-cell visual bars and reset countdowns, updates the status bar (`AGY 80%`) after each turn settles, and warns at `20%` and `5%` remaining quota.

### 2.3 agy-sbx-kit, xurl and pi-multi-account

To complete the autonomous workflow toolchain:

1. **[`agy-sbx-kit`](https://github.com/fdkevin0/agy-sbx-kit) (Docker Sandboxes v3 Workload & Mixin)**:
   - Runs `agy --dangerously-skip-permissions --mode=accept-edits` inside an isolated sandbox where the VM/container is the security boundary.
   - **Headless OAuth (`SSH_CONNECTION=1`)**: Sets `SSH_CONNECTION` so `agy` switches from its local `localhost:36742` browser listener to its copy/paste callback URL flow, while Docker Sandboxes' host credential proxy holds the real OAuth tokens outside the VM.
   - **Consumer vs. GCP Enterprise Auth**: Supports both personal (`auth_method=consumer`) and Google Cloud Enterprise (`auth_method=gcp` + `project_id` + `region=global`) sessions under a strict **9-domain network allowlist**.
2. **[`xurl` (`feat/antigravity`)](https://github.com/fdkevin0/xurl/tree/feat/antigravity) (Unified `agents://` URI Resolver)**:
   - Reads `~/.gemini/antigravity-cli/brain/<session-id>/.system_generated/logs/transcript_full.jsonl` (falling back to `transcript.jsonl`) directly into Markdown via `xurl agents://antigravity/<session-id>`, and supports headless streaming writes/continuations via `agy -p <prompt> --output-format stream-json --conversation <id>`.
3. **[`pi-multi-account`](https://github.com/fdkevin0/pi-multi-account) (Quota-Aware Multi-Account Failover)**:
   - Rotates across multiple authenticated Antigravity (`google-antigravity-account-N`), Claude, and ChatGPT/Codex accounts.
   - Tracks **per-model Antigravity quotas** (`/antigravity [refresh]`): a 429 on `gemini-4-argon` cools only that model resource without benching `gemini-3.8-flash` or Claude on the same account, while preserving model quality bands and thinking levels across failovers.

---

## Conclusion

The Antigravity ACP and sandbox toolkits are indexed on **[`/lab/`](/lab/#paseo-agy-acp)**, and two zero-dependency browser generators built directly from the binary reverse-engineering findings above are live on **[`/tools/antigravity/`](/tools/antigravity/)**:

1. **[`.agents/agents/<name>.md` Subagent YAML Generator](/tools/antigravity/#subagent-generator)**: Configure all 19 `AgentFrontmatter` (`0xbf3a5a8`) fields, `ModelTier` enums, `commandExecutionPolicy` modes, and tool whitelists with live preview and one-click `.md` download.
2. **[`GEMINI.md` `/boost` (`owl` Engine) & Workflow Configurator](/tools/antigravity/#boost-generator)**: Generate natural-language `/boost` trigger rules (`AllowedSubagents` @ `0xcc49000`), `EGM + /boost + Ponytail` workflow rules, and parent-model inheritance (`--model`) / headless container (`SSH_CONNECTION=1`) launch scripts.

Head over to **[`/tools/antigravity/`](/tools/antigravity/)** and **[`/lab/`](/lab/#paseo-agy-acp)** to try them out!
