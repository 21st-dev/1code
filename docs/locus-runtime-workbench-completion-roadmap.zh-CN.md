# Locus runtime workbench 完成路线图和任务表

审查日期：2026-06-06

审查口径：只基于当前仓库文件、当前 OpenSpec、当前代码搜索和当前校验命令；未使用记忆或历史总结。本文只服务一个目标：把 Locus runtime workbench 完成到一个诚实、可验证的本地 runtime 控制层，而不是扩大产品范围。

## 0. 一句话结论

当前不是“已经完成 app-server-first runtime workbench”。真实状态是：

- Claude desktop/chat 已走 `@anthropic-ai/claude-agent-sdk`，但大量 provider、MCP、permission、stream、job 完成逻辑仍在 `src/main/lib/trpc/routers/claude.ts`。
- Codex desktop/chat 仍走 ACP：`@mcpc-tech/acp-ai-provider` + bundled `@zed-industries/codex-acp` + `streamText`。当前仓库没有 `@openai/codex-sdk` 或 `codex app-server` product path。
- Headless/job path 已有薄 runtime adapter contract，但只覆盖 `jobId/runtime/cwd/mode/prompt/signal`，不能当 desktop RunRequest。
- Capability manifest、provider profile/gateway、guard decision、desktop job shell、Local Job API、renderer AskUserQuestion/guard state 都是真基础。
- 缺口集中在：desktop RunRequest、Preflight、PermissionPolicy、Codex app-server adapter、adapter-source capability truth、持久化 trace、Workbench semantic timeline。

工程估算仍按三层看：

| 目标 | 含义 | 估算 |
|---|---|---:|
| 迁移准备 | 规格锁定、preflight/policy、desktop RunRequest、ACP quarantine、trace contract | 18-28 工程人日 |
| app-server-first MVP | Codex desktop/chat app-server adapter + unified diagnostics/trace + capability truth | 40-60 工程人日 |
| 成熟发布 | ACP 默认禁用或移除、跨平台 smoke、secret/MCP/security acceptance 全部补齐 | 60-85 工程人日 |

## 1. 真实代码证据

| 领域 | 当前事实 | 证据 | 缺口 |
|---|---|---|---|
| OpenSpec 状态 | `refactor-codex-official-runtime-adapter` 仍是 proposal/tasks，不是产品实现 | `openspec list` 显示 `9/43 tasks`；`openspec/changes/refactor-codex-official-runtime-adapter/tasks.md` 仍有 product implementation pending | 需要 approval 后才做产品代码 |
| Codex desktop runtime | 当前是 ACP，不是 app-server | `src/main/lib/trpc/routers/codex.ts` import `@mcpc-tech/acp-ai-provider`、`streamText`，并解析 `@zed-industries/codex-acp` binary | app-server schema/client/adapter 均未实现 |
| Codex dependency | 当前没有 official SDK/app-server dependency | `package.json` 有 `@mcpc-tech/acp-ai-provider`、`@zed-industries/codex-acp`、`ai`，没有 `@openai/codex-sdk` | 不可声称 official Codex adapter 已落地 |
| Claude desktop runtime | 已用 Claude Agent SDK，但 route 仍承担太多业务逻辑 | `src/main/lib/trpc/routers/claude.ts` 动态构建 env/MCP/provider/permission/stream/job completion | 需要 adapter/service extraction |
| Headless runtime | 有 shared runner，但 contract 太薄 | `src/main/lib/headless/agent-runtime-contract.ts` 只有 `jobId/runtime/cwd/mode/prompt/signal` | 不足以承载 desktop chat |
| Desktop job shell | 已校验 chat/subChat/project/cwd 并创建 running job | `src/main/lib/desktop-agent-jobs.ts` 的 `getChatJobContext` 和 `createAndStartDesktopAgentJob` | 需要提取为 reusable Preflight，后续 runtime setup 使用 verified context |
| Permission/guard | guard decision owner 存在，Codex ACP 也复用它 | `src/main/lib/agent-guard/decision.ts`；`src/main/lib/codex/acp-permission.ts` | PermissionPolicy 仍不是统一 owner；Claude plan 有 route-local `.md` 写例外 |
| Claude native control | Agent mode 当前使用 bypass permissions | `src/main/lib/trpc/routers/claude.ts` 设置 `permissionMode: "bypassPermissions"` 和 `allowDangerouslySkipPermissions` | 需要明确 policy，不应默默替代 native controls |
| Provider binding | main-process provider profile storage/gateway 和 Codex env allowlist 已存在 | `src/main/lib/provider-profiles/storage.ts`、`gateway.ts`、`src/main/lib/codex/provider-runtime-binding.ts` | 目前 binding 形状是 ACP args/env，需要 app-server mapping |
| Capability truth | shared manifest 和 tRPC router 已存在 | `src/shared/agent-runtime-capabilities.ts`；`src/main/lib/trpc/routers/agent-runtime.ts` | renderer 主要直接 import shared helper，未广泛消费 `trpc.agentRuntime.listManifests` |
| Trace/event schema | job event type 很丰富 | `src/shared/agent-jobs.ts` 包含 tool/guard/question/MCP/usage event types | desktop stream 目前只写 lifecycle/status，不写完整 semantic trace |
| Workbench logs | Workbench 可看 job 和 raw event payload | `src/renderer/features/agents/workbench/agent-workbench.tsx` 的 `HeadlessJobLogsDialog` | 还不是 structured timeline/diagnostics |
| Scope expansion | UI state 共享，但 response route 偏 Claude | renderer 调 `trpc.claude.respondScopeExpansion`；Codex route 无对应 neutral response path | Codex 需要 response path 或降级为 retry-only |
| Local Job API | v1 是好基础，但事件 surface 比内部 job events 窄 | `src/shared/local-job-api.ts` 事件不含 guard/question/MCP/usage | 需要 v2 或明确 rich desktop trace 只在 Workbench 内部 |
| Codex MCP project mutation | add/remove 明确限制 global；OAuth/logout 接受 optional cwd | `src/main/lib/trpc/routers/codex.ts` 对 add/remove 抛 `global scope only`，OAuth/logout 传 `projectPath` 为 cwd | 不要把 project-scoped Codex MCP 当已完成；若要保留 projectPath，必须注册路径校验 |

