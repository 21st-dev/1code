# PROJECT-MAP.md — Locus 全项目只读审计

> **范围**：`main` 分支，HEAD `b4ea0ed1`。**不包含** `codex/add-kun-runtime-settings-gate`（Kun gate 未合并进 main）。
> **性质**：只读审计，未修改任何产品代码。本文是唯一产出物。
> **方法**：4 个只读专家 agent 按 6 个风险区域分块审计 + `knip` 静态死代码扫描 + 人工逐条核对 `file:line`。
> **约定**：
> - 每条结论都带可点开验证的 `file:line`。
> - 无源码依据的"设计意图"标 **「待确认」**，不臆测。
> - 风险条目标注核对状态：**✓核对** = 本次已亲自打开源码确认；**待核对** = agent 报告、`file:line` 可点验但未逐行复核。
> - 严重度：Critical / High / Medium / Low / Info。
> - **2026-06-26 P0 修复追记**：Critical R1 已在 `codex/harden-worktree-setup-trust` 上改为显式 trust gate，仓库提供的 setup 命令默认不执行。

## 0. 机械基线（审计参照）

`bun run check`（= `lint && architecture:check && ts:check && test`）**全绿**：测试 1263 pass / 0 fail（232 文件，~8.85s）。链式 `&&` 走到 test 即代表前序步骤都过。**✓核对**

⚠️ 基线注意点（不是失败，是参照失真）：
- `lint` 实为 `lint:changed`（[package.json:39-40](package.json:39)），只 lint 改动文件；干净树上等于空跑。全量 lint 是 `lint:all`（`biome check .`），`check` **不**跑它。所以"绿 lint"不代表全库 lint 干净。**✓核对**
- `knip` 在 macOS 上首跑因无 GNU `timeout` 直接失败（`command not found: timeout`），需注意别误信第一版空结果。本审计已用带 entry 配置重跑（见 §5.7）。**✓核对**

---

## 1. 系统全景

三进程 Electron，**唯一信任边界是 renderer↔main 的 IPC 桥**。

```
┌─ renderer (419 tsx/ts) ──────────────┐   contextBridge      ┌─ preload (2 文件) ─┐
│ React 19 + Jotai/Zustand/ReactQuery  │ ───────────────────▶ │ exposeElectronTRPC │
│ AI SDK useChat ─▶ ipc-chat-transport │   window.desktopApi  │ window.desktopApi  │
└──────────────────────────────────────┘   window.webUtils    └─────────┬──────────┘
                                                                          │ trpc-electron IPC
                                                              ┌───────────▼────────────────┐
                                                              │ main (324 ts)               │
                                                              │ 32 个 tRPC router            │
                                                              │ agent-runtime / agent-guard │
                                                              │ claude/codex/qwen/ollama/kun│
                                                              │ git+worktree / db(SQLite)   │
                                                              │ headless CLI + job 队列      │
                                                              └─────────────────────────────┘
```

- **进程分工**
  - 入口 [src/main/index.ts](src/main/index.ts)（927 行）：app 生命周期、协议/deep-link 注册（[index.ts:491-521](src/main/index.ts:491)、[index.ts:887-892](src/main/index.ts:887)）、headless CLI 分支（[index.ts:50](src/main/index.ts:50)，imports [10-12](src/main/index.ts:10)）。
  - 窗口 [src/main/windows/main.ts](src/main/windows/main.ts)（684 行）：唯一窗口创建 + 原始 `ipcMain.handle` 处理器。
  - preload [src/preload/index.ts](src/preload/index.ts)：`exposeElectronTRPC()`（[:6](src/preload/index.ts:6)）+ `webUtils.getPathForFile`（[:9-11](src/preload/index.ts:9)）+ `desktopApi`（[:14-167](src/preload/index.ts:14)）。
