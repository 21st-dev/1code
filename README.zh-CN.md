# Locus

语言：[English](README.md) | 简体中文

Locus 是一个本地优先的桌面 AI 工作台，用多个 agent runtime 操作本地项目。它把
Claude Code、Codex、provider-backed agents、MCP tools、terminal commands、git
workflows、worktrees 和本地 job automation 放在一个可见的桌面环境里。

Locus 是基于 [1Code](https://github.com/21st-dev/1code) 改造的本地优先 runtime hub。
coding 仍然是第一个强场景，但它不只是 coding chat UI。Locus 的目标是让本地 agent
工作可见、可取消、可恢复、可审计，并能被周边本地应用复用。

![Locus 目标本地 agent 平台](docs/assets/locus-agent-platform.zh-CN.svg)

## 为什么需要 Locus

当你希望 agent 工作绑定在本地 project 上，而不是散落在不同 runtime CLI 或 hosted
queue 里，Locus 就有意义。

它提供：

- 面向本地 project、file、terminal、git 和 worktree flows 的桌面工作台
- Claude Code 和 Codex runtime 集成，以及 runtime-specific capability truth
- durable local jobs，支持 status、event logs、取消、重试、heartbeat 和 recovery
- 面向自动化的 headless CLI、daemon、schedules 和 protocol surfaces
- 面向下游工具，例如 career apps 的机器可读 Local Job API v1
- 本地优先的 provider/profile handling，默认移除或隔离上游 hosted surfaces

## 当前状态

| 模块 | 状态 |
| --- | --- |
| 桌面本地工作台 | 已实现 |
| Claude Code / Codex 桌面运行 | 已实现，但受各 runtime 能力限制 |
| 本地 job 存储与事件日志 | 已实现 |
| `locus run` / `locus jobs` | 已实现，并已在 macOS 本地 smoke |
| 本地 daemon 队列 | 已实现，并已在 macOS 本地 smoke |
| 本地 schedule | 已实现，并已在 macOS 本地 smoke |
| `locus api` Local Job API v1 | 已实现，并已在 macOS 本地 smoke |
| 最小 `locus acp` stdio job 入口 | 实验性 |
| Windows packaged 实机 smoke | 未完成 |
| 完整 ACP parity | 未实现 |
| hosted/cloud agents 或 hosted scheduler | 未实现 |
| Codex 与 Claude Code 完整能力对齐 | 未实现 |

平台定位和边界见
[docs/locus-local-agent-platform.zh-CN.md](docs/locus-local-agent-platform.zh-CN.md)。

## 从源码启动

前置依赖：

- Bun
- Python
- macOS 上的 Xcode Command Line Tools

安装并运行：

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

## 使用 Locus

### Desktop Workbench

运行桌面应用，选择本地 repository，然后在 workbench 里查看 agent work、project files、
terminal/git flows、worktrees 和 job history。

### Headless CLI

用 CLI 做一次性本地 run 和 job inspection：

```bash
locus run --runtime codex --mode plan --prompt "Inspect this project"
locus jobs list
locus jobs show <job-id>
locus jobs logs <job-id>
```

开发环境里的 launcher：

```bash
resources/cli/locus
```

打包后的 app 会把 launcher 放在 resources 目录下。

### Local Job API v1

下游本地应用应该使用 `locus api`，而不是 import Locus 源码或直接读取 `agents.db`：

```bash
locus api runtimes list --json
locus api runs create --request request.json --json
locus api runs status <job-id> --json
locus api runs events <job-id> --after 0 --jsonl
locus api runs result <job-id> --json
locus api runs cancel <job-id> --json
locus api runs retry <job-id> --json
```

接入手册：

- [Local Job API v1 Consumer Guide](docs/local-job-api-v1-consumer-guide.md)
- [Local Job API v1 下游接入手册](docs/local-job-api-v1-consumer-guide.zh-CN.md)

## Local-Only 模式

Local-only mode 默认启用。如果某个 dormant compatibility path 被意外触发，它会阻止
桌面应用访问上游 hosted services。Hosted auth、subscription checks、remote
sandbox/import、hosted voice/TTS fallback、automations、inbox、telemetry 和 updater
UI 不属于默认本地优先产品。

如果需要有意测试 hosted 或 internal services，需要显式关闭：

```bash
LOCUS_LOCAL_ONLY=false bun run dev
# 或
MAIN_VITE_LOCAL_ONLY=false bun run dev
```

用户配置的 AI provider endpoints、Ollama、本地项目、Git、由本地流程发起的 GitHub
操作，以及非上游 hosted services 的外部链接仍然可用。

Local-first 不是 offline-only，也不代表“数据绝不会离开本机”。当你使用 Claude Code、
Codex、配置的 provider、语音转写、MCP tools 或 GitHub workflows 时，prompt、选中的
文件内容、diff、音频、tool context 或 metadata 可能会发送到用户选择的服务或 runtime。

Locus 不是 OS sandbox。terminal、git、filesystem、MCP、runtime tools，以及未来的
computer-control flows，在用户授权或调用后都可能影响本机。已支持的防护是 project /
worktree-aware controls，不是完整文件系统隔离。

## 文档

- [本地 agent 平台](docs/locus-local-agent-platform.zh-CN.md)
- [Local Job API v1 下游接入手册](docs/local-job-api-v1-consumer-guide.zh-CN.md)
- [Runtime environment center plan](docs/runtime-environment-center-plan.md)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE)

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

开源源码分发和桌面 installer 分发是两件事。即使签名基础设施还没准备好，也可以先发布
source repo；贡献者可以 clone、检查、运行和本地构建应用，不需要 code-signing
certificate。

当前 repo config 没有定义 macOS notarization step。本地或内部 macOS / Windows package
可能是 unsigned 或 ad-hoc signed。在签名配置完成前，任何发布到 GitHub Release 的桌面
artifacts 都应该被标注为 unsigned pre-release/test builds。更广泛的 public installer
distribution 应等到 macOS Developer ID signing、notarization/stapling 和 Windows code
signing 配置完成后再做。

## 贡献和帮助

提交变更前请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。新能力、breaking changes、
architecture shifts 或 security-sensitive work 应该先走 OpenSpec。

bug、集成问题和变更建议可以通过本 repository 的 issues 或 pull requests 处理。Locus
由这个 fork 维护；上游项目 credit 归属
[21st-dev/1code](https://github.com/21st-dev/1code)。

## 已知边界

- Voice transcription 只使用用户提供的 OpenAI API key；默认版本已经移除上游 hosted
  subscription fallback。Voice key storage 仍是已知 hardening gap；迁移到 main-process
  secure storage 前，不要把它纳入“所有 API key 都已加密”的广泛声明。
- 新 worktree setup config 保存到 `.locus/worktree.json`。旧的 `.1code/worktree.json`
  仍可读取，保证已有项目继续可用。
- 为避免破坏已有本地项目数据，legacy `1code` CLI、
  `~/Library/Application Support/Agent Code for Me`、`~/.21st/worktrees` 等兼容名称和路径
  可能仍然存在。
- 不要在没有 OpenSpec proposal 的情况下重新引入 hosted product surfaces。

## License

Apache License 2.0. See [LICENSE](LICENSE).
