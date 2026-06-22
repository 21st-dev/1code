# Locus runtime workbench 路线图

状态日期：2026-06-13

状态基线：当前 Codex app-server desktop/chat 工作区。注意：本文记录当前实现和验证事实，不代表已完成归档。

本文取代 2026-06-07 口径。旧口径里 “runtime control layer 还差真实 desktop smoke” 已经过时；现在的剩余主线是 Codex official/app-server adapter 迁移。

## 0. 一句话结论

Locus 的跨 runtime 控制层已经完成并归档。Codex official/app-server adapter 迁移已经完成 P0 proof、P1 real transport、P2 truth/diagnostics/smoke 的主体，并额外交付了 roadmap 当初没有预见的 Locus-controlled edit executor 和 provider-profile gateway namespace-tool translation。

当前剩余主线已经从“造 app-server adapter”切换为 P3 上线：app-server 是唯一 Codex desktop/chat 路径。下一步是 dogfood 周期和 app-server 行为收敛，而不是继续保留双主路径。

## 1. 当前事实

| 领域 | 当前状态 | 证据 | 接下来 |
|---|---|---|---|
| Runtime control layer | 已完成并归档 | `openspec/changes/archive/2026-06-11-add-runtime-control-layer/` | 不再作为主线缺口重复追踪 |
| Desktop smoke | 已通过 Claude plan/guard、Codex app-server plan/guard；app-server transport、provider-profile、MCP readiness、cancel、diagnostics、controlled edit 已有真实 smoke/dogfood evidence | `openspec/changes/archive/2026-06-11-add-runtime-control-layer/smoke-evidence.md`, `openspec/changes/refactor-codex-official-runtime-adapter/desktop-smoke-evidence.md`, `openspec/changes/add-locus-controlled-edit-executor-for-codex-app-server/adoption-probe-evidence.md` | 继续 dogfood app-server 路径 |
| Claude desktop/chat | 目标路径是 `@anthropic-ai/claude-agent-sdk` | `src/main/lib/claude/agent-sdk-*` | 只做必要边界维护，不迁移到别的主路径 |
| Codex desktop/chat | app-server 是唯一 desktop/chat adapter | `src/main/lib/codex/desktop-adapter-selection.ts`, `src/main/lib/codex/app-server-adapter.ts` | 继续 dogfood app-server 行为 |
| Codex app-server | Real transport、provider binding、MCP readiness、AskUserQuestion、attachments、usage、cancel、redaction、controlled edit 都已实现并验证 | `openspec/changes/refactor-codex-official-runtime-adapter/`, `openspec/changes/add-locus-controlled-edit-executor-for-codex-app-server/` | 进入 dogfood/default gate |
| Capability truth | runtime-level manifest 已存在；renderer 现在通过 `agentRuntime.listManifests` manifest store 消费，不再只靠 shared static helper | `src/shared/agent-runtime-capabilities.ts`, `src/shared/codex-runtime-capabilities.ts`, `src/renderer/features/agents/lib/runtime-manifest-store.ts` | unknown auth/app-server context 仍保持 degraded |
| Scope expansion | 已改为 runtime-neutral response route | `trpc.agentRuntime.respondScopeExpansion`, `src/main/lib/agent-runtime/scope-expansion.ts` | Codex 仍需以 dogfood 验完整 retry loop |
| Local Job API | v1 可用；rich desktop trace 口径仍是 backlog，不再阻塞 app-server P3 | `src/shared/local-job-api.ts` | 单独决策 v2/内部-only |

## 2. 已完成的控制层

`add-runtime-control-layer` 已归档，任务表 31/31 完成。它现在是后续 app-server 迁移必须消费的地基，不是要重做的对象。

已完成能力：