- **tRPC 信任模型（关键）**：Context 只有 `{ getWindow }`（[trpc/index.ts:8-10](src/main/lib/trpc/index.ts:8)），**无认证中间件、无 per-call principal**。全部 32 个挂载 router 都是 `publicProcedure`（[routers/index.ts:40-76](src/main/lib/trpc/routers/index.ts:40)）。**渲染进程里任何能跑的代码（含被注入内容）都能调用每一个 router**。**✓核对**
- **数据流**：UI → AI SDK transport（[ipc-chat-transport.ts:332](src/renderer/features/agents/lib/ipc-chat-transport.ts:332)）→ tRPC `claude.chat` 订阅（[claude.ts:58-80](src/main/lib/trpc/routers/claude.ts:58)）→ Agent SDK 跑捆绑 `claude` 二进制 → 流式 `UIMessageChunk` 回传 → 落库 `sub_chats.messages`（JSON）。

---

## 2. 子系统逐块拆解

| 子系统 | 核心文件 | 关键抽象 / 扩展点 | 坑 |
|---|---|---|---|
| **IPC/preload** | [preload/index.ts](src/preload/index.ts) | `desktopApi` 频道、`exposeElectronTRPC` | 暴露面大：`shell:open-external`、`vscode:load-theme`(任意路径)、`dialog:save-file`、`git:subscribe-watcher`(任意路径)、`unlockDevTools`。`onStream*` 频道已死（§5）。 |
| **tRPC 层** | [trpc/index.ts](src/main/lib/trpc/index.ts)、[routers/](src/main/lib/trpc/routers/) | 32 个挂载 router；`changes` = git router | 无 auth；多个 router 收 `z.string()` 路径不做根目录约束（§5 High 簇）。 |
| **认证/凭证** | [auth-manager.ts](src/main/auth-manager.ts)、[auth-store.ts](src/main/auth-store.ts)、[secure-storage.ts](src/main/lib/secure-storage.ts)、[mcp-auth.ts](src/main/lib/mcp-auth.ts) | `encryptStringForStorage` 走 safeStorage；写入若不可用则**抛错拒绝存明文**（[secure-storage.ts:134-152](src/main/lib/secure-storage.ts:134)，好姿态 ✓） | `AuthManager` 是空壳；MCP token 明文落 `~/.claude.json`；`FALLBACK_PREFIX` 旁路解密分支。 |
| **agent runtime** | [agent-runtime/](src/main/lib/agent-runtime/)（permission-policy / preflight / scope-expansion） | mode→controlLevel→SDK permissionMode 映射（[permission-policy.ts:611-746](src/main/lib/agent-runtime/permission-policy.ts:611)）；`preflight` 用 DB 校验 cwd（[preflight.ts:157-165](src/main/lib/agent-runtime/preflight.ts:157)） | plan 模式 `MultiEdit` 漏拦；`updatedInput` 不校验。 |
| **agent guard** | [agent-guard/](src/main/lib/agent-guard/)（contract / decision / audit / checkpoint / active-contracts） | 仅 `agent`+scopeContract（"Guarded"）时生效；shell 允许走白名单（[decision.ts:612-677](src/main/lib/agent-guard/decision.ts:612)） | observe 模式（agent 无契约）**不走** guard；`requiresUserApproval` 仅咨询性。 |
| **命令执行/worktree** | [git/worktree-config.ts](src/main/lib/git/worktree-config.ts)、[git/worktree.ts](src/main/lib/git/worktree.ts)、[git/worktree-setup-trust.ts](src/main/lib/git/worktree-setup-trust.ts)、[git/security/](src/main/lib/git/security/) | worktree 内 fs 操作有 `assertRegisteredWorktree`+realpath 约束（[secure-fs.ts](src/main/lib/git/security/secure-fs.ts)，好姿态 ✓）；仓库 setup 命令现在由 trust owner 按命令指纹审批后才执行 | R1 已修；后续仍要处理 tRPC 路径边界和 MCP token 明文（High）。 |
| **数据层** | [db/schema/index.ts](src/main/lib/db/schema/index.ts)、[db/index.ts](src/main/lib/db/index.ts)、[drizzle/](drizzle/) | 15 张表；dev/打包迁移路径分流（[db/index.ts:31-38](src/main/lib/db/index.ts:31)） | `sub_chats.messages` 是无校验 JSON；`claude_code_credentials` 标 DEPRECATED 但永不删。 |
| **renderer 状态** | [shared/chat-message-normalizer.ts](src/shared/chat-message-normalizer.ts)、[agents/atoms/](src/renderer/features/agents/atoms/)、[agents/stores/](src/renderer/features/agents/stores/) | hydration 单入口 normalize（[agent-chat-api.ts:51](src/renderer/features/agents/lib/agent-chat-api.ts:51)） | sub-chat mode 三处存储；多处死代码/分叉（§5）。 |
| **headless/job** | [headless/](src/main/lib/headless/)（cli-dispatcher / daemon / job-runner / job-store） | 从 [index.ts:10-12](src/main/index.ts:10) 进入；`agent_jobs`/`agent_schedules` 表 | 非交互执行路径，权限收敛是 [[policy-grant-scope-enforcement-parked]] 关注点。 |

