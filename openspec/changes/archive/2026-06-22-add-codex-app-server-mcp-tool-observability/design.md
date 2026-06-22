## Context
Claude registry verification already has an observer path that pairs
`tool-input-available` and `tool-output-available` for
`mcp__<server>__<tool>` calls, then writes `verified-local` only for matching
registry fingerprints and non-error output.

Codex app-server is different. Current Locus evidence can query
`mcpServerStatus/list` and can intercept `item/tool/call`, but that server
request is a pre-execution dynamic tool call / approval boundary. It is not
proof that the MCP server executed successfully.

## Goals
- Prove whether Codex app-server exposes a post-execution MCP tool result signal.
- Normalize that signal into Locus runtime events only if it is real and stable.
- Enable `Verified on Codex` only from successful post-execution output tied to
  the installed registry server and config fingerprint.
- Preserve current deferred/unavailable UX when proof is missing.

## Non-Goals
- Do not treat `item/tool/call`, approval prompts, model text, server readiness,
  or `mcpServerStatus/list` alone as a successful MCP tool call.
- Do not call MCP tools from registry browse, preview, install, or default Check.
- Do not broaden Codex registry install to unsafe setup, unresolved auth, or
  unsupported config fields.
- Do not change Claude registry verification semantics except for shared helper
  reuse if needed.

## Decisions
- Decision: Phase 1 is a protocol/runtime probe before implementation.
  - Why: if Codex app-server does not expose post-execution MCP results, Locus
    must keep Codex registry verification deferred.
- Decision: `item/tool/call` remains pre-execution evidence.
  - Why: it proves intent/request visibility, not successful tool execution.
- Decision: Codex verified-local writes require the same registry keying as
  Claude: runtime, server name, entry fingerprint, and config fingerprint.
  - Why: verification is local machine/runtime/config proof, not a registry
    claim or global support label.
- Decision: output success filtering must reject runtime and domain-level error
  markers.
  - Why: an MCP server can return an error payload through a normal output
    channel; that must not become verified usability.

## Risks / Trade-offs
- Codex app-server may not expose a usable post-execution signal. Mitigation:
  record this explicitly and keep Codex registry support deferred.
- App-server protocol shapes may change. Mitigation: keep probe evidence and
  parser tests tied to observed payloads, with fail-closed handling for unknown
  variants.
- Tool output may contain secrets. Mitigation: persist only redacted event
  metadata and verification status; raw protocol captures remain temporary and
  scanned before any evidence summary is committed.

## Migration Plan
1. Probe and document the observed app-server protocol.
2. Add normalized event mapping only for proven post-execution MCP result
   notifications or responses.
3. Add Codex registry verification observer and local state updates.
4. Enable UI/status only after a real Codex app-server runtime proof passes.

## Open Questions
- Does current bundled Codex app-server emit a stable post-execution MCP tool
  result notification for registry/external MCP calls?
- Can the emitted payload preserve a stable call id and full server/tool name
  without relying on model text?
- Can setup-free registry installs to Codex safely materialize all required
  registry fields before this verified path is exposed?
