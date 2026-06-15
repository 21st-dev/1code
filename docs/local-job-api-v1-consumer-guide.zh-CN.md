# Local Job API v1 下游接入手册

语言：[English](local-job-api-v1-consumer-guide.md) | 简体中文

这份手册给下游本地应用使用：它们想把 Locus 当作 runtime 层，但不应该 import Locus
源码，也不应该直接读取 `agents.db`。这个合同本身不绑定某一个业务场景，也不绑定某一个
runtime。

v1 的正式入口是机器可读 CLI：

```bash
locus api ...
```

下游集成应该使用 `locus api`。`locus run` 和 `locus jobs` 继续保留给人工使用和兼容脚本。

## 文档参考模型

这份手册参考了几类成熟官方文档的组织方式：

- [GitHub CLI Manual](https://cli.github.com/manual/) 把安装、配置、命令参考和示例分开，
  适合脚本化 CLI。
- [Stripe API Reference](https://docs.stripe.com/api?lang=curl) 把 request、response
  envelope 和 error 都作为集成合同的一部分。
- [Docker CLI Reference](https://docs.docker.com/reference/cli/docker/) 会明确环境变量、
  配置、示例、subcommands 和敏感配置风险。

Locus 这里不是 HTTP API，而是本地 CLI + JSON 合同；手册结构借鉴这些文档，但内容全部
落在 Locus 的真实实现上。

## v1 提供什么

Local Job API v1 允许下游 consumer：

- 列出 runtime capability manifests
- 发起一次 agent run
- 读取 run status
- 读取标准化 event envelopes
- 读取最终 result envelope
- 取消 queued 或 running 的 API job
- 重试 failed、canceled、interrupted 的 API job
- 收集 Locus run-owned metadata artifacts

它不提供：

- HTTP 或 WebSocket server
- hosted queue 或 cloud agent
- 直接写入下游 `final/` artifacts
- 由 consumer 传 provider credentials
- 访问 Locus SQLite 内部结构
- 完整 OS sandbox

## 安装和定位 CLI

打包后的 app 会包含 `locus` launcher。开发环境里，本 repo 使用：

```bash
resources/cli/locus api runtimes list --json
```

macOS packaged app 的 launcher 在 app resources 目录下：

```bash
/Applications/Locus.app/Contents/Resources/cli/locus api runtimes list --json
```

Windows 使用 app resources 目录下的 `locus.cmd` launcher。源码级 shim 行为已有测试覆盖。
Windows packaged 实机 smoke 已明确延期，不要求它阻塞当前源码/macOS 下游接入。

开发 smoke 可以覆盖 headless executable：

```bash
LOCUS_HEADLESS_EXECUTABLE=/path/to/locus-electron-wrapper \
LOCUS_USER_DATA_DIR=/tmp/locus-api-profile \
resources/cli/locus api runtimes list --json
```

生产 consumer 不应该设置 `LOCUS_HEADLESS_EXECUTABLE`。它只用于本地 QA 和 packaging
smoke。

## 命令参考

```bash
locus api runtimes list --json
locus api runs create --request <path|-> --json
locus api runs status <job-id> --json
locus api runs events <job-id> [--after <sequence>] [--follow] --jsonl
locus api runs result <job-id> --json
locus api runs cancel <job-id> --json
locus api runs retry <job-id> --json
```

规则：

- JSON 命令在 stdout 输出可解析 JSON。
- event stream 每行一个 JSON object。
- diagnostics 和 validation errors 写到 stderr。
- `--request -` 表示从 stdin 读取 create request。
- `--after <sequence>` 返回 sequence 大于该值的 events。
- `create` 和 `retry` 是同步执行：命令会在 run 进入 terminal status 后返回。

## 最小接入流程

1. 下游应用创建或定位自己的 package directory。
2. 确保 `project.cwd` 指向 Locus 已注册的本地 project，或该 project 内的子目录。
3. 把 `artifacts.baseDir` 放在 `project.cwd` 下面。
4. 列出 runtime capabilities。
5. 用 `locus api runs create` 创建 run。
6. 用 job ID 读取 `status`、`events` 和 `result`。
7. 下游应用只在自己的用户审核通过后，才提升或复制最终业务 artifacts。

## Runtime Capabilities

创建 job 前先检查 runtime 能力：

```bash
locus api runtimes list --json
```

响应结构：

```json
{
  "apiVersion": "locus.local-job.v1",
  "runtimes": [
    {
      "runtimeId": "codex",
      "capabilities": [
        {
          "id": "planMode",
          "state": "supported",
          "scope": "runtime",
          "reason": "..."
        }
      ]
    }
  ]
}
```

如果下游 workflow 依赖某个能力，就在 create request 的 `runtime.requiredCapabilities`
里声明。Locus 会在 provider work 开始前拒绝 unsupported 或 degraded 的必需能力。

常见 runtime IDs：

- `codex`
- `claude-code`
- `claude`，作为 `claude-code` 的 alias

常见 modes：

- `plan`
- `agent`

Execution profiles：

- 省略 `runtime.executionProfile` 或设为 `batch`：v1 默认行为。能力和权限
  gate 允许时，Codex 使用 `codex exec`，Claude 使用 `claude -p`。
- `policy-grant`：高级、显式 opt-in 的非 batch adapter profile。目前必须提供
  `runtime.policyGrant.scopes`，且这些 scope 在 v1 中只作为准入/审计 metadata；
  它们还不是稳定的 app-server per-scope 强制边界。

## Create Request

通用本地 package 示例：

```json
{
  "apiVersion": "locus.local-job.v1",
  "consumer": {
    "id": "docs-workbench",
    "runExternalId": "package-review-001"
  },
  "project": {
    "cwd": "/Users/alice/LocalPackages/example-package",
    "projectId": null
  },
  "runtime": {
    "id": "codex",
    "requiredCapabilities": ["planMode"]
  },
  "mode": "plan",
  "prompt": {
    "text": "Review this local package and produce a readiness note."
  },
  "input": {
    "contract": "example.local-package.v1",
    "packageDir": "/Users/alice/LocalPackages/example-package",
    "sourceMetadata": "source.json"
  },
  "artifacts": {
    "baseDir": "/Users/alice/LocalPackages/example-package/.locus/runs",
    "writePolicy": "metadata-only"
  }
}
```

执行：

```bash
locus api runs create --request request.json --json
```

或通过 stdin：

```bash
cat request.json | locus api runs create --request - --json
```

## Request 字段

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `apiVersion` | 是 | 必须是 `locus.local-job.v1`。 |
| `consumer.id` | 是 | 下游应用稳定 ID，例如 `docs-workbench`。 |
| `consumer.runExternalId` | 否 | consumer 自己的 run ID，用于关联。 |
| `project.cwd` | 是 | 本次 run 的绝对本地路径。必须存在，并位于 Locus 已注册 project 内。 |
| `project.projectId` | 否 | 可选 Locus project ID。提供后，`cwd` 必须在该 project 内。 |
| `runtime.id` | 是 | `codex`、`claude-code`，或 alias `claude`。 |
| `runtime.requiredCapabilities` | 否 | runtime work 开始前必须满足的 capability IDs。 |
| `runtime.executionProfile` | 否 | `batch` 或 `policy-grant`。默认 `batch`；现有 v1 caller 应该省略，除非需要显式 gated profile。 |
| `runtime.policyGrant.scopes` | 当 `runtime.executionProfile` 为 `policy-grant` 时必填 | 用于准入/审计的 bounded scope labels。v1 中这些 labels 还不会绑定 app-server permission decisions。 |
| `runtime.policyGrant.canDecideAutomatically` | 否 | 可选 boolean。若在 `policy-grant` 中为 false，Locus 会 fail closed，因为没有可见用户。 |
| `mode` | 是 | `plan` 或 `agent`。 |
| `prompt.text` | 是 | prompt 文本，最大 256 KiB。 |
| `input` | 否 | consumer 自己的结构化 metadata，不能包含 secrets。 |
| `artifacts.baseDir` | 否 | Locus run metadata 的绝对目录，必须在 `project.cwd` 内。 |
| `artifacts.writePolicy` | 否 | `metadata-only` 或 `proposal-only`，默认 `metadata-only`。 |

ID 限制：

- `consumer.id`：1-80 个字符，可用字母、数字、`.`、`_`、`:`、`-`
- `consumer.runExternalId`：1-160 个字符，同样字符集
- request JSON：最大 1 MiB

## Artifact Contract

如果设置了 `artifacts.baseDir`，Locus 会把 run-owned metadata 写到：

```text
<artifacts.baseDir>/<jobId>/
  request.json
  events.jsonl
  result.json
  artifacts.json
```

对通用本地 package，推荐结构：

```text
example-package/
  source.json
  source.md
  notes.md
  drafts/
  final/
  .locus/
    runs/
      <jobId>/
        request.json
        events.jsonl
        result.json
        artifacts.json
```

规则：

- `artifacts.baseDir` 必须是绝对路径。
- 它必须在 `project.cwd` 下面。
- 它不能在 `.git` 里。
- 它不能在名为 `final` 的路径组件里。
- 如果它已经存在，必须是目录。
- 已存在路径组件不能通过 symlink 逃逸 project。
- v1 中 Locus 不会把输出提升到下游 `final/` 目录。

`final/` 只用于下游应用或用户审核批准后的材料。

## Create Response

`create` 返回一个 v1 envelope，包含 serialized job 和 final result：

```json
{
  "apiVersion": "locus.local-job.v1",
  "job": {
    "id": "mpzcxv3xp2ji1fl2",
    "source": "api",
    "runtime": "codex",
    "mode": "plan",
    "status": "succeeded",
    "apiConsumerId": "docs-workbench",
    "apiConsumerRunId": "package-review-001",
    "artifactManifestPath": "/.../.locus/runs/mpzcxv3xp2ji1fl2/artifacts.json"
  },
  "result": {
    "apiVersion": "locus.local-job.v1",
    "jobId": "mpzcxv3xp2ji1fl2",
    "status": "succeeded",
    "runtime": "codex",
    "mode": "plan",
    "consumer": {
      "id": "docs-workbench",
      "runExternalId": "package-review-001"
    },
    "artifactManifestPath": "/.../.locus/runs/mpzcxv3xp2ji1fl2/artifacts.json",
    "artifacts": [],
    "diagnostics": [],
    "result": {}
  }
}
```

实际 `job` object 可能包含更多 renderer-safe 字段。consumer 只应该依赖本手册列出的
字段，并忽略未知字段。

## Status

```bash
locus api runs status <job-id> --json
```

响应：

```json
{
  "apiVersion": "locus.local-job.v1",
  "job": {
    "id": "mpzcxv3xp2ji1fl2",
    "source": "api",
    "status": "succeeded"
  }
}
```

只有 `source=api` 的 job 能通过 `locus api runs ...` 读取。

## Events

```bash
locus api runs events <job-id> --after 0 --jsonl
```

每行是一个 event envelope：

```json
{"apiVersion":"locus.local-job.v1","jobId":"mpzcxv3xp2ji1fl2","sequence":1,"type":"job_created","createdAt":"2026-06-04T10:33:00.000Z","payload":{}}
```

稳定 v1 event types：

- `job_created`
- `job_started`
- `assistant_delta`
- `reasoning_delta`
- `tool_started`
- `tool_delta`
- `tool_finished`
- `artifact_created`
- `status`
- `error`
- `completed`

断点续读逻辑：

```text
lastSequence = 0
用 --after lastSequence 读取 events
逐个处理 event:
  lastSequence = event.sequence
直到 job terminal
```

如果想让命令等待新 events，使用 `--follow`。job 进入 terminal status 后，follow 命令会退出。

## Result

```bash
locus api runs result <job-id> --json
```

响应：

```json
{
  "apiVersion": "locus.local-job.v1",
  "jobId": "mpzcxv3xp2ji1fl2",
  "status": "succeeded",
  "runtime": "codex",
  "mode": "plan",
  "consumer": {
    "id": "docs-workbench",
    "runExternalId": "package-review-001"
  },
  "artifactManifestPath": "/.../.locus/runs/mpzcxv3xp2ji1fl2/artifacts.json",
  "artifacts": [
    {
      "role": "request",
      "path": "/.../request.json",
      "sha256": "...",
      "contentType": "application/json",
      "sizeBytes": 1234
    }
  ],
  "diagnostics": [],
  "result": {
    "finalMessage": "..."
  }
}
```

对非 success 状态，先读取 `diagnostics`，再决定给用户展示什么。

## Cancel

```bash
locus api runs cancel <job-id> --json
```

Cancel 只作用于 API jobs。queued API job 会立即完成为 `canceled`。running job 会收到
持久化 cancel request，由 runtime runner 观察并处理。

## Retry

```bash
locus api runs retry <job-id> --json
```

只有以下 terminal retryable 状态的 API job 可以 retry：

- `failed`
- `canceled`
- `interrupted`

`retry` 会创建新的 API job，通过 `retryOfJobId` 指向原 job，准备新的 artifact run
directory，同步执行，并返回和 `create` 相同的 envelope 结构。

不要对 API job 使用 `locus jobs retry`。那个命令保留给非 API 的人工 job flow。

## Exit Codes

| Code | 含义 |
| --- | --- |
| `0` | 成功。 |
| `1` | Runtime 执行失败。 |
| `2` | 参数无效，或 request/artifact contract 无效。 |
| `3` | runtime、mode 或 required capability 不支持。 |
| `4` | 缺少 runtime credentials。 |
| `5` | Job 被取消。 |
| `6` | local-only guard 阻止执行。 |
| `7` | `project.cwd` 无效或未注册。 |
| `8` | 内部错误。 |

consumer 应该先看 exit code 和 stderr，再解析 stdout。Diagnostics 写到 stderr。

## 安全规则

不要在 request 里放这些内容：

- provider API keys
- OAuth tokens
- `Authorization` headers
- raw environment variables
- passwords
- private keys
- credential file contents

Locus 会通过自己的 main-process provider/runtime setup 路径解析 credentials。consumer 只
传业务上下文，不传 provider secrets。

secret-like key 或 value 会在 provider work 开始前被拒绝。

## 接入示例

推荐的下游应用流程：

```text
1. 用户创建或审核一个本地工作 package。
2. 下游应用创建本地 package：

   packages/<example-package>/
     source.json
     source.md
     notes.md
     drafts/
     final/

3. 下游应用写 request.json：
   project.cwd = packages/<example-package>
   input.packageDir = packages/<example-package>
   artifacts.baseDir = packages/<example-package>/.locus/runs

4. 下游应用执行：
   locus api runs create --request request.json --json

5. 下游应用读取 result/artifacts/events。
6. 下游应用给用户展示 proposed output。
7. 只有用户批准后，下游应用才写入或提升 final artifacts。
```

最小 shell 示例：

```bash
PACKAGE_DIR="$HOME/LocalPackages/example-package"
mkdir -p "$PACKAGE_DIR/.locus/runs" "$PACKAGE_DIR/drafts" "$PACKAGE_DIR/final"

cat > "$PACKAGE_DIR/request.json" <<EOF
{
  "apiVersion": "locus.local-job.v1",
  "consumer": {
    "id": "docs-workbench",
    "runExternalId": "example-package-001"
  },
  "project": {
    "cwd": "$PACKAGE_DIR"
  },
  "runtime": {
    "id": "codex",
    "requiredCapabilities": ["planMode"]
  },
  "mode": "plan",
  "prompt": {
    "text": "Review this local package and identify missing source material."
  },
  "input": {
    "contract": "example.local-package.v1",
    "packageDir": "$PACKAGE_DIR"
  },
  "artifacts": {
    "baseDir": "$PACKAGE_DIR/.locus/runs",
    "writePolicy": "metadata-only"
  }
}
EOF

locus api runs create --request "$PACKAGE_DIR/request.json" --json
```

`PACKAGE_DIR` 必须位于 Locus 已注册 project 里面。

## Troubleshooting

| 现象 | 常见原因 | 处理方式 |
| --- | --- | --- |
| `project.cwd must be inside a registered project` | package 目录未注册，或不在 Locus 已注册 project 内。 | 在 Locus 打开/注册该 project，或传入已注册 project 内的 cwd。 |
| `artifacts.baseDir must be inside project.cwd` | artifact base 在 run cwd 外面。 | 使用 `<project.cwd>/.locus/runs`。 |
| `artifacts.baseDir cannot be inside a final artifact directory` | Locus 拒绝把 metadata 写入下游 final artifacts。 | 把 API metadata 放到 `.locus/runs`。 |
| `Unsupported runtime.id` | runtime ID 不被识别。 | 使用 `codex`、`claude-code` 或 `claude`。 |
| `Unsupported required capability` | capability ID 不存在。 | 先看 `locus api runtimes list --json`。 |
| exit `4` | runtime credentials 缺失。 | 在 Locus 里配置 runtime，不要通过 request 传 credentials。 |
| JSON parse 失败 | 命令可能失败并把 diagnostics 写到了 stderr。 | 先检查 exit code 和 stderr，再解析 stdout。 |

## 稳定性合同

v1 稳定：

- `locus api` 下的命令名
- `apiVersion: locus.local-job.v1`
- 本手册列出的 request fields
- 本手册列出的 response envelopes
- event envelope 字段
- run metadata artifact 文件名
- secret rejection boundary

v1 不稳定：

- serialized `job` 里的额外字段
- 内部 SQLite schema
- v1 envelope 之外的内部 event payload 细节
- Workbench 渲染细节
- `locus run` 和 `locus jobs` 的人工 CLI 格式

consumer 应该只依赖本手册列出的 v1 字段，并忽略未知 JSON 字段。
