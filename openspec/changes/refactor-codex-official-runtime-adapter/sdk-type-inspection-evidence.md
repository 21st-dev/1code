# Codex SDK Type Inspection Evidence

Date: 2026-06-12

Provider calls: none. This evidence uses npm package metadata, unpacked package
types/implementation, local bundled CLI help/version output, and official OpenAI
Codex documentation.

## Runtime Inspected

- Repo dependency state: `@openai/codex-sdk` and `@openai/codex` are not present
  in `package.json` or `bun.lock`.
- Repo bundled binary: `resources/bin/darwin-arm64/codex`
- Repo bundled version: `codex-cli 0.134.0`
- PATH binary observed separately: `/opt/homebrew/bin/codex` is
  `codex-cli 0.136.0-alpha.1`; do not use PATH as bundled-version truth.
- Current npm package inspected: `@openai/codex-sdk@0.139.0`
- Current npm runtime dependency inspected: `@openai/codex@0.139.0`

## Commands Run

```bash
npm view @openai/codex-sdk version dist.tarball dependencies peerDependencies optionalDependencies bin main module types exports --json
npm view @openai/codex version dist.tarball dependencies optionalDependencies bin main types exports --json
npm pack @openai/codex-sdk@0.139.0 --pack-destination /tmp/locus-codex-sdk-inspect.*
npm pack @openai/codex@0.139.0 --pack-destination /tmp/locus-codex-cli-inspect.*
tar -xOf /tmp/locus-codex-sdk-inspect.*/openai-codex-sdk-0.139.0.tgz package/package.json
tar -xOf /tmp/locus-codex-sdk-inspect.*/openai-codex-sdk-0.139.0.tgz package/README.md
tar -xOf /tmp/locus-codex-sdk-inspect.*/openai-codex-sdk-0.139.0.tgz package/dist/index.d.ts
tar -xOf /tmp/locus-codex-sdk-inspect.*/openai-codex-sdk-0.139.0.tgz package/dist/index.js
tar -xOf /tmp/locus-codex-cli-inspect.*/openai-codex-0.139.0.tgz package/package.json
tar -xOf /tmp/locus-codex-cli-inspect.*/openai-codex-0.139.0.tgz package/bin/codex.js
resources/bin/darwin-arm64/codex --version
resources/bin/darwin-arm64/codex app-server --help
codex --version
```

Official docs checked:

- <https://developers.openai.com/codex/sdk>
- <https://developers.openai.com/codex/app-server>

## Package Metadata Findings

- `@openai/codex-sdk@0.139.0` is ESM-only, requires Node.js `>=18`, and exports
  only `.` with `dist/index.js` and `dist/index.d.ts`.
- The SDK has one runtime dependency: `@openai/codex@0.139.0`.
- `@openai/codex@0.139.0` is the CLI package and installs optional native
  runtime packages for Linux, macOS, and Windows on x64/arm64.
- The SDK version currently available from npm is ahead of the repo bundled
  `codex-cli 0.134.0`. Adding the SDK as-is would introduce a second pinned
  Codex CLI/runtime version unless the bundle strategy is explicitly aligned.

## Type Surface Findings

The TypeScript SDK surface is intentionally small:

- `Codex` constructor options:
  - `codexPathOverride?: string`
  - `baseUrl?: string`
  - `apiKey?: string`
  - `config?: CodexConfigObject`
  - `env?: Record<string, string>`
- Thread lifecycle:
  - `startThread(options?: ThreadOptions): Thread`
  - `resumeThread(id: string, options?: ThreadOptions): Thread`
- Turn APIs:
  - `Thread.run(input, turnOptions?): Promise<Turn>`
  - `Thread.runStreamed(input, turnOptions?): Promise<{ events: AsyncGenerator<ThreadEvent> }>`
- Turn options:
  - `outputSchema?: unknown`
  - `signal?: AbortSignal`
- Thread options:
  - `model`, `sandboxMode`, `workingDirectory`, `skipGitRepoCheck`
  - `modelReasoningEffort`, `networkAccessEnabled`
  - `webSearchMode`, `webSearchEnabled`
  - `approvalPolicy`
  - `additionalDirectories`
- User input:
  - `string`
  - `{ type: "text"; text: string }`
  - `{ type: "local_image"; path: string }`
- Stream events:
  - `thread.started`
  - `turn.started`
  - `turn.completed`
  - `turn.failed`
  - `item.started`
  - `item.updated`
  - `item.completed`
  - `error`
- Item types:
  - `agent_message`
  - `reasoning`
  - `command_execution`
  - `file_change`
  - `mcp_tool_call`
  - `web_search`
  - `todo_list`
  - `error`

The SDK types do not expose app-server request/response hooks, pre-execution
approval callbacks, AskUserQuestion request/response handling, MCP startup/auth
status APIs, fork/rollback APIs, or app-server schema negotiation.

## Implementation Findings

The inspected TypeScript SDK implementation wraps `codex exec
--experimental-json`, not `codex app-server`.

Relevant implementation behavior:

- `runStreamed()` normalizes SDK input into a prompt string plus `--image`
  arguments for `local_image` entries.
- `outputSchema` is written to a temporary JSON file and passed through
  `--output-schema`.
- `baseUrl` becomes a CLI config override:
  `--config openai_base_url=...`.
- `config` is flattened into repeated `--config key=value` flags.
- `approvalPolicy` becomes `--config approval_policy="..."`.
- `sandboxMode` becomes `--sandbox ...`.
- `workingDirectory` becomes `--cd ...`.
- `additionalDirectories` become repeated `--add-dir ...`.
- `resumeThread(id)` maps to `codex exec --experimental-json resume <id>`.
- `signal` is passed to `child_process.spawn`.
- If `env` is not provided, the SDK copies `process.env`.
- If `env` is provided, the SDK starts from that object, then adds SDK-required
  values.
- If `apiKey` is provided, the SDK injects `CODEX_API_KEY`.
- The SDK sets `CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_sdk_ts` unless already
  present.

## Locus Decision Impact

The SDK remains unsuitable as the default desktop/chat adapter target for this
change. It is a useful internal automation/tooling candidate, but the current
type and implementation surface is closer to a typed wrapper around `codex exec`
than to the rich-client app-server protocol Locus needs.

Implications:

- Keep `codex app-server` as the desktop/chat target candidate.
- Do not add `@openai/codex-sdk` to product dependencies without an approved
  internal automation/tooling use case.
- If the SDK is added later, force `codexPathOverride` or align bundled runtime
  versions so Locus does not ship two independent Codex runtimes.
- If the SDK is used later, provide an explicit main-process env allowlist.
  Never rely on the SDK's default `process.env` inheritance in Electron.
- Treat `apiKey`, `baseUrl`, and broad `config` as main-process-only adapter
  inputs. Do not expose them to renderer payloads.
- Canonicalize `workingDirectory`, `additionalDirectories`, and `local_image`
  paths through the runtime control layer before passing them to SDK APIs.
- Do not mark AskUserQuestion, MCP readiness/auth, guarded-run pre-execution
  enforcement, fork, or rollback as SDK-supported based on this type surface.

## Open Review Item

The current npm SDK/runtime pair is `0.139.0`, while Locus currently bundles
`codex-cli 0.134.0`. Before any SDK dependency is added, decide whether Locus
should upgrade the bundled Codex runtime first, pin SDK to a bundle-compatible
version if one exists, or use `codexPathOverride` for internal tooling only.
