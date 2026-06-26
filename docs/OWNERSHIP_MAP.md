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

## Runtime Capability Projection

- Canonical owner: `src/main/lib/runtime-capability-projection/`
- Consumers: capability-specific registry owners, runtime home/session
  preparation adapters, Settings runtime availability surfaces
- Rule: projected capability materialization, projection result types,
  per-runtime availability state, projection fingerprints, and non-secret
  diagnostics belong to this owner or to adapters registered by this owner.
  Runtime-specific routes, renderer code, and capability registries must not
  derive a second projection truth table from install state, runtime names, or
  filesystem guesses. Runtime capability class support stays in
  `src/shared/agent-runtime-capabilities.ts`; MCP config read/write and verified
  usability stay with Runtime MCP Config and MCP Registry owners; plugin
  runtime-native activation identity stays with Runtime Plugins.

## Agent Builder And Locus Agents

- Canonical owners:
  - Locus Agent CRUD and prompt-context transformation:
    `src/main/lib/app-agents/`
  - Agent Builder aggregation, import, and projection orchestration:
    `src/main/lib/agent-builder/`
  - Runtime projection state and availability:
    `src/main/lib/runtime-capability-projection/`
- Consumers: Settings or capability-center Agent Builder surfaces, mention
  providers, runtime availability surfaces, runtime-specific projection adapters
- Rule: Locus-managed Agents are the canonical product object for user-created
  reusable personas. Agent Builder may aggregate Locus Agents, runtime-native
  discovered agents, and plugin-provided agents, but it must preserve source,
  owner, mutability, projection mode, and sanitized diagnostics in DTOs.
  Runtime-native `.claude/agents`, future Codex-native subagents, and
  plugin-provided agents must not become editable Locus Agents unless the user
  explicitly imports or duplicates them. Renderer code must not infer Agent
  runtime support from runtime names, file paths, or install state. "Custom
  Agents" must not return as a product-facing category.

## Runtime Chat UI Event State

- Canonical owner: `src/renderer/features/agents/lib/runtime-event-state.ts`
- Consumers: `src/renderer/features/agents/lib/ipc-chat-transport.ts`,
  `src/renderer/features/agents/lib/acp-chat-transport.ts`
- Rule: transports may subscribe, normalize, and enqueue runtime chunks, but
  shared atom updates for AskUserQuestion and guarded-run events must go through
  the owner.

## Renderer Chat Message Model And Hydration

- Canonical model owner: `src/shared/chat-message.ts`
- Persisted-message normalizer owner:
  `src/shared/chat-message-normalizer.ts`
- Consumers: renderer chat store, renderer chat view, chat transports, and
  `src/main/lib/trpc/routers/chats-crud.ts` create-input validation.
- Rule: persisted `sub_chats.messages` JSON must hydrate through the shared
  normalizer and type against the shared canonical message model. Render-derived
  grouping parts may live in the renderable union but must not become persisted
  message schema. The live runtime-event-state path remains owned by
  `runtime-event-state.ts`; main-process message writers may adopt the shared
  type later without introducing a second definition.

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

## Worktree Setup Trust

- Canonical owner: `src/main/lib/git/worktree-setup-trust.ts`
- Consumers: worktree creation, worktree setup config routes, renderer approval
  prompt
- Rule: repository-provided worktree setup commands must not execute until this
  owner has produced or verified an explicit user approval for the current
  project and setup command fingerprint. Routes and renderer code may display
  or submit approval decisions, but must not derive their own trust state or
  start setup command execution directly.

## Desktop Runtime Preflight

- Canonical owner: `src/main/lib/agent-runtime/preflight.ts`
- Consumers: Claude desktop adapter, Codex desktop adapter, desktop job shell,
  runtime diagnostics
- Rule: desktop runtime work must consume verified project, chat, sub-chat, cwd,
  provider, MCP, attachment, and local-only context from preflight before
  provider or adapter startup. Routes must not pass raw renderer `cwd`,
  provider config, MCP config, or attachment references directly to runtime
  startup.

