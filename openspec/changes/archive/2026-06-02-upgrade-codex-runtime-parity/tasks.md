## 1. Proposal and Scope
- [x] 1.1 Create the OpenSpec proposal, design, and capability delta for Codex runtime parity.
- [x] 1.2 Validate the OpenSpec change strictly.
- [x] 1.3 Get approval before implementing product code.
- [x] 1.4 Confirm dependency boundaries with `add-headless-agent-jobs` so headless jobs can complete with honest degraded/unsupported Codex capabilities.

## 2. Core Safety Parity
- [x] 2.1 Implement Codex hard tool guard through ACP pre-tool interception or a safe Locus-owned tool proxy/wrapper seam.
- [x] 2.2 Implement Codex plan mode enforcement so blocked writes and blocked shell operations are denied before execution.
- [x] 2.3 Implement Codex scope expansion parity so workspace/project boundary crossings stop for approval before execution.
- [x] 2.4 Implement Codex AskUserQuestion parity with normalized pending, result, timeout, and denial events.
- [x] 2.5 Explicitly rescope Codex rollback/fork until durable resume-at/fork session references are available.
- [x] 2.6 Implement Codex MCP auth parity so needs-auth MCP servers are surfaced before starting affected runs.
- [x] 2.7 Implement normalized Codex runtime availability/status states for bundled CLI, ACP runtime, login, provider profile, MCP auth/configuration, and local-only blockers.
- [x] 2.8 Migrate or delegate the existing desktop Codex chat route and ACP transport to the shared Codex runtime enforcement/status path.
- [x] 2.9 Add tests proving Codex core safety capabilities marked `supported` execute through enforcement paths and cannot be bypassed by the desktop chat path.
- [x] 2.10 Run runtime smoke and desktop-path tests covering guarded tool denial, plan mode denial, scope expansion, AskUserQuestion, rollback/fork gating, MCP needs-auth handling, and separated runtime availability states.
- [x] 2.11 Fail closed for desktop Codex guarded and plan-mode runs when ACP permission enforcement cannot be installed.

## 3. Runtime Feature Parity
- [x] 3.1 Implement Codex MCP configuration status/list/global behavior and explicitly keep project-scoped add/remove degraded until Codex exposes a scoped write path.
- [x] 3.2 Implement Codex provider profile and usage metadata parity with the same non-secret renderer summaries as Claude.
- [x] 3.3 Implement Codex attachment parity for supported image, long-text, and file attachment paths.
- [x] 3.4 Explicitly keep runtime plugin executable parity unsupported for Codex until a runtime-native or Locus-owned shared plugin execution layer exists.
- [x] 3.5 Explicitly keep runtime command execution parity unsupported for Codex until a runtime command invocation path exists.
- [x] 3.6 Explicitly rescope runtime workflows out of Codex parity until a Codex-equivalent workflow adapter or shared workflow layer exists.
- [x] 3.7 Keep App Agent/skill parity degraded for Codex until runtime-neutral agent/skill execution is implemented.
- [x] 3.8 Add focused tests proving feature parity capability declarations match real behavior.
- [x] 3.9 Run runtime feature parity smoke and tests covering MCP scope, plugin/command/workflow/App Agent rescope, usage metadata, provider profile display path, and attachments.

## 4. Verification
- [x] 4.1 Run `openspec validate upgrade-codex-runtime-parity --strict --no-interactive`.
- [x] 4.2 Run focused Bun tests for Codex core safety parity and feature parity.
- [x] 4.3 Run focused tests proving unsupported/degraded states are not presented as supported.
- [x] 4.4 Run focused tests proving desktop Codex chat and headless/CLI callers share parity-owned enforcement and runtime status behavior.
- [x] 4.5 Run `bun run ts:check`.
- [x] 4.6 Run `bun run build`.
- [x] 4.7 Record real runtime smoke evidence and desktop-path test evidence for Codex parity behavior.