- `DesktopRunPreflight`：在 provider、MCP、attachment、adapter startup 前验证 project/chat/subChat/cwd/provider/MCP/local-only。
- `PermissionPolicy`：统一 plan、agent、guarded desktop run 语义。
- `DesktopRunRequest`：把 verified context、provider binding、MCP readiness、attachments、trace、cancellation、session metadata 交给 adapter。
- `DesktopRuntimeAdapterFactory`：显式区分 `claude-agent-sdk`、`codex-app-server`。
- `RunEvent` / stream mapper / redaction：把 runtime stream chunk 映射为持久化、redacted、Workbench 可读的 semantic events。
- Workbench timeline：显示 semantic categories，并保留 raw payload debug fallback。

已通过 smoke：

| Scenario | Runtime path | Mode | Status |
|---|---|---|---|
| `claude-plan` | Claude Agent SDK desktop adapter | plan | passed |
| `claude-guard` | Claude Agent SDK desktop adapter | guarded agent | passed |
| `codex-app-server-plan` | Codex app-server desktop adapter | plan | passed |
| `codex-app-server-guard` | Codex app-server desktop adapter | guarded agent | passed |

## 3. 当前主线：Codex official/app-server adapter

活跃 OpenSpec：

`openspec/changes/refactor-codex-official-runtime-adapter/`

当前任务状态：`refactor-codex-official-runtime-adapter` 和 `add-locus-controlled-edit-executor-for-codex-app-server` 都已完成实现和验证，仍未归档。已完成的是 proposal、approval、app-server matrix、P0 safety proof、runtime-control layer 消费确认、real app-server transport、permission/interaction/attachment/stream/session/long-text/scope proof、provider-profile gateway namespace-tool translation、controlled edit executor、desktop smoke 和 secret-at-rest shell snapshot scrub。

不要把下面这些当作已完成：

- structured `apply_patch` app-server tool support
- broad rollback/fork parity
- Local Job API rich desktop trace v2

## 4. 推荐顺序

### P0：app-server proof 和 truth gate

这些任务已经完成，并应继续作为 ACP 退役前的硬约束：

1. `2.1` Inspect `@openai/codex-sdk` types，只作为 internal automation/tooling 候选。
2. `2.3` 完整比较 ACP / SDK / app-server：provider binding、MCP、approval、AskUserQuestion、attachments、streaming、usage/session、resume/fork/rollback、cancel、diagnostics、local-only。
3. `2.6` 证明 app-server approval/permission interception 能 fail closed。
4. `2.7` 证明 SDK/app-server runtime env 只能来自 explicit allowlist，不能继承 stale host tokens。
5. `2.8` 证明 provider gateway token、MCP env/header/OAuth、diagnostics 都 renderer-safe 且 redacted。
6. `2.10` 明确 app-server adapter 消费已有 runtime control layer，而不是在 `codex.ts` 里再造一套。

完成标准：

- `openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive` 通过。
- fake app-server safety tests 存在并通过。
- provider/env/redaction tests 存在并通过。
- 未证明能力仍标为 `degraded` 或 `unsupported`。

### P1：实现 app-server real transport

状态：已完成。MVP 覆盖 desktop/chat 必需路径：

- start / stream / cancel / session / status
- plan-mode 和 guarded-run fail-closed
- provider-profile gateway binding，或明确 blocker/degraded
- MCP readiness/auth preflight blocker
- AskUserQuestion/MCP elicitation 标准事件
- supported attachment handling；unsupported attachment 在 provider work 前失败
- usage/session metadata where available
- semantic RunEvent mapping and redaction

仍不应混入 MVP 的内容：

- rollback/fork parity
- broad workflow parity
- Local Job API v2
- plugin/runtime marketplace
- UI 大改版
- ACP removal

### P2：UI truth、diagnostics、smoke

状态：已完成到可进入 P3 的程度。已补齐：

