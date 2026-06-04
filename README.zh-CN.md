# Locus

语言：[English](README.md) | 简体中文

本地优先的 AI 工作台和 agent runtime 底座。

Locus 是基于 [1Code](https://github.com/21st-dev/1code) 改造的本地优先桌面工作流。
coding 仍然是第一个强场景，但项目定位不只是一款 coding chat UI。Locus 的核心方向是
一个本地 AI 工作台和 runtime hub，用来承载 Claude Code / Codex 驱动的本地任务。

Locus 保留桌面 UI、本地项目选择、worktrees、terminal、git 工具、Claude Code、Codex、
custom providers、MCP、skills，以及已支持 provider 流程里的加密本地 provider profile
存储，同时从默认本地优先版本中移除或隔离上游 hosted 产品入口。

![Locus 目标本地 agent 平台](docs/assets/locus-agent-platform.zh-CN.svg)

## 当前范围

- 本地项目和本地 SQLite 状态
- Claude Code subscription、API key 和 custom provider 流程
- Codex subscription、API key 和本地 Codex 集成
- 用于本地桌面任务可见性的 Agent Workbench
- 本地 chat、tools、terminal、git diff、staging、commit generation 和 worktrees
- Ollama 优先的 helper generation，以及 Settings 配置的 provider fallback
- 默认启用 local-only guard，作为 defense-in-depth
- 上游 hosted auth、subscription checks、remote sandbox、automations、inbox、analytics、error tracking 和 updater UI 已从默认本地优先版本移除或隔离

## 平台方向

headless job 平台目前在独立分支开发，审查后再合入 `main`。该分支包含 durable local
jobs、job events、`locus run`、`locus jobs`、local daemon、local schedules、桌面
job 可见性，以及最小 `locus acp` stdio 入口。在 headless 实现完成审查并合入前，
`main` 上只能把这些描述为平台方向，而不是已发布能力。

平台定位、集成边界和路线图见
[docs/locus-local-agent-platform.zh-CN.md](docs/locus-local-agent-platform.zh-CN.md)。

## 状态和边界

当前 `main` 成熟度：

| 模块 | 状态 |
| --- | --- |
| 桌面本地工作台 | 已实现 |
| Claude Code / Codex 桌面运行 | 已实现，但受各 runtime 能力限制 |
| 本地 job 存储与事件日志 | 已在 headless 分支开发，待合入 main |
| `locus run` / `locus jobs` | 已在 headless 分支开发，待合入 main |
| 本地 daemon 队列 | 已在 headless 分支开发，待合入 main |
| 本地 schedule | 已在 headless 分支开发，待合入 main |
| 最小 `locus acp` stdio job 入口 | headless 分支上的实验性能力 |
| Windows packaged 实机 smoke | 未完成 |
| 完整 ACP parity | 未实现 |
| hosted/cloud agents 或 hosted scheduler | 未实现 |
| Codex 与 Claude Code 完整能力对齐 | 未实现 |

## Local-Only 模式

Local-only mode 默认启用。如果某个 dormant compatibility path 被意外触发，它会阻止桌面应用访问上游 hosted services。Hosted auth、subscription checks、remote sandbox/import、hosted voice/TTS fallback、automations、inbox、telemetry 和 updater UI 不属于默认本地优先产品。

如果需要有意测试 hosted/internal services，需要显式关闭：

```bash
LOCUS_LOCAL_ONLY=false bun run dev
# 或
MAIN_VITE_LOCAL_ONLY=false bun run dev
```

用户配置的 AI provider endpoints、Ollama、本地项目、Git、由本地流程发起的 GitHub 操作，以及非上游 hosted services 的外部链接仍然可用。

Local-first 不是 offline-only，也不代表“数据绝不会离开本机”。当你使用 Claude
Code、Codex、配置的 provider、语音转写、MCP tools 或 GitHub workflows 时，prompt、
选中的文件内容、diff、音频、tool context 或 metadata 可能会发送到用户选择的服务或
runtime。

Locus 不是 OS sandbox。terminal、git、filesystem、MCP、runtime tools，以及未来的
computer-control flows，在用户授权或调用后都可能影响本机。部分流程有 project /
worktree-aware 检查，但不能把它描述成完整文件系统隔离。

## 开发

```bash
bun install
bun run claude:download
bun run codex:download
bun run dev
```

常用检查：

```bash
bun run ts:check
bun run build
git diff --check
```

## 打包

```bash
bun run build
bun run package:mac
# 或
bun run package:win
bun run package:linux
```

本地 release 检查：

```bash
bun run release:manifest
bun run release:smoke:mac
```

Packaged macOS app 和 Windows NSIS installer 可以自动检查这个 fork 的 GitHub Releases feed。下载和 restart-to-install 仍由用户在 Settings > About 中手动触发。Windows portable build 和 Linux build 继续通过 GitHub Releases 手动下载。`release:manifest` 会为当前 `*-friend.zip` artifacts 和 electron-builder 默认 ZIP 名称生成 fallback release attachment metadata；生产 updater feed 由 electron-builder publish metadata 生成。

开源源码分发和桌面 installer 分发是两件事。即使签名基础设施还没准备好，也可以先发布 source repo；贡献者可以 clone、检查、运行和本地构建应用，不需要 code-signing certificate。

当前 repo config 没有定义 macOS notarization step。本地或内部 macOS / Windows package 可能是 unsigned 或 ad-hoc signed。在签名配置完成前，任何发布到 GitHub Release 的桌面 artifacts 都应该被标注为 unsigned pre-release/test builds，不要描述成 production-ready automatic updates。更广泛的 public installer distribution 应等到 macOS Developer ID signing、notarization/stapling 和 Windows code signing 配置完成后再做。

## 备注

- Voice transcription 只使用用户提供的 OpenAI API key；默认版本已经移除上游 hosted subscription fallback。Voice key storage 仍是已知 hardening gap；迁移到 main-process secure storage 前，不要把它纳入“所有 API key 都已加密”的广泛声明。
- 新 worktree setup config 保存到 `.locus/worktree.json`。旧的 `.1code/worktree.json` 仍可读取，保证已有项目继续可用。
- 为避免破坏已有本地项目数据，legacy `1code` CLI、`~/Library/Application Support/Agent Code for Me`、`~/.21st/worktrees` 等兼容名称和路径可能仍然存在。
- 部分上游兼容名称仍然保留以避免破坏已有本地项目数据，但不要在没有 OpenSpec proposal 的情况下重新引入 hosted product surfaces。

## License

Apache License 2.0. See [LICENSE](LICENSE).
