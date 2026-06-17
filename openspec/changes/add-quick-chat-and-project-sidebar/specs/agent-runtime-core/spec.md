## MODIFIED Requirements

### Requirement: Desktop Runtime Preflight
The runtime core SHALL verify desktop run context before provider, MCP, attachment, or runtime adapter work starts, including both project-backed and folderless quick-chat contexts.

#### Scenario: Project-backed desktop run context is verified
- **WHEN** a desktop Claude or Codex run is requested for a project-backed chat
- **THEN** the runtime core canonicalizes and verifies project, chat, sub-chat, cwd, runtime, mode, provider profile reference, MCP readiness, attachment readiness, and local-only constraints
- **AND** the verified result contains only renderer-safe metadata needed by downstream runtime setup
- **AND** provider work does not start from raw renderer `cwd`, provider config, MCP config, or attachment references

#### Scenario: Folderless quick-chat context is verified
- **WHEN** a desktop Claude or Codex run is requested for a chat with no associated project
- **THEN** the runtime core verifies chat/sub-chat ownership, runtime, provider profile reference, attachment readiness, and local-only constraints
- **AND** the verified result identifies the context as folderless with `project` absent or null
- **AND** the working directory is a main-process-owned app scratch directory rather than a renderer-supplied project path
- **AND** project MCP, project context, worktree, diff, terminal, PR, and guarded-scope workspace features are skipped or unavailable before provider startup

#### Scenario: Preflight blocks unsafe request
- **WHEN** the request contains an unregistered cwd, mismatched project/chat/sub-chat, unsupported attachment, provider profile blocker, MCP needs-auth blocker, local-only violation, or folderless chat carrying project/worktree/PR state
- **THEN** the runtime core rejects or blocks the run before provider work starts
- **AND** the diagnostic is renderer-safe and does not include provider secrets, OAuth tokens, gateway tokens, raw headers, or secret-bearing env values

### Requirement: Desktop Permission Policy
The runtime core SHALL map Locus plan, agent, guarded, and folderless assistant desktop runs through a shared permission policy before runtime adapter startup.

#### Scenario: Policy is resolved for a desktop run
- **WHEN** a Claude or Codex desktop run starts
- **THEN** the runtime core resolves a `PermissionPolicy` from the verified context, requested mode, guarded scope contract, runtime capability state, and local-only state
- **AND** the selected adapter receives the policy rather than independently deriving durable plan, guarded, or assistant semantics inside a route

#### Scenario: Runtime cannot enforce policy
- **WHEN** the selected runtime adapter cannot enforce the required plan-mode, guarded-run, assistant, approval, file, shell, MCP, or unknown-tool policy before execution
- **THEN** the run fails closed or uses an explicitly supported fallback according to policy before provider work starts
- **AND** the capability state remains degraded or unsupported for that adapter until tests prove enforcement

#### Scenario: Plan mode is read-only for workspace side effects
- **WHEN** a desktop Claude or Codex run starts in plan mode
- **THEN** the `PermissionPolicy` disallows project or workspace file writes, side-effecting shell commands, MCP/runtime configuration mutation, and provider configuration writes before execution
- **AND** the app may still persist Locus-owned messages, job rows, semantic events, diagnostics, and session metadata
- **AND** any future Locus-owned artifact write requires an explicit owner, path policy, and tests rather than a route-local `.md` exception

#### Scenario: Claude native permission bypass is considered
- **WHEN** the Claude desktop adapter would use native permission bypass for agent or guarded behavior
- **THEN** the `PermissionPolicy` records the Locus-owned enforcement evidence required before runtime startup
- **AND** the run fails closed or uses native controls when guarded decisions, plan-mode enforcement, diagnostics, and tests cannot prove pre-execution side-effect control

#### Scenario: Assistant policy denies host and project side effects
- **WHEN** a folderless quick chat starts through Claude or Codex
- **THEN** the `PermissionPolicy` resolves to an assistant control level that allows only supported web information tools and Locus-owned persistence
- **AND** file, shell, terminal, MCP/project, runtime/plugin mutation, and unknown tools are denied before execution
- **AND** a runtime that cannot install the assistant pre-tool gate fails closed before provider/tool work starts

### Requirement: Shared Run Request Base
The runtime core SHALL define a shared run request base for fields common to
desktop, CLI, daemon, schedule, protocol, and Local Job API runtime execution.

#### Scenario: Shared request is created
- **WHEN** a runtime run is started from any supported surface
- **THEN** the request includes run identity, runtime ID, mode, cwd, prompt,
  cancellation signal, source or surface, requested capabilities, permission
  policy summary, provider reference metadata, and an event observer
- **AND** the request excludes plaintext provider secrets, OAuth tokens,
  gateway tokens, raw headers, and arbitrary caller-supplied environment values

#### Scenario: Surface-specific context is preserved
- **WHEN** a desktop Workbench run is started
- **THEN** desktop-only context such as chat ID, sub-chat ID, workspace kind,
  optional project ID, MCP readiness, attachment references, session metadata,
  trace observer, and interactive bridges remains in the desktop request extension
- **AND** headless/API callers are not required to fabricate desktop-only fields
- **AND** folderless desktop runs represent the missing project explicitly instead of fabricating a project ID

#### Scenario: Headless job context is preserved
- **WHEN** a CLI, daemon, schedule, protocol, or Local Job API job is started
- **THEN** job/source/consumer/artifact context remains available to the
  headless request extension
- **AND** the run does not claim a visible user interaction channel unless one
  is explicitly provided