---

## 3. 关键流程端到端追踪

### 流程 A：用户发一条消息（点击 → 落库）
1. 输入区 [chat-input-area.tsx](src/renderer/features/agents/main/chat-input-area.tsx) 触发 AI SDK `useChat`。
2. transport 适配器调用 `trpcClient.claude.chat.subscribe({ subChatId, chatId, prompt, cwd, mode, sessionId, … })`（[ipc-chat-transport.ts:332](src/renderer/features/agents/lib/ipc-chat-transport.ts:332)）。
3. main 端 `claude.chat` 订阅（[claude.ts:58-80](src/main/lib/trpc/routers/claude.ts:58)）→ `createClaudeAgentSdkDesktopRunEnvelope` 建 streamId/abortController。
4. **preflight**：`verifyDesktopRunPreflight` 把 renderer 传来的 `cwd`（[claude.ts:65](src/main/lib/trpc/routers/claude.ts:65)）与 DB 存的路径比对（[preflight.ts:157-165](src/main/lib/agent-runtime/preflight.ts:157)），不一致即阻断。**✓核对（cwd 校验存在）**
5. **权限**：`permission-policy` 把 mode 映射为 SDK `permissionMode`（[permission-policy.ts:611-746](src/main/lib/agent-runtime/permission-policy.ts:611)）：`plan`→`plan`；`agent`(无契约)→`bypassPermissions`+observe；`agent`(有契约)→`bypassPermissions`+guarded。
6. SDK 启动捆绑 `claude` 二进制（[agent-sdk-query-options.ts:265](src/main/lib/claude/agent-sdk-query-options.ts:265)，路径 [env.ts:157](src/main/lib/claude/env.ts:157)），挂 `canUseTool` 钩子。
7. SDK 流事件 → mapper → 以 `UIMessageChunk` 经 tRPC observable 回流到 renderer transport。
8. 消息落 `sub_chats.messages`（JSON 数组，[schema/index.ts:78](src/main/lib/db/schema/index.ts:78)）。
> 注：preload 的 `stream:${id}:chunk` 频道**不在此路径上**（见 §5 死代码）。

### 流程 B：工具调用的 plan/agent 权限裁决
1. 模型发起工具调用 → `canUseTool`/`PreToolUse` 钩子（[agent-sdk-query-options.ts:265-267](src/main/lib/claude/agent-sdk-query-options.ts:265)）。
2. plan 模式：[agent-sdk-tool-permission.ts:183-202](src/main/lib/claude/agent-sdk-tool-permission.ts:183) 显式拦 `Edit/Write/Bash/NotebookEdit` —— **`MultiEdit` 不在其中**（§5）。
3. agent+契约（guarded）：走 `decideClaudeToolUse` → [decision.ts](src/main/lib/agent-guard/decision.ts) 白名单裁决；非白名单 shell 默认拒。
4. agent 无契约（observe）：仅拦"灾难级"，其余放行。