## 2. 目标架构口径

本文目标不是“把所有 runtime 做成同一个内部实现”，而是让 Locus 外层控制层稳定、可审计、可诊断，然后让 Claude/Codex 适配器各自映射到最合适的官方或当前 runtime surface。

目标形态：

```text
Stable outer control layer
  -> DesktopRunRequest
  -> Preflight
  -> PermissionPolicy
  -> ProviderBinding
  -> RuntimeAdapter
  -> RunEvent
  -> Trace / Workbench diagnostics
```

runtime 分工：

| 场景 | Claude 目标 | Codex 目标 | 当前事实 |
|---|---|---|---|
| desktop/chat | `@anthropic-ai/claude-agent-sdk` | `codex app-server` | Claude 已用 SDK；Codex 仍是 ACP |
| headless/batch | 先保留 `claude -p` | 先保留 `codex exec` | 当前已有薄 headless adapter |
| 内部自动化/工具 | Claude Agent SDK | `@openai/codex-sdk` 仅作候选 | 当前未引入 Codex SDK |
| 兼容旧路径 | 不需要第二 desktop path | ACP 只作 temporary-compat | 当前 ACP 是默认 Codex desktop path |

因此，本文不把 ACP 当最终完成口径，也不把 Codex SDK 自动当 desktop/chat 目标。app-server 是否最终启用，必须由 matrix、schema/client spike、approval hook fail-closed 证据、provider/MCP/security smoke 决定。

## 3. 当前状态 vs 目标状态

