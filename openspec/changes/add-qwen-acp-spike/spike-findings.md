# Qwen ACP Spike Findings

## Implemented

- `qwen-code` is a flag-gated desktop runtime. Default manifest and non-desktop
  contract surfaces remain Claude Code + Codex only.
- Non-desktop schemas and parsers consume `CONTRACT_RUNTIME_IDS`, so Qwen cannot
  enter Local Job API, schedules, headless jobs, or `locus acp` by accident.
- Desktop Qwen runs enter through `agentRuntime.chat.subscribe`, then delegate to
  desktop preflight, permission policy, desktop job persistence, redaction,
  stream-event mapping, and a `qwen-acp-client` desktop adapter.
- The Qwen ACP adapter launches `qwen --acp`, sends `initialize`, creates an ACP
  session, sends `session/prompt`, maps session updates, handles process errors,
  redacts stderr, and closes the transport on cancel.
- Qwen ACP `session/request_permission` fails closed. The adapter selects a
  reject option when Qwen provides one, otherwise returns `cancelled`, and emits
  the existing `observed-tool-decision` trace path plus a runtime-status
  diagnostic.
- Renderer changes are limited to Qwen edge selection: provider metadata,
  Qwen chat transport, Qwen option in project new-chat when the manifest is
  visible, Qwen static runtime label, and Qwen image attachment blocking.

## Not Verified Locally

- The default local shell still does not resolve `qwen` (`command -v qwen`
  returned no path), but an isolated npm-prefix install of
  `@qwen-code/qwen-code` launched Qwen Code `0.19.1`.
- `qwen --acp` initialize was verified with an isolated HOME. The response
  included `agentInfo.name = qwen-code`, `agentInfo.version = 0.19.1`,
  `protocolVersion = 1`, and auth method `openai` with required
  `--auth-type=openai` args.
- Direct ACP `session/new` with a fresh HOME and no real auth returns a
  structured `Authentication required` protocol error instead of hanging.
- Direct ACP `session/new` with placeholder `OPENAI_API_KEY` but without
  `--auth-type=openai` still returns `Authentication required`; with
  `--auth-type=openai`, Qwen advances to session creation. This is why Locus now
  supports a non-secret `LOCUS_QWEN_CODE_AUTH_TYPE=openai` environment selector
  for headless smoke.
- Reusing the ignored local `.env.local` `OPENAI_API_KEY`, plus
  `OPENAI_BASE_URL=https://api.openai.com/v1`,
  `LOCUS_QWEN_CODE_AUTH_TYPE=openai`, and
  `LOCUS_QWEN_CODE_MODEL=gpt-4o-mini`, direct ACP completed an authenticated
  non-interactive prompt and returned `qwen-smoke-ok`.
- The Locus Qwen adapter completed a live stream (`status = succeeded`, session
  id present, 11 chunks, 12 trace events, one completed event), a mid-run cancel
  (`status = canceled`, `job_canceled`, no residual Qwen process), and a forced
  missing-auth error mapping (`status = failed`, `qwen_acp_failed`, no hang).
- A live edit request produced a Qwen permission request and Locus fail-closed
  denial. The target file remained unchanged. This proves conservative blocking,
  not user-facing allow/edit support.
- No Qwen auth config was written. The spike avoided mutating the user's real
  `~/.qwen` state.
- No real Qwen MCP run was performed.
- MCP config passthrough is implemented in the ACP `session/new` payload, but
  Qwen's accepted shape was not verified against a live Qwen runtime.
- Permission allow/approval UI is intentionally not claimed as complete. The
  spike proves fail-closed request handling and trace persistence; real allow
  decisions remain degraded in the manifest.
- When Qwen provides no reject permission option, the adapter returns ACP
  `cancelled`. That is the conservative fail-closed fallback, but live smoke
  must confirm whether Qwen treats it as skipping only the tool call or ending
  the whole turn.

## Follow-up

- Install Qwen in an isolated smoke profile, record the exact `qwen` version,
  and verify launch, streaming, file edit, permission denial, cancel, error
  mapping, and MCP passthrough using `qwen-acp-smoke-runbook.md`.
- If Qwen exposes stable permission request shapes beyond
  `session/request_permission`, map them into the shared guard owner before
  promoting hard-tool-guard or plan-mode capability claims.
- Keep `qwen serve` / HTTP `/acp` out of this change. A later Kun or Qwen daemon
  proposal should define daemon lifecycle, auth, token handling, and
  remote-stream semantics explicitly.