### 流程 C：凭证读取/落盘
1. 主 Claude OAuth：envelope JSON → `encryptStringForStorage()`（safeStorage）→ `anthropic_accounts.oauthToken`（[schema/index.ts:110-122](src/main/lib/db/schema/index.ts:110)）。**写入端不可用即抛错拒存明文**（[secure-storage.ts:134-152](src/main/lib/secure-storage.ts:134)）。**✓核对**
2. provider profile / 本地 helper token：同样 `encryptStringForStorage` 落 `encryptedToken` 列。
3. **MCP server OAuth token**：明文写 `~/.claude.json` 的 `_oauth`（[mcp-auth.ts:513-518](src/main/lib/mcp-auth.ts:513)）—— §5 High。**✓核对**
4. 读取：`decryptStringFromStorage`，但开头若是 `FALLBACK_PREFIX` 直接 base64 解码返回（[secure-storage.ts:155-161](src/main/lib/secure-storage.ts:155)）—— §5 Medium。**✓核对**

---

## 4. 信任边界与安全模型

- **唯一边界 = renderer↔main IPC**。tRPC 无认证（[trpc/index.ts:8-10](src/main/lib/trpc/index.ts:8)），所以**任何在 renderer 执行的代码都拥有全部 32 router 的能力**。威胁面因此放大：渲染层 XSS / 恶意 MCP 工具结果 / 被污染的前端依赖，都可直接调用任意 router。
- **窗口加固**（[windows/main.ts:489-497](src/main/windows/main.ts:489)）：`contextIsolation: true` ✓、`nodeIntegration: false` ✓、`sandbox: false`（trpc-electron 要求，文档化）、`webSecurity: true`、`webviewTag: true`（启用 `<webview>`）。`setWindowOpenHandler` 一律 deny 转系统浏览器（[main.ts:590-599](src/main/windows/main.ts:590)）；但 `will-navigate` 未在主 webContents 注册（§5 Low）。**待核对（webPreferences 由 agent 报告，行号可点验）**
- **不可信输入入口**：① 打开的项目仓库内容（`.cursor/.locus/.1code` 配置、`CLAUDE.md`/`.claude/` 设置源 [agent-sdk-query-options.ts:272](src/main/lib/claude/agent-sdk-query-options.ts:272)）；② deep-link URL（[index.ts:491-521/887](src/main/index.ts:491)）；③ MCP server 返回内容；④ renderer→tRPC 的全部入参。
- **密钥存储**：DB 内凭证经 safeStorage 加密、写入端拒绝明文回退（好姿态）；**例外**是 MCP token 明文落 `~/.claude.json`、`FALLBACK_PREFIX` 旁路、以及历史 `customClaudeConfigAtom` 把 token 存 localStorage。
- **命令执行面**：Agent SDK 工具（Bash/Write…）以同用户进程运行、**无 OS 级 sandbox**，约束全靠进程内 `canUseTool` 钩子；原 worktree setup 直接 `exec` 已由 R1 修复改为 trust gate，审批后才执行。

---

## 5. 风险登记表

> 高价值条目已亲自打开源码核对（✓核对）；其余 agent 报告条目 `file:line` 可点验（待核对）。

### Critical