| 领域 | 目标状态 | 当前状态 | 差距 |
|---|---|---|---|
| DesktopRunRequest | Claude/Codex adapters 接收同一个 desktop-capable request | 只有 headless 最小 contract；desktop 仍各自在 route 内组装上下文 | 需要新 main-process request/result/event 类型 |
| Preflight | runtime/provider work 前统一验证 cwd/project/chat/subChat/provider/MCP/attachments/local-only | desktop job shell 校验 cwd/subChat，但后续 route 仍使用 raw `input.cwd` 做 runtime setup | 提取 reusable preflight 并强制 routes 使用 verified context |
| PermissionPolicy | plan/agent/guarded 有统一 policy，再映射到 native controls | guard decision owner 存在；Claude/Codex plan 语义仍不同；Claude agent mode bypass native permission | 建 policy owner、统一 plan 语义、明确 native control 策略 |
| Codex desktop adapter | app-server adapter 为目标；ACP temporary fallback | 当前 `codex.ts` 直接 ACP provider + `streamText` | app-server schema/client/adapter/fallback gate |
| ProviderBinding | runtime-neutral binding shape + adapter-specific mapping | provider profile storage/gateway 和 Codex env allowlist 已存在，但偏 ACP args/env | app-server mapping 或 honest blocker |
| Capability truth | adapter source/version/evidence 被 UI 消费 | shared manifest 存在；renderer 主要直接 import helper | adapter-aware manifest + renderer store |
| RunEvent/Trace | desktop/headless 都产出 ordered sanitized semantic events | event schema 有，desktop job 多数只写 lifecycle/status | stream-to-job-event mapper |
| Workbench | structured timeline 和 diagnostics | 可列 jobs，可看 raw payload | semantic timeline、filters、chat/job correlation |
| Scope expansion | runtime-neutral approve/reject loop | UI state 共享；response mutation 固定走 Claude route | neutral route 或 Codex degraded/retry-only |
| Local Job API | 能表达或明确不表达 rich trace | v1 event surface 比内部 job events 窄 | v2 或 scope statement |

## 4. 已经比较扎实的基础

| 已有基础 | 证据 | 价值 |
|---|---|---|
| capability manifest | `src/shared/agent-runtime-capabilities.ts` | 防止虚假 parity/support claim |
| capability tRPC router | `src/main/lib/trpc/routers/agent-runtime.ts` | main 可暴露 renderer-safe truth |
| provider profile 加密和 gateway | `src/main/lib/provider-profiles/storage.ts`、`gateway.ts` | renderer 不拿 plaintext upstream token |
| Codex env allowlist | `src/main/lib/codex/provider-runtime-binding.ts` | 降低 host env secret 泄漏 |
| guard decision owner | `src/main/lib/agent-guard/decision.ts` | Claude/Codex 可以复用同一 guard 逻辑 |
| desktop job shell | `src/main/lib/desktop-agent-jobs.ts` | desktop runs 可落到 job 表并校验 cwd/subChat |
| headless runner | `src/main/lib/headless/agent-runtime.ts` | batch/job path 已有 adapter shape |
| Local Job API v1 | `src/shared/local-job-api.ts` | 外部 local API 有稳定基础 |
| renderer runtime event owner | `src/renderer/features/agents/lib/runtime-event-state.ts` | AskUserQuestion 和 guard UI state 有 canonical owner |

重要边界：这些基础是真实存在的，但不能直接推导出“app-server adapter 已完成”或“unified trace 已完成”。它们只是后续迁移的地基。

## 5. 主要阻断点

### 5.1 DesktopRunRequest 还不是主路径

Headless contract 只有：

```ts
{
  jobId: string
  runtime: AgentRuntimeId
  cwd: string
  mode: "plan" | "agent"
  prompt: string
  signal: AbortSignal
}
```

Desktop 至少还需要 chat/subChat/run identity、provider binding、attachments、MCP readiness、scope contract、permission policy、trace observer、session/cancel metadata。当前这些仍散在 `claude.ts` 和 `codex.ts`。

### 5.2 Codex app-server adapter 还没有产品实现

当前 Codex desktop path 证据很直接：ACP provider、bundled `codex-acp` binary、Vercel AI SDK `streamText`、ACP permission handler。OpenSpec 已经把 app-server-first 写成方向，但 tasks 仍大量未完成。

### 5.3 PermissionPolicy 不统一

guard owner 已存在，但 Claude plan、Codex plan、Claude agent native permission、guarded run expansion 都还没有统一 policy owner。尤其 Claude agent mode 当前设置 `bypassPermissions` 和 `allowDangerouslySkipPermissions`，这必须被明确成 policy 决策，而不是 route-local 默认。

### 5.4 Trace 不是统一记录层

`agent_job_events` 类型已经覆盖 tool、guard、question、MCP、usage 等，但 desktop streams 还没有把每个 meaningful chunk 写成 ordered semantic event。Workbench 目前主要是 raw payload viewer。

### 5.5 Renderer 只局部消费 truth

