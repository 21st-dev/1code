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

- The local shell does not currently resolve `qwen` (`command -v qwen` returned
  no path), so no real `qwen --acp` launch, auth, file edit, or real Qwen MCP
  run was performed.
- No Qwen auth config was written. The spike stayed on the read-only BYO status
  path to avoid mutating the user's real `~/.qwen` state.
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
  mapping, and MCP passthrough.
- If Qwen exposes stable permission request shapes beyond
  `session/request_permission`, map them into the shared guard owner before
  promoting hard-tool-guard or plan-mode capability claims.
- Keep `qwen serve` / HTTP `/acp` out of this change. A later Kun or Qwen daemon
  proposal should define daemon lifecycle, auth, token handling, and
  remote-stream semantics explicitly.
