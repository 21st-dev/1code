# Ownership Map

This map records the canonical owner for cross-cutting Locus behavior. Before
changing a listed capability, update the owner or change the owner file itself;
do not add parallel old/new implementations in another route, adapter, transport,
or UI helper.

## Runtime Capability Truth

- Canonical owner: `src/shared/agent-runtime-capabilities.ts`
- Facades: `src/shared/codex-runtime-capabilities.ts`
- Tests: `tests/agent-runtime-capabilities.test.ts`,
  `tests/codex-runtime-capabilities.test.ts`
- Rule: runtime-specific files may expose facades, but must not define a second
  capability ID list or a second manifest truth table.

## Runtime Chat UI Event State

- Canonical owner: `src/renderer/features/agents/lib/runtime-event-state.ts`
- Consumers: `src/renderer/features/agents/lib/ipc-chat-transport.ts`,
  `src/renderer/features/agents/lib/acp-chat-transport.ts`
- Rule: transports may subscribe, normalize, and enqueue runtime chunks, but
  shared atom updates for AskUserQuestion and guarded-run events must go through
  the owner.

## Guard Decisions

- Canonical owner: `src/main/lib/agent-guard/decision.ts`
- Consumers: Claude runtime route, Codex ACP permission handler, headless or job
  adapters that need guarded execution decisions
- Rule: runtime adapters may translate provider-specific permission envelopes,
  but they must not reimplement guarded-run allow/deny logic.

## Scope Contracts And Guard Audit

- Canonical owners: `src/main/lib/agent-guard/contract.ts`,
  `src/main/lib/agent-guard/audit.ts`
- Consumers: runtime routers, permission handlers, desktop UI event state
- Rule: the contract/audit schema and validation belong to the guard package;
  runtime-specific code may only attach runtime context.

## Provider Credentials

- Canonical owners: `src/main/lib/provider-profiles.ts`,
  `src/main/lib/claude/env.ts`, `src/main/lib/codex/provider-env.ts`
- Consumers: runtime startup, status checks, provider profile routes
- Rule: plaintext provider secrets stay in the main process. Renderer code may
  receive status, IDs, labels, and redacted metadata only.

## Claude Desktop Chat Runtime

- Canonical owner: `src/main/lib/trpc/routers/claude.ts` until service
  extraction is completed by an approved OpenSpec change
- Primary SDK surface: `@anthropic-ai/claude-agent-sdk`
- Rule: the bundled Claude Code CLI is an install/runtime asset, not a second
  desktop chat implementation.

## Codex Desktop Chat Runtime

- Canonical owner: `src/main/lib/trpc/routers/codex.ts` until service
  extraction is completed by an approved OpenSpec change
- Current adapter surface: Codex ACP provider integration
- Planned official-interface work: `openspec/changes/refactor-codex-official-runtime-adapter/`
- Rule: `codex exec` remains headless/batch fallback and must not become a
  second desktop chat implementation.

## Headless Agent Runtime

- Canonical owner: `src/main/lib/headless/agent-runtime.ts`
- Runtime adapters: `src/main/lib/headless/adapters/claude-code.ts`,
  `src/main/lib/headless/adapters/codex.ts`
- Rule: headless adapters own batch/job invocation semantics only. They must not
  duplicate desktop chat stream, approval, or UI-state behavior.

## Runtime MCP Configuration

- Canonical owner: runtime router code until service extraction is completed by
  an approved OpenSpec change
- Current files: `src/main/lib/trpc/routers/claude.ts`,
  `src/main/lib/trpc/routers/codex.ts`
- Rule: extraction must move MCP config/status behavior into a named service and
  remove the old route helper/call sites in the same change.

## tRPC Route Boundary

- Canonical owner: the service or shared library named in this map
- Route role: input validation, authorization/status wrapping, and transport
  envelope handling
- Rule: new long-lived business logic should not be added directly to large
  runtime routes unless the route is explicitly listed as the temporary owner.
  When a service is introduced, route-local duplicate logic must be deleted in
  the same commit or guarded by an explicit migration plan.

## OpenSpec Boundary

- Canonical owner: `openspec/specs/`
- Pending changes: `openspec/changes/`
- Rule: architecture shifts, runtime interface migrations, security-sensitive
  changes, and new cross-cutting ownership rules require an OpenSpec change
  before implementation.