`trpc.agentRuntime.listManifests` 存在，但 renderer 搜索结果显示当前 UI 主要直接 import shared helper。最终 Workbench/Active chat 应该消费 main-process truth，尤其在 app-server/ACP fallback 并存时。

## 6. 推荐实现顺序

1. 先锁 OpenSpec 和 ownership，不动产品代码。
2. 抽 Preflight 和 PermissionPolicy，先让现有 Claude/Codex routes 调用同一 owner。
3. 引入 desktop RunRequest/adapter boundary，把当前 Claude path 和 ACP path 包起来。
4. 做 Codex app-server matrix、schema/client、fake adapter security tests。
5. 实现 app-server adapter，并把 ACP 标记为 temporary-compat fallback。
6. 做 stream-to-job-event mapper 和 Workbench semantic timeline。
7. 最后做 app-server smoke、跨平台 smoke、ACP 默认禁用/移除。

## 7. 并行化建议

| Workstream | 可以开始于 | 可并行项 | 注意 |
|---|---|---|---|
| OpenSpec approval | 现在 | 无 | 架构/security 代码前置门槛 |
| Preflight/PermissionPolicy | spec approval 后 | renderer manifest store | 小步、测试重 |
| Codex app-server matrix/schema | spec approval 后 | Preflight | 先证明协议和 security hook |
| DesktopRunRequest boundary | Preflight shape 确定后 | app-server matrix | 给 app-server adapter 找插入口 |
| Renderer diagnostics/trace | event contract 确定后 | adapter work | 不等 app-server 全部完成 |
| Workbench timeline | event mapper 起步后 | smoke/test | 从当前 Claude/app-server contract 开始 |

## 8. 前 10 个具体任务

1. Approve `refactor-codex-official-runtime-adapter`。
2. 新增/扩展 runtime control layer OpenSpec。
3. 提取 `desktop-agent-jobs.ts` 的 context validation 为 Preflight owner。
4. Claude/Codex routes 全部使用 verified context。
5. 定义 PermissionPolicy，统一 plan/agent/guarded semantics。
6. 明确 Claude native permission/bypass 策略并测试。
7. 引入 desktop RunRequest 和 adapter interface。
8. 把当前 Codex ACP path 标成 `temporary-compat` adapter。
9. 生成/固定 Codex app-server schema/client，并加 fake adapter fail-closed tests。
10. 把 desktop stream chunks 映射到 persisted semantic trace。

## 9. 可勾选任务表

勾选规则：只有代码、测试和 smoke 证据都满足“完成标准”时，才把 `[ ]` 改成 `[x]`。OpenSpec 任务只代表 proposal 进度，不等于产品代码完成。