**R1 — 打开恶意仓库即触发任意 shell 执行（malicious-repo RCE，无确认）** · **已修 / ✓核对**
- 原问题：`.locus/worktree.json` / `.cursor/worktrees.json` / `.1code/worktree.json` 里的 setup 命令来自仓库内容，旧路径会在建 chat 的 worktree 后台直接执行。`.cursor/worktrees.json` 兼容性使"现存 Cursor 仓库已带毒"成为现实向量。
- 修复边界：仓库 setup 命令不做字符串清洗，改为显式信任门。worktree 创建只检测计划并计算命令指纹；首次遇到 setup 命令时向 renderer 发审批请求，用户批准后才记录 `project_id + command_hash` 并执行。无 `projectId` 时 fail closed，不执行。
- Canonical owner：[worktree-setup-trust.ts](src/main/lib/git/worktree-setup-trust.ts)，所有 trust status / approval / hash 校验在这里；owner 也登记在 [OWNERSHIP_MAP.md](docs/OWNERSHIP_MAP.md)。
- 执行链位置：[worktree-config.ts](src/main/lib/git/worktree-config.ts) 只负责 detect/execute 分离；[worktree.ts](src/main/lib/git/worktree.ts) 在创建 worktree 后调用 trust owner；[worktree-config router](src/main/lib/trpc/routers/worktree-config.ts) 提供 approve-and-run mutation；[agents-layout.tsx](src/renderer/features/layout/agents-layout.tsx) 展示命令原文并让用户批准或跳过。
- 持久化：[0018_classy_ultimatum.sql](drizzle/0018_classy_ultimatum.sql) 新增 `worktree_setup_trust_decisions`，只存 source/path/hash/decision，不存命令原文。
- 回归测试：[worktree-setup-rce-regression.test.ts](tests/worktree-setup-rce-regression.test.ts) 覆盖 `.cursor/worktrees.json` + 恶意命令 + 真实 `createWorktreeForChat` 路径，断言 payload 未执行且审批回调触发；[worktree-setup-trust.test.ts](tests/worktree-setup-trust.test.ts) 覆盖 approval/hash 变更状态机；[worktree-config.test.ts](tests/worktree-config.test.ts) 覆盖 `.cursor` setup plan 检测不执行。
- 本机自查：`find ~/Code -maxdepth 3 \( -path '*/.cursor/worktrees.json' -o -path '*/.locus/*' -o -path '*/.1code/*' \) 2>/dev/null` 无输出，未发现已存在的 worktree setup 配置命中项。
- 本轮验证：`bun test --isolate tests/worktree-setup-rce-regression.test.ts tests/worktree-setup-trust.test.ts tests/worktree-config.test.ts` 8 pass；`bun run check` 全绿，1266 pass / 0 fail。

### High

**R2 — tRPC 文件路由可读任意绝对路径（无项目根约束）** · **✓核对**
- `files.readFile`/`readTextFile` 收 `z.object({ filePath: z.string() })` 后直接 `readFile(filePath)`：[files.ts:383-395](src/main/lib/trpc/routers/files.ts:383)、[files.ts:401](src/main/lib/trpc/routers/files.ts:401)。renderer 可取 `/etc/passwd`、`~/.ssh/id_rsa`、`.env` 等。结合"tRPC 无认证"，渲染层一旦被注入即可外泄。

**R3 — `commands` 路由 `..` 子串校验可被绝对路径绕过 → 任意读/写/删** · **✓核对**
- [commands.ts:1084](src/main/lib/trpc/routers/commands.ts:1084) 用 `input.path.includes("..")` 判断；传入不含 `..` 的绝对路径即通过，`resolveCommandPath` 原样返回。`getContent`/`update`/`delete` 同模式（agent 报 [1168/1196](src/main/lib/trpc/routers/commands.ts:1168)，待核对）。

**R4 — `files.renameFile` / `deleteFile` 无项目根约束** · **待核对**
- [files.ts:562](src/main/lib/trpc/routers/files.ts:562)、[files.ts:586](src/main/lib/trpc/routers/files.ts:586)：`validatePathSafe` 未带 `allowedParent`，只校验绝对+无空字节，可重命名/回收任意可写文件。

**R5 — MCP OAuth token 明文落 `~/.claude.json`** · **✓核对**
- [mcp-auth.ts:508-519](src/main/lib/mcp-auth.ts:508)：`_oauth: { accessToken, refreshToken, clientId, expiresAt }` 明文写入，且 `Authorization: Bearer <token>` 进 headers。该文件与 Claude Code CLI 共享、同用户任意进程可读。缓解：与 DB 凭证一样先 `encryptStringForStorage` 再写。

