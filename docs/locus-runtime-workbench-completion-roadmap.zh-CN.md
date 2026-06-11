# Locus runtime workbench 路线图

状态日期：2026-06-12

状态基线：`main` / `origin/main` at `95e5de62` (`spec(runtime): archive runtime control layer`)

本文取代 2026-06-07 口径。旧口径里 “runtime control layer 还差真实 desktop smoke” 已经过时；现在的剩余主线是 Codex official/app-server adapter 迁移。

## 0. 一句话结论

Locus 的跨 runtime 控制层已经完成并归档。它已经通过真实 Electron desktop smoke，覆盖 Claude Agent SDK 和 Codex ACP temporary-compat 两条当前 desktop 路径。

当前主线不是继续补 control layer，也不是扩大 UI 功能，而是把 Codex desktop/chat 从 ACP temporary compatibility adapter 迁到官方 `codex app-server` 路径，同时保持现有的 preflight、permission policy、provider binding、MCP readiness、attachments、AskUserQuestion、usage、trace 和 redaction 安全边界。

## 1. 当前事实

| 领域 | 当前状态 | 证据 | 接下来 |
|---|---|---|---|
| Runtime control layer | 已完成并归档 | `openspec/changes/archive/2026-06-11-add-runtime-control-layer/` | 不再作为主线缺口重复追踪 |
| Desktop smoke | 已通过 Claude plan/guard、Codex ACP plan/guard | `openspec/changes/archive/2026-06-11-add-runtime-control-layer/smoke-evidence.md` | app-server 迁移后需要新增 app-server smoke |
| Claude desktop/chat | 目标路径是 `@anthropic-ai/claude-agent-sdk` | `src/main/lib/claude/agent-sdk-*` | 只做必要边界维护，不迁移到别的主路径 |
| Codex desktop/chat | 当前仍是 `codex-acp-temporary-compat` | `src/main/lib/codex/acp-temporary-compat-adapter.ts` | 迁移到 `codex app-server` |
| Codex app-server | OpenSpec 已开，产品实现未完成 | `openspec/changes/refactor-codex-official-runtime-adapter/tasks.md` | 先 proof/test，再 adapter MVP |
| Capability truth | runtime-level manifest 已存在 | `src/shared/agent-runtime-capabilities.ts` | 升级为 adapter-source-aware truth |
| Scope expansion | renderer 响应仍偏 Claude route | `trpc.claude.respondScopeExpansion` | 做 runtime-neutral route 或 Codex retry-only degraded |
| Local Job API | v1 可用，但 rich desktop trace 口径未定 | `src/shared/local-job-api.ts` | app-server 主线后再决定 v2/内部-only |

## 2. 已完成的控制层

`add-runtime-control-layer` 已归档，任务表 31/31 完成。它现在是后续 app-server 迁移必须消费的地基，不是要重做的对象。

已完成能力：

- `DesktopRunPreflight`：在 provider、MCP、attachment、adapter startup 前验证 project/chat/subChat/cwd/provider/MCP/local-only。
- `PermissionPolicy`：统一 plan、agent、guarded desktop run 语义。
- `DesktopRunRequest`：把 verified context、provider binding、MCP readiness、attachments、trace、cancellation、session metadata 交给 adapter。
- `DesktopRuntimeAdapterFactory`：显式区分 `claude-agent-sdk`、`codex-acp-temporary-compat`、未来 `codex-app-server`。
- `RunEvent` / stream mapper / redaction：把 runtime stream chunk 映射为持久化、redacted、Workbench 可读的 semantic events。
- Workbench timeline：显示 semantic categories，并保留 raw payload debug fallback。

已通过 smoke：

| Scenario | Runtime path | Mode | Status |
|---|---|---|---|
| `claude-plan` | Claude Agent SDK desktop adapter | plan | passed |
| `claude-guard` | Claude Agent SDK desktop adapter | guarded agent | passed |
| `codex-temporary-compat-plan` | Codex ACP temporary-compat desktop adapter | plan | passed |
| `codex-temporary-compat-guard` | Codex ACP temporary-compat desktop adapter | guarded agent | passed |