| ID | Done | 优先级 | 阶段 | 任务 | 主要文件/位置 | 完成标准 |
|---|---|---|---|---|---|---|
| S1 | [ ] | P0 | Scope lock | 审批 `refactor-codex-official-runtime-adapter`，确认 Codex desktop/chat 目标是 `codex app-server`，SDK 只做内部自动化候选，ACP 只做 temporary-compat | `openspec/changes/refactor-codex-official-runtime-adapter/**` | `openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive` 通过，任务 1.5 完成 |
| S2 | [ ] | P0 | Scope lock | 新增或扩展 runtime control layer OpenSpec，覆盖 Preflight、PermissionPolicy、desktop RunRequest、RunEvent、Trace | `openspec/changes/add-runtime-control-layer/` 或现有 change | 产品代码开始前已 approval |
| S3 | [ ] | P0 | Scope lock | 更新 ownership map，写清新 owner，避免 route/service 双实现 | `docs/OWNERSHIP_MAP.md` | `bun run architecture:check` 通过 |
| S4 | [ ] | P0 | Scope lock | 固定 plan-mode 语义：完全只读，或只允许 Locus-owned artifact path 写入 | OpenSpec design + tests | Claude/Codex plan tests 使用同一规则 |
| S5 | [ ] | P0 | Scope lock | 明确 ACP 迁移保留条件和删除条件 | OpenSpec tasks/design | 有 fallback flag、diagnostic label、default-disable condition、removal condition |
| P1 | [ ] | P0 | Preflight | 从 `desktop-agent-jobs.ts` 提取 reusable desktop run preflight | `src/main/lib/agent-runtime/preflight.ts` | 返回 verified cwd/project/chat/subChat；原 job tests 仍通过 |
| P2 | [ ] | P0 | Preflight | Claude/Codex routes 后续 runtime setup 全部使用 verified context，不再直接信任 `input.cwd` | `claude.ts`、`codex.ts` | cwd mismatch 在 provider/MCP/runtime work 前失败 |
| P3 | [ ] | P0 | Preflight | 把 attachment、MCP needs-auth、provider profile、local-only blocker 纳入 preflight 结果 | `agent-runtime/preflight.ts` | block 发生在 provider start 前，返回 renderer-safe diagnostic |
| P4 | [ ] | P0 | PermissionPolicy | 建立统一 `PermissionPolicy` 类型和 mode mapping | `src/main/lib/agent-runtime/permission-policy.ts` | Claude/Codex plan/agent/guarded 通过同一 policy 入口 |
| P5 | [ ] | P0 | PermissionPolicy | 移除或严格限定 Claude route-local `.md` plan 写例外 | `src/main/lib/trpc/routers/claude.ts` | plan-mode arbitrary `.md` write 不再默认允许，或只允许明确 Locus artifact path |
| P6 | [ ] | P0 | PermissionPolicy | 重新决策 Claude agent mode 的 native permission 策略 | `claude.ts` + OpenSpec design | 若继续 bypass，必须有 Locus guarded-only policy、测试和说明；否则使用 native prompt/control |
| P7 | [ ] | P1 | MCP/security | Codex MCP OAuth/logout 的 `projectPath` 做 registered-project 校验，或移除 projectPath 并保持 global-only | `src/main/lib/trpc/routers/codex.ts` | 任意 renderer-supplied path 不能作为 cwd 传给 Codex CLI |
| P8 | [ ] | P0 | Redaction | 做 runtime diagnostic/job-event redaction context | `agent-runtime/redaction.ts`、`job-store.ts` | fake API key/OAuth/MCP token 不出现在 logs/events/renderer chunks |
| R1 | [ ] | P0 | RunRequest | 定义 desktop-capable RunRequest/RunResult/RunEvent | `src/main/lib/agent-runtime/desktop-run-request.ts`、`runtime-events.ts` | 类型含 identity/context/provider/policy/MCP/trace/control；不含 renderer secret |
| R2 | [ ] | P0 | Adapter boundary | 建立 desktop runtime adapter interface/factory | `src/main/lib/agent-runtime/desktop-runner.ts` | tRPC route 只做 input validation/envelope，不再新增 durable runtime business logic |
| R3 | [ ] | P0 | Adapter boundary | 将当前 Claude path 包成 adapter，先不大改 renderer API | `src/main/lib/claude/**`、`claude.ts` | 行为不回退，route-local 新 policy/provider/trace logic 被删除或迁入 owner |
| R4 | [ ] | P0 | Adapter boundary | 将当前 Codex ACP path 包成 `temporary-compat` adapter | `src/main/lib/codex/acp-adapter.ts`、`codex.ts` | diagnostics 显示 adapter source/fallback reason |
| R5 | [ ] | P0 | Adapter boundary | 移除被新 service 替代的 route-local helper，或加 migration gate/deletion date/tests | affected route/service files | 不保留无门槛双路径 |
| C1 | [ ] | P0 | Codex app-server | 完成 ACP、SDK、app-server official matrix | OpenSpec design | provider binding/MCP/approval/question/attachment/stream/usage/session/cancel 每项都有结论 |
| C2 | [ ] | P0 | Codex app-server | 生成或固定 app-server schema/client | `src/main/lib/codex/app-server-protocol/**` | schema/version drift 有测试失败 |
| C3 | [ ] | P0 | Codex app-server | 证明 app-server approval hook fail-closed | fake adapter tests | missing/delayed hook 都不能开始 guarded/plan provider work |
| C4 | [ ] | P0 | Codex app-server | app-server runtime env 使用 allowlist，不继承 stale host tokens | `app-server-adapter.ts` | `OPENAI_API_KEY`、`CODEX_API_KEY`、`ANTHROPIC_API_KEY`、`GITHUB_TOKEN` 不泄漏 |
| C5 | [ ] | P0 | Codex app-server | 实现 app-server adapter MVP | `src/main/lib/codex/app-server-adapter.ts` | 支持 start/stream/cancel/session/status，失败时有 renderer-safe diagnostic |
| C6 | [ ] | P0 | Codex app-server | provider profile gateway 映射到 app-server，或诚实 blocking/degraded | `provider-runtime-binding.ts`、`app-server-adapter.ts` | renderer 只传 profile ID，不传 token/env/header |
| C7 | [ ] | P1 | Codex app-server | MCP readiness/auth 映射到 app-server 或 preflight blocker | `app-server-adapter.ts`、MCP service | needs-auth 在 provider work 前阻断 |
| C8 | [ ] | P1 | Codex app-server | AskUserQuestion/MCP elicitation round trip 标准化 | `app-server-adapter.ts`、renderer runtime state | pending/result/timeout/cancel 都有事件和测试 |
| C9 | [ ] | P1 | Codex app-server | image/long-text attachment 进入 app-server input item 或明确 unsupported | `chat-attachments.ts`、`long-text-attachments.ts`、adapter | unsupported refs 在 provider work 前失败 |
| C10 | [ ] | P1 | Capability truth | capability manifest 增加 adapter source/version/evidence | `src/shared/agent-runtime-capabilities.ts`、`codex-runtime-status.ts` | app-server 未证明的能力不得继承 ACP supported 状态 |
| C11 | [ ] | P1 | ACP cleanup | app-server smoke 后默认禁用 ACP fallback，后续移除 dependency | `package.json`、`codex.ts`、adapter factory | ACP 不再是 product completion target |
| T1 | [ ] | P1 | Trace | 将 Claude desktop stream chunks 映射到 `agent_job_events` | `claude` adapter + `job-store.ts` | assistant/tool/guard/question/usage/status/completed 按序持久化 |
| T2 | [ ] | P1 | Trace | 将 Codex app-server stream events 映射到同一 RunEvent/job-event schema | `app-server-adapter.ts` | Codex/Claude Workbench timeline 使用同一事件类别 |
| T3 | [ ] | P1 | Trace | 所有事件持久化前做 redaction | event mapper/redaction tests | secret-like payload 测试通过 |
| T4 | [ ] | P1 | Renderer truth | renderer 建立 capability manifest store，消费 `trpc.agentRuntime.listManifests` | renderer store/hooks | Active chat/guard/workbench 不只靠 shared static helper |
| T5 | [ ] | P1 | Diagnostics | 建立统一 runtime diagnostic state | `runtime-event-state.ts` 或新 owner | runtime-status/capability/auth/MCP/guard/question 统一模型 |
| T6 | [ ] | P1 | Workbench | Workbench logs 从 raw payload 升级为 semantic timeline | `agent-workbench.tsx` | 可过滤 tools/guard/questions/MCP/usage/errors |
| T7 | [ ] | P1 | Workbench | 建立 job/subChat/runId 互链 | job schema/router/workbench/chat UI | 从 Workbench 可打开 chat run，从 chat 可打开 trace |
| T8 | [ ] | P1 | Scope expansion | 做 runtime-neutral scope expansion route，或把 Codex 标为 retry-only degraded | `agent-runtime` route/service + renderer | renderer 不再固定调用 `trpc.claude.respondScopeExpansion` |
| L1 | [ ] | P2 | Local Job API | 决定 Local Job API v1 是否扩展或开 v2 | `src/shared/local-job-api.ts` | 外部 API 暴露 rich trace，或明确只暴露简化事件 |
| V1 | [ ] | P0 | Verification | Preflight tests | `tests/desktop-agent-jobs.test.ts` + new tests | unregistered cwd/project/subChat 在 provider work 前失败 |
| V2 | [ ] | P0 | Verification | PermissionPolicy tests | new tests | Claude/Codex plan 与 guarded semantics 一致 |
| V3 | [ ] | P0 | Verification | app-server fake adapter security tests | new tests | approval hook/env/token failure cases全部 fail closed |
| V4 | [ ] | P1 | Verification | provider/MCP/redaction tests | provider/runtime/MCP tests | gateway token scope、MCP secrets、diagnostic redaction 均通过 |
| V5 | [ ] | P1 | Verification | Workbench trace tests | workbench/job-event tests | desktop stream events 能被 Workbench 读取和展示 |
| V6 | [ ] | P0 | Verification | 核心命令校验 | repo root | `openspec validate ...`、`bun run architecture:check`、`bun run ts:check`、`bun test tests` 通过 |
| V7 | [ ] | P1 | Smoke | desktop smoke evidence | manual smoke notes | Claude plan/guard、Codex app-server plan/guard、provider-profile、MCP needs-auth、cancel、trace 均有证据 |
| V8 | [ ] | P1 | Handoff | 更新本文任务状态和剩余风险 | 本文 | 已完成项有测试/smoke 证据链接，未完成项不被描述成 supported |

