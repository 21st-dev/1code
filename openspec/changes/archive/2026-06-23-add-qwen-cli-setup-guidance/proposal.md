# Change: Qwen CLI setup guidance

## Why

The Qwen ACP spike currently assumes a BYO local `qwen` CLI. If the desktop app
cannot resolve that executable, Qwen fails only when a run starts, and users have
no in-app explanation for installing Qwen, authenticating with `/auth`, or fixing
macOS GUI `PATH` differences.

This follow-up keeps the BYO model but makes it product-usable: detect local
Qwen CLI availability, show concise setup guidance, and let users provide an
explicit executable path. It deliberately does not become managed runtime
download, Provider Profile binding, or Qwen auth/config writing.

This is product UX, not the shortest path to live smoke. To unblock the current
developer smoke, manually installing Qwen Code CLI is sufficient. Implement this
change only when Locus wants an in-app BYO Qwen setup experience for users.

## What Changes

- Add a renderer-safe Qwen CLI setup/status surface behind the existing Qwen
  runtime flag.
- Resolve Qwen executable availability in the main process:
  - explicit user-provided executable path first
  - fallback PATH discovery for `qwen`
  - version probe when executable status is valid
- Persist only a non-secret executable path override; do not persist provider
  credentials, API keys, raw env, or Qwen settings content.
- Accept executable overrides only from the local Settings UI after main-process
  validation. Reject executable path changes from Local Job API, ACP/protocol
  input, deep links, project config, imported files, or unverified renderer
  payloads.
- Require executable overrides to be absolute local file paths. PATH discovery
  must ignore the active project/cwd, repository paths, empty entries, and `.` so
  a checked-out repository cannot shadow `qwen` with `./qwen`.
- Use the resolved executable path when starting the Qwen ACP adapter.
- Preserve the Qwen ACP spawn contract: spawn the resolved executable directly
  with fixed args `["--acp"]`, `shell: false`, and no command-string parsing.
- Show setup guidance in Settings and Qwen runtime selection surfaces:
  install Qwen Code CLI, run `qwen`, use `/auth`, then retry detection.
- Disable or block Qwen starts when the CLI is missing, invalid, or not
  executable, with a clear remediation hint.

## Non-Goals

- No automatic install, `npm install`, `curl | bash`, Homebrew, or updater flow.
- No managed Qwen runtime download/cache/checksum/signature system.
- No Provider Profile binding or gateway injection into Qwen.
- No writes to the user's real `~/.qwen` or Qwen auth config.
- No Local Job API, ACP/protocol, deep link, project config, or imported file
  path may set or override the Qwen executable.
- No shell command string, PATH-relative override, argument splitting, or
  user-configurable ACP args.
- No live Qwen smoke claim; this change only prepares users to run the BYO smoke.

## Impact

- OpenSpec delta: `qwen-cli-setup-guidance` (new).
- Depends on the active `add-qwen-acp-spike` change.
- Related owner/spec surfaces:
  `agent-runtime-capabilities`, `agent-runtime-core`,
  `provider-diagnostics`, `provider-routing-ux`, and
  `architecture-ownership`.
- Affected code likely includes:
  - `src/main/lib/qwen/` for Qwen CLI status/executable resolution
  - `src/main/lib/runtime-executable.ts` for reusable executable status
  - `src/main/lib/trpc/routers/agent-runtime.ts` for setup/status endpoints
  - `src/main/lib/qwen/qwen-acp-client.ts` startup executable wiring
  - `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  - `src/renderer/features/agents/main/new-chat-form.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - targeted tests for status, redaction, path validation, and UI source guards
