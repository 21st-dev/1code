# Locus 工作台定位与范围切割

语言：[English](locus-workbench-focus.md) | 简体中文

## 稳定定位

Locus 是一个 AI 工作台：底层使用 Claude Code、Codex 等成熟 CLI 的 agent
流程，但模型后端可以切换为官方模型、第三方 API、低成本模型或本地模型。Locus
负责在一个桌面工作区里展示 runtime 能力、provider 兼容性、MCP 状态、工具调用、
文件变化、token/usage 和运行历史。

主产品是用户可见的 workbench。Runtime adapters、provider profiles、gateway routing、
local jobs、daemon、schedules 和 protocol surfaces 都是支撑层，不应该反过来成为产品
定位。

不要把 Locus 的主定位写成 AI OS、通用 workflow orchestrator、local job platform 或
runtime hub。

## 当前底座

当前代码已经有足够底座，不需要继续横向发散：

- Claude Code 和 Codex 已经有 runtime adapter、capability manifest 和 run gate
- local job 层已经支持 `locus run`、`locus jobs`、daemon、schedules、API runs、
  status、events、cancel、retry 和 heartbeat
- provider profile 和 provider gateway 已经能表达第三方或本地模型后端，并避免把
  provider secret 传给 renderer
- Codex desktop 路线比 headless Codex 更接近工作台目标，因为它已经有 provider profile
  binding、ACP/provider setup、MCP integration、streaming、usage 和 session metadata
- headless Codex 现在仍然较薄，因为 `codex exec` 主要还是把 stdout/stderr 粗粒度转成
  events，而不是完整 runtime event stream

下一步不是继续接更多 runtime。下一步是把已经接入的 CLI workflow 做成可理解、可选择、
可诊断、可观察的工作台。

## 当前切片

下一阶段只做：

```text
Codex CLI workflow + provider profile backend + capability display + run trace
```

把范围固定成四个 issue：

1. Runtime Capability Panel
   把现有 capability manifest 展示到 UI，显示 supported、degraded、unsupported、reason
   和 hint。

2. Provider Profile Run Binding
   把 model、provider profile、backend label、protocol 和 gateway kind 绑定到 run
   metadata 和 job history。运行历史应该能说清楚 `Codex + DeepSeek + responses gateway`，
   而不是只写 `Codex`。

3. Codex Workbench Run Trace
   第一阶段优先走现有 desktop ACP 路线，把 provider selection、MCP state、tool/command
   activity、file changes、usage、session ID、duration 和 final state 展示成结构化
   timeline。

4. Headless Parity Later
   `codex exec` 和 process-runner 先作为 fallback 或 batch mode。等 workbench trace
   稳定后，再单独做 headless JSON/JSONL event parser。

Provider diagnostics 和 run preflight 合并进前两个 issue。它们要回答：当前 runtime +
provider profile 组合能不能运行、能不能 streaming、能不能 tool use、能不能加载 MCP、
能不能回传 usage。

## 范围规则

现在只允许推进直接服务当前切片的工作：

- 展示 runtime capability truth
- 把 provider profile 和 model metadata 绑定到真实 run
- 让 Codex workbench execution 可见、可诊断
- 准确记录 run trace、usage、errors、file/tool activity
- provider secrets 留在 main process，renderer 只拿脱敏数据

不属于当前切片的工作先停到 backlog：

- 第 3 个或第 4 个 agent CLI
- Codex workbench 还没成型前继续铺 Claude
- 通用 workflow engine
- AI OS 定位
- computer-use 或 screen-control 功能
- plugin marketplace
- 全模型 benchmark
- 完整 hosted/headless SaaS
- full ACP parity
- durable workflow management

## 活跃 Proposal 切割

`openspec/changes/add-claude-dynamic-workflows-adapter` 保持 proposal-only，并排在这次
范围切割之后。它可以继续作为 Claude-specific adapter proposal 存在，但不是下一阶段主线，
也不能被描述成已经支持。

只有在 Codex Workbench 这条线完成，或者明确重新排序后，才应该实现这个 proposal。

## 文档规则

可以使用：

```text
local-first AI workbench
selectable model backends
runtime capability truth
provider compatibility and diagnostics
MCP state, tool activity, file changes, usage, and run history
Local Job API 作为支撑自动化基础设施
minimal ACP stdio job surface
```

不要作为主定位使用：

```text
AI OS
local job platform
runtime hub
workflow orchestrator
complete ACP server
universal automation platform
computer-control platform
Claude and Codex parity
cloud agent platform
offline-only
fully private
complete filesystem isolation
```