## 10. 不需要或暂不该做的变更

这些不属于本文目标，或者会制造重复路径：

| 不做 | 原因 |
|---|---|
| 不把 `@openai/codex-sdk` 直接设成 desktop/chat 默认 | 当前目标是 rich client；应先证明 app-server 不能满足需求，再考虑 SDK 改口径 |
| 不把 ACP 称为 official Codex 或最终完成状态 | 当前代码确实是 ACP，但 roadmap 目标是 app-server-first |
| 不先大规模重写 `claude.ts`/`codex.ts` | 先抽 Preflight/PermissionPolicy/RunRequest/adapter boundary，小步替换并删除旧 helper |
| 不保留无 flag 的新旧双业务路径 | 违反 ownership map；迁移期必须有 gate、删除条件和测试 |
| 不把 Claude Dynamic Workflows 纳入本文目标 | 它是 Claude-specific proposal，不阻塞 runtime workbench 完成路线 |
| 不扩展 Codex rollback/fork/runtime plugins/runtime commands/runtime workflows | capability manifest 已标 unsupported；没有 durable primitive 和测试前不做 |
| 不为了“统一”抹平 Claude/Codex runtime-specific 内部差异 | 外层 contract 统一，adapter 内部可以不同 |
| 不做 renderer-only trace | 目标包含统一记录和事后诊断，必须持久化到 job events 或等价 store |
| 不把 Codex project-scoped MCP 当已完成 | 当前 add/remove 是 global-only；OAuth/logout 若保留 projectPath，必须先做 registered-project 校验 |
| 不在 diagnostics/job events/UI 中展示 raw provider、gateway、MCP、OAuth、env、header secret | 当前 provider layer 已经有较高安全边界，后续不能降低 |