**R6 — sub-chat mode 三处存储、无单一真相源** · **待核对**
- Jotai atom（[atoms/index.ts:403-419](src/renderer/features/agents/atoms/index.ts:403)，localStorage）/ Zustand（[sub-chat-store.ts:306-315](src/renderer/features/agents/stores/sub-chat-store.ts:306)，仅内存）/ SQLite（[agent-chat-api.ts:208](src/renderer/features/agents/lib/agent-chat-api.ts:208) 写 DB）。调用点更新不一致，DB 在 reload 后胜出并静默丢弃 localStorage 值；mode 直接关系 plan/agent 安全级别。

### Medium

**R7 — `FALLBACK_PREFIX` base64 旁路解密** · **✓核对**
- [secure-storage.ts:155-161](src/main/lib/secure-storage.ts:155)：值以 `locus:v1:base64:` 开头时，先于 safeStorage 检查直接 base64 解码返回明文。当前代码无写入端产生该前缀（待确认是否纯历史遗留），但分支仍活；若本地攻击者能写 DB 即可注入"伪密文"。

**R8 — plan 模式漏拦 `MultiEdit`** · **待核对**
- [agent-sdk-tool-permission.ts:183-202](src/main/lib/claude/agent-sdk-tool-permission.ts:183) 只显式拦 `Edit/Write/Bash/NotebookEdit`；plan 模式下 `MultiEdit` 落到允许分支。是否被 SDK 原生 `permissionMode:"plan"` 兜底属外部依赖，不应据此免拦。

**R9 — 工具审批 `updatedInput` 不校验** · **待核对**
- [claude.ts:339-359](src/main/lib/trpc/routers/claude.ts:339)：`respondToolApproval` 收 `updatedInput: z.unknown()` 原样替换将执行的工具参数。被污染的 renderer 可"展示 A、执行 B"。

**R10 — guarded `requiresUserApproval` 仅咨询性** · **待核对 / 待确认 UI 接线**
- [decision.ts:516-530](src/main/lib/agent-guard/decision.ts:516) 返回 `decision:"allow", requiresUserApproval:true`，但裁决映射只看 `allow`。若 UI 未据此阻断，guarded 的有界 shell 写会无确认执行。

**R11 — 历史 `customClaudeConfigAtom` 把 token 存 localStorage** · **待核对**
- [lib/atoms/index.ts:209-218](src/renderer/lib/atoms/index.ts:209)：`atomWithStorage("agents:claude-custom-config")` 含 `token` 字段。迁移钩子（[use-legacy-migrations.ts:82-116](src/renderer/features/onboarding/lib/use-legacy-migrations.ts:82)）会清空但不 `removeItem`；迁移前 token 明文驻留渲染层 localStorage。

**R12 — local-only 门不挡 Anthropic 端点** · **待核对 / 待确认意图**
- [shared/local-only.ts](src/shared/local-only.ts) 的 `blockedRoots` 不含 `anthropic.com`/`claude.ai`/`platform.claude.com`，local-only 模式下对这些端点不阻断。是否为有意（local-only 仅限制 app 专有域）属**待确认**。

**R13 — `allFullThemesAtom` 恒返回 `[]`** · **待核对**
- [lib/atoms/index.ts:479-483](src/renderer/lib/atoms/index.ts:479)：只读派生 atom 恒空，注释称"由 theme provider 命令式填充"——但派生 atom 不可被 `set()`。订阅它的主题 UI 可能恒空。**待确认**是否有命令式写入方。

**R14 — 损坏的 `sub_chats.messages` 被静默丢弃** · **待核对**
- [chat-message-normalizer.ts:41-43](src/shared/chat-message-normalizer.ts:41) 解析失败仅 `console.warn` 返回 `[]`；用户看到空聊天、无任何数据丢失提示。JSON blob 无版本戳、无逐条类型校验。