## Runtime Permission Policy

- Canonical owner: `src/main/lib/agent-runtime/permission-policy.ts`
- Consumers: Claude desktop adapter, Codex desktop adapter, guard decision
  service, runtime diagnostics
- Rule: plan, agent, and guarded desktop semantics must be resolved through the
  shared policy owner before runtime startup. Runtime-specific code may map the
  policy to native SDK, ACP, app-server, or CLI controls, but must not derive a
  second durable interpretation of plan mode, guarded scope, or side-effect
  approval.

## Headless Runtime Adapter Selection

- Canonical owner: `src/main/lib/headless/adapter-selector.ts`
- Consumers: `src/main/lib/headless/agent-runtime.ts`, Local Job API job
  runner, headless process adapters, Codex app-server headless wrapper
- Rule: headless/runtime adapter choice, execution profile gating, selected or
  refused diagnostics, fallback reasons, and policy-grant enforcement labels
  belong to the selector. Local Job API request parsing may validate input, but
  must not own a second adapter-selection or policy-grant enforcement table.
  Current Local Job API `policyGrant.scopes` are admission/audit metadata unless
  a later approved scope-enforcement change binds them to adapter permission
  decisions.

## Desktop Runtime Request And Adapter Boundary

- Canonical owners: `src/main/lib/agent-runtime/desktop-run-request.ts`,
  `src/main/lib/agent-runtime/desktop-runner.ts`
- Consumers: Claude desktop runtime, Codex desktop runtime, desktop job shell,
  Workbench trace surfaces
- Rule: desktop runtime adapters receive verified context, permission policy,
  provider binding metadata, MCP readiness, attachment references, trace
  observer, cancellation signal, and session metadata through the desktop run
  request. Routes remain envelope/input surfaces and must delete or gate
  route-local helpers once equivalent adapter-owned behavior exists.

## Runtime Events, Trace, And Redaction

- Canonical owners: `src/main/lib/agent-runtime/runtime-events.ts`,
  `src/main/lib/agent-runtime/redaction.ts`
- Consumers: desktop runtime adapters, `src/main/lib/job-store.ts`, Workbench,
  chat transports
- Rule: runtime streams may emit provider-specific chunks, but persisted job
  events and renderer-visible diagnostics must pass through normalized event
  mapping and redaction first. Raw provider, gateway, MCP, OAuth, header, and
  environment secrets must not be persisted or emitted to renderer state.

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
- Current adapter surface: `src/main/lib/codex/app-server-adapter.ts`
- Current adapter selection owner:
  `src/main/lib/codex/desktop-adapter-selection.ts`
- Rule: `codex.ts` may keep the tRPC stream envelope during service
  extraction, but app-server transport, approval, provider binding,
  attachment, plugin, and controlled-edit behavior belongs under
  `src/main/lib/codex/app-server-*`. `codex exec` remains headless/batch
  fallback and must not become a second desktop chat implementation.

## Headless Agent Runtime

- Canonical owner: `src/main/lib/headless/agent-runtime.ts`
- Runtime adapters: `src/main/lib/headless/adapters/claude-code.ts`,
  `src/main/lib/headless/adapters/codex.ts`
- Rule: headless adapters own batch/job invocation semantics only. They must not
  duplicate desktop chat stream, approval, or UI-state behavior.

## Runtime MCP Configuration

- Canonical owner: `src/main/lib/runtime-mcp-config/`
- Runtime adapters: `src/main/lib/runtime-mcp-config/claude.ts`,
  `src/main/lib/runtime-mcp-config/codex.ts`
- Consumers: runtime routes, startup MCP warmup, and desktop runtime startup
  materialization
- Rule: runtime routes may validate tRPC inputs and map errors, but durable MCP
  listing, status, auth, add/update/remove, refresh/cache, and session
  materialization behavior belongs to the Runtime MCP Config service.

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
