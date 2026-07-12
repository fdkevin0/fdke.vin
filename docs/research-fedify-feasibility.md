# Fedify 替代当前 ActivityPub 实现的复杂度与可行性分析

> 研究日期：2026-07-11 | 基于 Fedify v2.3.1 | 项目当前 commit `bc8d1d2`

---

## 一、当前状态

项目 ActivityPub 实现处于 **Phase 0（数据层完成）**，尚未进入协议层：

| 已完成 | 未开始 |
|--------|--------|
| D1 `ap_notes` 表 + CRUD 操作 | WebFinger |
| ULID 生成 + 编解码 (`ulid.ts`) | Actor JSON-LD |
| 旧 Markdown 迁移脚本 | HTTP Signatures（签名/验证） |
| ADR-0002 架构决策 | Inbox / Outbox |
| | Followers 集合 |
| | Delivery fan-out 队列 |
| | Content negotiation（HTML vs AS2） |
| | Telegram webhook 集成 |
| | 前端切换到 D1 数据源 |

**当前自定义代码量**: ~150 行（storage.ts + types.ts + runtime.ts + ulid.ts）

**预计完整自建代码量**: ~3000-5000+ 行

---

## 二、Fedify 概述

[Fedify](https://fedify.dev) 是一个 TypeScript ActivityPub 框架，MIT 协议，1k GitHub stars，309 个 releases（最新 v2.3.1，2026-06-27）。

### 核心能力

| 协议组件 | Fedify 提供 | 自建需要 |
|----------|------------|----------|
| **WebFinger** (RFC 7033) | ✅ 自动处理 | ~150 行 |
| **Actor JSON-LD** | ✅ 类型安全 Person 对象 | ~200 行 |
| **HTTP Signatures** (draft-cavage) | ✅ 自动签名+验证 | ~400 行（高风险） |
| **HTTP Message Signatures** (RFC 9421) | ✅ 同时支持 | ~300 行 |
| **Linked Data Signatures** | ✅ | ~200 行 |
| **Object Integrity Proofs** (FEP-8b32) | ✅ | ~300 行 |
| **Inbox 处理** | ✅ `.on(Follow/Create/Like/...)` | ~500 行 |
| **Outbox/Delivery** | ✅ `ctx.sendActivity()` + 队列 | ~800 行 |
| **Follower fan-out** | ✅ 自动，含 sharedInbox 优化 | ~400 行 |
| **Activity 幂等** | ✅ 内建去重（24h 缓存） | ~100 行 |
| **Content Negotiation** | ✅ 自动 (Accept header) | ~150 行 |
| **重试/退避** | ✅ 指数退避，最多 10 次 | ~200 行 |
| **NodeInfo** | ✅ | ~100 行 |

**Fedify 节省的总代码量估计**: ~3500-4000 行

---

## 三、与现有架构的兼容性

### 3.1 运行时支持

Fedify 官方支持 Cloudflare Workers，提供第一方包：

| 包 | 用途 |
|---|------|
| `@fedify/fedify` | 核心框架 |
| `@fedify/vocab` | Activity Vocabulary 类型 |
| `@fedify/cfworkers` | Workers KV Store + Queue 实现 |
| `@fedify/astro` | Astro 中间件集成 |
| `@fedify/hono` | Hono 中间件集成（备选） |

### 3.2 Cloudflare 绑定映射

项目现有的 Cloudflare 基础设施可以**直接映射**到 Fedify：

| 项目现有 | Fedify 需要 | 兼容性 |
|----------|------------|--------|
| `DATABASE` (D1) | KvStore（缓存/状态） | ✅ 需新增 KV namespace 或复用 D1 |
| `RSS_FETCH_QUEUE` (Queue) | MessageQueue（delivery） | ✅ 需新增 `ap-delivery-queue` |
| `wrangler.jsonc` | 同上 + 可能增加 KV binding | ✅ 模式一致 |
| `src/worker.ts` queue handler | `federation.processQueuedTask()` | ✅ 显式调用模式 |

### 3.3 Astro 集成路径

Fedify 提供 `@fedify/astro` 包，架构为 Astro 中间件模式：

```
Request → fedifyMiddleware() → 匹配 AP 路径?
           ├─ Yes → Fedify 处理 (WebFinger/Actor/Inbox)
           └─ No  → await next() → Astro 正常渲染
```

这与项目现有的 `src/middleware.ts` 模式高度兼容——可以在同一中间件中按路径分层：Cloudflare Access 认证先执行，然后将非 AP 请求传给 Astro，AP 请求传给 Fedify。

**关键考虑**: Fedify 的 Astro 集成需要 `@fedify/astro` 做 Vite SSR 配置（`fedifyIntegration()` 在 `astro.config.mjs`）。项目已使用 `@astrojs/cloudflare` adapter，需验证两者兼容性。

### 3.4 备选：Hono 集成路径

如果 Astro 集成遇到问题，可以通过 `@fedify/hono` 在 Worker 层面挂载 Fedify，将 Astro 作为子处理器。Hono 在 Cloudflare Workers 生态中是一等公民，且项目已在 `wrangler.jsonc` 中定义了 Worker entry point (`src/worker.ts`)。

---

## 四、具体替换分析

### 4.1 可保留的现有代码

| 代码 | 处理方式 |
|------|----------|
| `storage.ts` - `upsertNote` / `getNoteById` / `listNotes` | ✅ **完全保留** — Fedify 不管理业务数据模型 |
| `types.ts` - `Note` / `NoteSource` | ✅ **完全保留** — 应用层类型 |
| `runtime.ts` - `ApEnv` | ✅ **保留** — 环境绑定获取 |
| `ulid.ts` / `ulid.test.ts` | ✅ **完全保留** — ULID 生成逻辑 |
| `scripts/d1/activitypub.sql` | ✅ **保留** — 数据表定义 |
| `scripts/d1/seed-notes.sql` | ✅ **保留** — 迁移数据 |
| `scripts/d1/migrate-notes.mjs` | ✅ **保留** — 迁移工具 |

### 4.2 需要新增的代码

```
src/lib/ap/
  fedify.ts          # createFederation() 工厂 + builder pattern
  actor.ts           # setActorDispatcher + setKeyPairsDispatcher
  inbox.ts           # setInboxListeners (Follow, Like, Create, Announce)
  outbox.ts          # sendActivity 封装 (Create/Update/Delete Note)
  followers.ts       # setFollowersDispatcher (D1 查询)
  kv-store.ts        # (可选) D1-backed KvStore 实现，或使用 WorkersKvStore
```

### 4.3 需要修改的现有文件

| 文件 | 变更 |
|------|------|
| `wrangler.jsonc` | 新增 `ap-delivery-queue` Queue binding (+ producer/consumer) |
| `src/worker.ts` | 新增 queue consumer: `federation.processQueuedTask()` |
| `src/middleware.ts` | 集成 `fedifyMiddleware()` 或 Hono adapter |
| `astro.config.ts` | 添加 `fedifyIntegration()` |
| `package.json` | 新增 3-4 个依赖 |

### 4.4 需要删除的代码

**无需删除** — Fedify 不替代数据层，只补充协议层。项目现有的 `storage.ts` 等文件全部保留。

---

## 五、复杂度估算

### 5.1 集成工作量

| 阶段 | 内容 | 预计工时 |
|------|------|---------|
| **1. 依赖安装与配置** | 安装 `@fedify/fedify` + `@fedify/cfworkers` + `@fedify/astro`，配置 wrangler.jsonc | 2-3h |
| **2. Federation 工厂** | 创建 `createFederation()` 实例，配置 KvStore + MessageQueue + Queue | 2-3h |
| **3. Actor 分发** | `setActorDispatcher` → 返回 Person，`setKeyPairsDispatcher` → RSA keypair，WebFinger 自动生效 | 3-4h |
| **4. Inbox 监听** | `.on(Follow)` 自动 Accept，`.on(Like/Announce)` 写入交互计数，`.on(Create)` 处理回复 | 4-6h |
| **5. Outbox 发送** | `ctx.sendActivity()` 封装：Note 发布 → Create，编辑 → Update，删除 → Delete(Tombstone) | 3-4h |
| **6. Followers 集合** | D1 表 `ap_followers` + `setFollowersDispatcher` | 2-3h |
| **7. Content Negotiation** | `/notes/{id}` 路由根据 Accept header 返回 HTML 或 AS2 JSON | 2-3h |
| **8. 前端切换** | Note 页面从 content collection 切换到 D1 + SSR | 4-6h |
| **9. Telegram Webhook** | 接收 `channel_post` → 调用 `upsertNote` + `sendActivity` | 3-4h |
| **10. 测试与调试** | 与 Mastodon 等实现互操作测试 | 8-16h |

**总预计**: **33-52 小时**（含测试与调试）

### 5.2 自建同等功能的预计工时

如从零实现以上所有协议组件：**120-200 小时**（且互操作 bug 风险显著更高）

**Fedify 节省约 60-75% 的开发时间。**

---

## 六、风险与注意事项

### 6.1 技术风险

| 风险 | 严重程度 | 缓解措施 |
|------|---------|----------|
| `@fedify/astro` 与 `@astrojs/cloudflare` adapter 兼容性 | 🟡 中 | 可降级到 Hono 集成路径 |
| WorkersKvStore 需要额外 KV namespace（增加成本） | 🟢 低 | 可自行实现 D1-backed KvStore |
| Fedify API 稳定性（语义化版本） | 🟢 低 | 2.x 已稳定，309 releases |
| Bundle 大小增加 | 🟡 中 | Workers 免费套餐 1MB 限制，需确认 |
| 学习曲线 | 🟡 中 | 文档充实，但概念较多 |

### 6.2 成本影响

| 资源 | 当前 | 加 Fedify 后 | 免费套餐余量 |
|------|------|-------------|------------|
| D1 存储 | ~1MB | ~2-5MB（新增 followers/interactions 表） | 5GB ✅ |
| Queue 操作 | 2 queues | 3 queues（新增 ap-delivery-queue） | 1M/月 ✅ |
| KV 操作 | 0 | 如有 KV namespace，少量读写 | 100k/天 ✅ |
| Worker CPU | 低 | 中等（签名/验证计算） | 10ms/请求 ✅ |

项目规模（单用户 blog，少量 followers）下，**所有新增用量均在 Cloudflare 免费套餐范围内**。

### 6.3 锁定风险

Fedify 是 MIT 协议的开源项目，由 Fedify Project 维护，赞助商包括 Ghost 和 AltStore。即使项目未来停止维护，已生成的代码基于标准 ActivityPub 协议，迁移到其他实现或恢复自建是可行的（协议层是标准的）。

---

## 七、推荐方案

### 推荐：采用 Fedify ✅

**核心理由**：
1. 项目只完成了数据层（~150 行），没有任何协议层代码需要丢弃
2. Fedify 覆盖了 ADR-0002 中规划的所有协议需求（WebFinger、签名、Inbox/Outbox、Delivery）
3. 节省 60-75% 开发时间，避免 HTTP Signatures 等安全敏感代码的手写风险
4. 与现有 D1/Queue/Astro 架构完全兼容
5. 成本保持在 Cloudflare 免费套餐内

### 建议实施路径

```
Phase 1 (当前): D1 存储 + ULID + 迁移 ✅ 已完成
Phase 2: Fedify 集成 — Actor + WebFinger (只读身份)     ← 下一步
Phase 3: Fedify Outbox — Create/Update/Delete 发送
Phase 4: Fedify Inbox — Follow/Like/Announce 接收
Phase 5: Telegram Webhook + 前端切换
```

### 不建议立即采用的场景

只有在以下情况下才应继续自建：
- 需要对 ActivityPub 协议的**每一个细节**进行完全控制
- 项目有意作为学习 ActivityPub 的练手项目
- Workers bundle 大小限制经过评估确实无法容纳 Fedify

---

## 八、参考链接

- Fedify 官网: https://fedify.dev
- GitHub: https://github.com/fedify-dev/fedify
- 教程 (Basics): https://fedify.dev/tutorial/basics
- Actor 手册: https://fedify.dev/manual/actor
- Inbox 手册: https://fedify.dev/manual/inbox
- Sending Activities: https://fedify.dev/manual/send
- Message Queue: https://fedify.dev/manual/mq
- CF Workers 集成: https://github.com/fedify-dev/fedify/tree/main/packages/cfworkers
- Hono 集成: https://github.com/fedify-dev/fedify/tree/main/packages/hono
- Astro 集成: https://github.com/fedify-dev/fedify/tree/main/packages/astro