**R15 — VS Code 主题扫描 `execSync` 字符串插值** · **待核对**
- [vscode-theme-scanner.ts:124-125](src/main/lib/vscode-theme-scanner.ts:124)：`execSync(\`ls -1 "${extensionsDir}"\`)`。`extensionsDir` 源自 `homedir()` 固定路径（非 renderer 控制），实际注入风险低，但应改 `fs.readdir`。

### Low

| 编号 | 风险 | file:line | 核对 |
|---|---|---|---|
| R16 | `<webview>` `will-navigate` 用 `preventDefault?.()`，可选链使阻止可能失效；且 `normalizeLocalBrowserUrl` 放行任意 `file:` | [local-browser-workbench.tsx:443-458](src/renderer/features/agents/ui/local-browser-workbench.tsx:443)、[shared/local-browser-workbench.ts:93-95](src/shared/local-browser-workbench.ts:93) | 待核对 |
| R17 | 主 webContents 未注册 `will-navigate`，渲染层若被注入可导航到远程源 | [windows/main.ts](src/main/windows/main.ts)（缺失） | 待核对 |
| R18 | `external.openInApp/openFileInEditor` 在 win32 用 `shell:true`，路径含 `&\|;` 可注入 | [external.ts:60-65](src/main/lib/trpc/routers/external.ts:60) | 待核对 |
| R19 | `git:subscribe-watcher` 收任意路径无校验（资源耗尽 + 路径存在性泄漏） | [watcher/ipc-bridge.ts:22-23](src/main/lib/git/watcher/ipc-bridge.ts:22) | 待核对 |
| R20 | `CLAUDE_RAW_LOG=1` 把原始 SDK 消息未脱敏写盘（保留 7 天，开发者开关） | [claude/raw-logger.ts:101-138](src/main/lib/claude/raw-logger.ts:101) | 待核对 |
| R21 | `claude-token.ts` 用 `spawn('claude',['setup-token'],{shell:true})`，PATH 劫持可换二进制 | [claude-token.ts:306-311](src/main/lib/claude-token.ts:306) | 待核对 |
| R22 | `auth:*` IPC 的 `validateSender` 允许 `*.localhost` 子域（处理器是空壳，影响小） | [windows/main.ts:351-362](src/main/windows/main.ts:351) | 待核对 |

### 死代码 / 双路径 / 依赖卫生

| 编号 | 项 | file:line | 核对 |
|---|---|---|---|
| D1 | **整棵 `features/mentions/` 死**（providers/search/registry/hooks/types 全无外部 import），活的是 `agents/mentions/` | [src/renderer/features/mentions/](src/renderer/features/mentions/) | **✓核对（0 外部引用）** |
| D2 | preload `onStreamChunk/onStreamDone/onStreamError` **两端皆死**：renderer 0 消费者、main 无 `stream:*` 发送方 | [preload/index.ts:106-120](src/preload/index.ts:106) | **✓核对** |
| D3 | `features/changes/components/*/` 子文件夹组件集无外部 import（疑似被废弃的并行实现） | [src/renderer/features/changes/components/](src/renderer/features/changes/components/) | **✓核对（0 外部引用）** |
| D4 | 三份分叉的 `pluralize.ts`（md5 各异）：agents/utils、sidebar/utils、lib/utils | [agents/utils/pluralize.ts](src/renderer/features/agents/utils/pluralize.ts) 等 | **✓核对** |
| D5 | `AuthManager.isAuthenticated()` 恒 false、`getUser()` 恒 null；`AuthStore` 加密机制从不被调用 | [auth-manager.ts:11-17](src/main/auth-manager.ts:11) | **✓核对** |
| D6 | `claude_code_credentials` 表标 DEPRECATED 但无迁移删除；仅为"迁移走"而读 | [schema/index.ts:96-104](src/main/lib/db/schema/index.ts:96) | **✓核对** |
| D7 | `syncMessagesAtom` 导出但自述"not used"、0 调用方 | [message-store.ts:994-999](src/renderer/features/agents/stores/message-store.ts:994) | 待核对 |
| D8 | `@agentclientprotocol/sdk` **被用但不在 package.json**（依赖卫生，影响可复现构建） | [codex/tool-permission.ts:7](src/main/lib/codex/tool-permission.ts:7) | **✓核对（knip）** |