## 11. 还不够全面的地方

这些不是当前代码能完全回答的，需要后续 spike 或 smoke：

| 缺口 | 为什么现在不能下最终结论 | 下一步 |
|---|---|---|
| app-server protocol 具体字段和稳定性 | 当前仓库没有 app-server client/schema | C1/C2 先做 schema/version spike |
| app-server provider gateway 映射 | 当前 provider binding 是 ACP `-c model_provider` args/env | C6 做 mapping 或 honest blocker |
| app-server approval hook 是否能完全覆盖 guarded/plan | 当前 hard enforcement 证据来自 ACP permission handler | C3 用 fake adapter 和 live smoke 验证 |
| Windows/macOS packaged smoke | 当前审查未运行 packaged app | V7 补真实 desktop smoke |
| full security acceptance | 需要 fake secret/MCP/OAuth payload tests | P8/V4 先补测试 |
| 工作区其它改动是否必要 | 本文只审查 roadmap 目标，未审查其它 modified files 的产品必要性 | 需要单独做 dirty-worktree review |

## 12. 建议校验命令

每个阶段至少跑对应子集；最终合并前跑全量。

```bash
openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive
bun run architecture:check
bun run ts:check
bun test tests
```

如果新增 `add-runtime-control-layer`：

```bash
openspec validate add-runtime-control-layer --strict --no-interactive
```

## 13. 当前校验结果

本次只改本文档，但为了确认审查口径没有和当前仓库基线冲突，已跑：

| 命令 | 结果 |
|---|---|
| `openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive` | Pass |
| `bun run architecture:check` | Pass |
| `bun run ts:check` | Pass |
| `bun test tests` | Pass，440 pass / 0 fail |

这些结果只说明当前仓库基线健康，不说明任务表里的 runtime workbench 目标已经完成。

## 14. 当前文档状态

本文现在只是路线图和任务表，不代表实现完成。任务表中所有 `[ ]` 都应保持未勾选，直到对应代码、测试和 smoke 证据存在。
