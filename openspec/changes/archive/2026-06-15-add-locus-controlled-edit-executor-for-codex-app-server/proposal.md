# Change: Add Locus-controlled edit executor for Codex app-server

## Why
Codex app-server can run plan and no-guard UI flows, and guarded denial is
fail-closed, but earlier real UI dogfood did not prove productive guarded file
edits. The current bounded shell approval path is too narrow for real model
behavior, while widening shell parsing would weaken the fail-closed safety
boundary.

Locus needs a controlled edit layer where Codex proposes structured edits and
Locus owns scope validation, diff presentation, user approval, and filesystem
writes.

## What Changes
- Add a probe-first design for a `locus_edit` MCP tool exposed only to Codex
  app-server guarded runs.
- Prove whether the model adopts `locus_edit` when guarded shell writes are
  denied before implementing a real executor.
- Classify adoption evidence by auth/provider path and prompt strength. Treat
  explicit tool-name prompting as a diagnostic-only signal rather than proof of
  product adoption for that path.
- Proceed only for paths with `zero-prompt` or `light-hint` adoption proof.
  Current evidence proves direct ChatGPT app-server light-hint adoption. The
  provider-profile gateway path was initially degraded because it dropped
  Responses `type:"namespace"` tools, then became eligible after gateway
  namespace-tool translation was fixed and live provider-profile smoke proved
  the tool call and productive controlled edit.
- If adoption is proven, implement a Locus-owned controlled edit executor using
  app-server native `dynamicTools` / `item/tool/call`, so the call returns to
  the desktop adapter instead of a write-capable MCP subprocess. The executor
  validates paths against the guarded scope contract, renders a diff, requires
  explicit user approval, and writes files from the main process.
- Upgrade Codex app-server guarded edit capability per auth context only after
  both adoption and productive controlled-edit smoke pass for that path.
  Capability truth remains auth-context aware: direct/app-managed and
  provider-profile gateway contexts are supported after proof; unknown
  app-server contexts stay degraded.
- Add a gateway tool-payload trace diagnostic so future provider-profile smoke
  can compare incoming app-server payloads with forwarded upstream payloads
  without logging prompts, provider tokens, or gateway tokens.
- Scrub Locus-injected Codex app-server secret env entries from production
  `CODEX_HOME/shell_snapshots` before app-server startup and after shutdown, so
  provider-profile gateway tokens and app-managed `CODEX_API_KEY` values are not
  left in Codex shell snapshot files.

## Impact
- Affected specs:
  - `agent-scope-contracts`
  - `agent-runtime-capabilities`
- Affected code after approval:
  - Codex app-server dynamic tool configuration/startup
  - guarded scope contract enforcement
  - runtime event mapping and pending approval UI
  - main-process filesystem write owner for controlled edits
  - Codex runtime capability facade