### 5.7 knip 全清单（候选，需逐条核对）

带 entry 配置（scratchpad，未提交）重跑结果（默认无配置时为 323 文件误报，已校正）：
- **未用文件 67**、未用导出 599、未用导出类型 20、未用依赖 5（`@git-diff-view/react`、`@git-diff-view/shiki`、`@radix-ui/react-accordion`、`date-fns`、`electron-log`）、未用 devDep 4、未列出依赖 5（含 D8）。
- ⚠️ 仍含误报：preload `desktopApi` 是运行时 contextBridge 对象、插件经 `import(url.href)` 动态加载（[developer-loader.ts:94](src/main/lib/plugins/developer-loader.ts:94)），均不在 import 图内。**因此 67/599 是候选名单，非定论**；本审计仅把已亲自核对的 D1–D8 列为确认项，其余须删除前逐条验证（如 `date-fns`/`electron-log` 是否真未用）。

---

## 6. 待解之谜（待确认）

1. **`FALLBACK_PREFIX` 是否纯历史遗留**：当前无写入端产生 `locus:v1:base64:`。是旧版迁移残留还是死分支？若死，应删 [secure-storage.ts:156-160](src/main/lib/secure-storage.ts:156)。
2. **local-only 的安全语义**：是否有意允许 Anthropic API 调用、仅限制 app 专有域（[local-only.ts](src/shared/local-only.ts)）？若 local-only 应阻一切云出口，则为 Medium 旁路。
3. **`AuthManager`/`AuthStore` 去留**：本地优先、空壳常驻——是永久死代码（应连同 `auth:*` IPC 删除以缩面），还是被部分剥离的功能残留？
4. **`requiresUserApproval` 是否接到 UI 阻断**（[decision.ts:516](src/main/lib/agent-guard/decision.ts:516)）：未找到 renderer 侧据此阻断的调用点。
5. **`projectSlug` 是否在拼 worktree 路径前消毒**（[worktree.ts:985-986](src/main/lib/git/worktree.ts:985)，`~/.21st/worktrees/<slug>`）：未追到生成处与消毒逻辑。
6. **`settingSources:["project","user"]`**（[agent-sdk-query-options.ts:272](src/main/lib/claude/agent-sdk-query-options.ts:272)）：恶意仓库的 `.claude/` 项目级设置能向 SDK 注入多少（system prompt / 工具配置）？范围待确认。
7. **`allFullThemesAtom` 是否有命令式写入方**（[lib/atoms/index.ts:479](src/renderer/lib/atoms/index.ts:479)）：若无，主题选择 UI 恒空。
8. **`<webview>` 分区是否继承 `webSecurity:true` 与 file: CORS 策略**：影响 R16 实际可利用性。
9. **CLAUDE.md 已严重过时**：自述"3 张表 / 简单 Claude+Codex app"，实为 15 表 + Claude/Codex/Qwen/Ollama/Kun/MCP/headless-job/schedule 等。文档与实现的偏离本身是新贡献者的坑（Info）。

---

## 附：方法论与置信度

- 6 风险区域各由只读专家 agent 审（③ runtime → ② auth → ①④ ipc/fs → ⑤⑥ data/renderer），叠加 `knip`。
- 本人**亲自打开源码核对**了：Critical R1 全链、High R2/R3/R5、Medium R7、死代码 D1–D6/D8、基线、schema、tRPC 信任模型、发消息流程。标 **✓核对**。
- 标 **待核对** 的条目均带可点验 `file:line`，但未逐行复核——修复前建议先打开确认。
- 后续若要"修到达标"，停止条件建议：`bun run check` 绿 + `knip`（带正式 `knip.json`）0 确认死代码 + R1/R2/R3/R5 闭环。