## 3. 当前主线：Codex official/app-server adapter

活跃 OpenSpec：

`openspec/changes/refactor-codex-official-runtime-adapter/`

当前任务状态：13/45 完成。已完成的是 proposal、approval、部分 schema evidence、ACP fallback 定义、Claude boundary cleanup、OpenSpec validate。还没有产品级 app-server adapter。

不要把下面这些当作已完成：

- `src/main/lib/codex/app-server-adapter.ts`
- app-server protocol client/schema committed path
- fake app-server missing/delayed approval hook fail-closed tests
- app-server explicit env allowlist tests
- renderer raw secret rejection for app-server payloads
- provider gateway -> app-server binding proof
- app-server MCP readiness/auth mapping
- app-server AskUserQuestion/MCP elicitation round trip
- app-server attachment/usage/session/cancel mapping
- app-server desktop smoke evidence

## 4. 推荐顺序

### P0：先完成 app-server proof，不写 happy path adapter

先完成这些任务：

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

### P1：实现 app-server MVP behind explicit gate

MVP 只做 desktop/chat 必需路径：

- start / stream / cancel / session / status
- plan-mode 和 guarded-run fail-closed
- provider-profile gateway binding，或明确 blocker/degraded
- MCP readiness/auth preflight blocker
- AskUserQuestion/MCP elicitation 标准事件
- supported attachment handling；unsupported attachment 在 provider work 前失败
- usage/session metadata where available
- semantic RunEvent mapping and redaction

不要在 MVP 同时做：

- rollback/fork parity
- broad workflow parity
- Local Job API v2
- plugin/runtime marketplace
- UI 大改版
- ACP removal

### P2：UI truth、diagnostics、smoke

app-server MVP 后再做：

- adapter-source-aware capability manifest。
- renderer manifest store，停止只靠 shared static helper。
- runtime diagnostic state：runtime status / capability / auth / MCP / guard / question。
- runtime-neutral scope expansion route，或 Codex 明确 retry-only degraded。
- app-server desktop smoke：chat、guard denial、plan denial、provider-profile binding、MCP readiness、cancel、fallback diagnostics。

### P3：disable/remove ACP fallback

只有 app-server 完成 proof、MVP、diagnostics、desktop smoke 后，才能默认禁用 ACP fallback。删除 ACP dependency 是后续单独 slice，不要和首次 app-server MVP 混在一起。

## 5. Backlog 和停车场

这些不是当前 runtime 主线，不应阻塞 app-server：

| 项目 | 处理 |
|---|---|
| `add-embedded-utility-model` | 可以作为 backlog proposal 保留；它是 utility text local model，不是 main agent runtime |
| Local Job API rich trace / v2 | 等 app-server RunEvent mapping 稳定后再决策 |
| broader renderer UI polish | 等 capability truth 和 diagnostics state 后再做 |
| workflow/plugin/marketplace follow-ups | 不混入 app-server migration |

`add-embedded-utility-model` 的口径：

- 仅用于 sub-chat title、commit message、branch/workspace/file rename suggestion 等 bounded helper text。
- 不替代 Claude/Codex/custom provider/Ollama 的 main agent chat。
- 不自动下载模型，不把大模型打进默认 installer。
- 若保留，应作为 backlog OpenSpec 单独提交，不和 app-server implementation 混提交。

## 6. 不再使用的旧口径

以下判断已过时：

- `add-runtime-control-layer 30/31`
- runtime control layer 还差真实 desktop smoke
- Workbench logs 还没有 semantic timeline
- adapter factory 还未完成
- control layer verification 只能靠 unit tests

以下判断仍然成立：

- Codex app-server 还未实现。
- app-server safety proof 还没有完成。
- adapter-aware capability truth 还未完成。
- runtime-neutral scope expansion 还未完成。
- Local Job API rich trace 口径还未决定。

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