- adapter-source-aware capability manifest。
- renderer manifest store，停止只靠 shared static helper。
- runtime diagnostic state：runtime status / capability / auth / MCP / guard / question。
- runtime-neutral scope expansion route。
- app-server desktop smoke：chat、guard denial、plan denial、provider-profile binding、MCP readiness、cancel、fallback diagnostics。
- controlled guarded edit：direct/app-managed 和 provider-profile gateway 两条路径都有 productive edit evidence。
- app-server secret-at-rest scrub：生产 `CODEX_HOME/shell_snapshots` 不保留 Locus-injected Codex secrets。

仍需在 P3 dogfood 中继续观察：

- scope expansion 的完整 Codex retry loop 是否在真实节奏下顺畅。
- provider-profile 用户对 third-party provider 能看到工具 schema/编辑内容的透明度提示。
- long-running/resume/cancel 在日常使用中的稳定性。

### P3：disable/remove ACP fallback

状态：已进入 gate，但尚未执行。

只有 app-server 完成 proof、MVP、diagnostics、desktop smoke 后，才能默认禁用 ACP fallback；这个前提已经满足，且 app-server 现在是默认路径。下一步不是继续补 adapter，而是在 dogfood 窗口内验证回滚开关、记录 go/no-go 条件，并把 ACP dependency 删除作为后续独立 slice。删除 ACP dependency 不要和首次默认启用混在一起。

## 5. Backlog 和停车场

这些不是当前 runtime 主线，不应阻塞 app-server：

| 项目 | 处理 |
|---|---|
| `add-embedded-utility-model` | 已决定不做（2026-06-13 删除 proposal）：本地 utility 小模型与 controllability 主命题无关，且带来 llama.cpp sidecar 打包成本 |
| Local Job API rich trace / v2 | 等 app-server RunEvent mapping 稳定后再决策 |
| broader renderer UI polish | 等 capability truth 和 diagnostics state 后再做 |
| workflow/plugin/marketplace follow-ups | 不混入 app-server migration |

`add-embedded-utility-model` 已于 2026-06-13 决定不做并删除 proposal。理由：它服务的是 bounded helper text（起名/commit message），与"可控执行层"的产品主命题正交，且 llama.cpp sidecar 会显著增加打包/维护成本。现有 helper 流程继续用 API/Ollama/确定性 fallback。

## 6. 不再使用的旧口径

以下判断已过时：

- `add-runtime-control-layer 30/31`
- runtime control layer 还差真实 desktop smoke
- Workbench logs 还没有 semantic timeline
- adapter factory 还未完成
- control layer verification 只能靠 unit tests

以下判断仍然成立：

- Codex app-server dogfood 仍需持续补证。
- structured `apply_patch` app-server tool support 仍 deferred。
- Local Job API rich trace 口径还未决定。
- `add-locus-controlled-edit-executor-for-codex-app-server` 和 `refactor-codex-official-runtime-adapter` 仍需归档/入库后才算 lifecycle 收尾。

## 7. 每次回看 roadmap 的判断规则

先按这三层判断，避免把状态混在一起：

1. **已归档实现**：`openspec/changes/archive/**` + current code + tests/smoke。
2. **活跃 proposal**：`openspec/changes/refactor-codex-official-runtime-adapter/**`，这是计划和任务，不是已实现。
3. **backlog/noise**：未提交 proposal、重复目录、`* 2.*` 云同步副本、未验证草稿。

如果一个能力只出现在 proposal 里，不要把它写成 supported。只有代码、tests、desktop smoke 或等价 DB/filesystem-backed replay 都对上，才能改成完成。

## 8. 当前验证命令

基础校验：

```bash
openspec validate --all --strict --no-interactive
bun run architecture:check
bun run ts:check
bun test tests
```

app-server 主线新增校验应至少包含：

```bash
openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive
bun test tests/codex-*.test.ts tests/provider-runtime-binding.test.ts tests/provider-profile-diagnostics.test.ts
```

最终 app-server completion 还必须补真实 desktop smoke evidence，不能只靠单元测试。
