## ADDED Requirements

### Requirement: Codex App-Server Desktop Adapter Decision Gate
The system SHALL require a documented decision matrix before replacing the current ACP Codex desktop/chat adapter with the app-server target or enabling any migration fallback.

#### Scenario: App-server adapter work starts
- **WHEN** implementation begins for a Codex app-server desktop/chat migration
- **THEN** the change records a matrix comparing the current ACP adapter, `@openai/codex-sdk`, and `codex app-server`
- **AND** the matrix covers provider-profile binding, MCP, approvals, AskUserQuestion, attachments, streaming, usage/context metadata, session resume/fork/rollback, cancellation, diagnostics, and local-only behavior
- **AND** `codex app-server` is treated as the desktop/chat target unless the matrix explicitly records a blocking gap and approved rescope
- **AND** `@openai/codex-sdk` is not selected as the desktop/chat default solely because it has an official package name

#### Scenario: ACP remains in temporary use
- **WHEN** Locus keeps the ACP-based Codex adapter during the app-server migration
- **THEN** runtime status and documentation identify ACP as the `temporary-compat` adapter
- **AND** Locus does not describe ACP as the long-term official OpenAI integration surface
- **AND** the fallback reason, default-disable condition, and removal condition are recorded in non-secret diagnostics or implementation notes

### Requirement: Codex App-Server Behavior Preservation
The system SHALL preserve existing Codex desktop/chat safety and runtime behavior when migrating to app-server, or explicitly rescope unavailable behavior before enabling app-server by default.

#### Scenario: App-server is enabled for desktop chat
- **WHEN** the Codex app-server adapter handles a desktop chat run
- **THEN** provider-profile binding, MCP readiness, plan-mode enforcement, guarded-run permission handling, AskUserQuestion, supported attachments, streaming output, usage/session metadata, and cancellation are preserved where previously supported
- **AND** unsupported or degraded behavior is represented through the Codex capability manifest before provider work starts
- **AND** tests cover each capability changed to or kept as `supported`

#### Scenario: App-server lacks a required safety primitive
- **WHEN** the Codex app-server adapter cannot install approval, permission, plan-mode, or guarded-run enforcement before execution
- **THEN** guarded or plan-mode Codex runs fail closed or fall back to a supported adapter according to explicit policy
- **AND** the system emits a renderer-safe unsupported-capability or fallback diagnostic
- **AND** the capability is not marked `supported` for that adapter

### Requirement: Codex App-Server Pre-Execution Safety
The system SHALL prove that the Codex app-server adapter can enforce Locus safety decisions before tool, shell, file, or MCP side effects occur.

#### Scenario: Permission interception is unavailable
- **WHEN** a Codex run requires plan-mode or guarded-run enforcement
- **AND** the app-server adapter does not expose a verified pre-execution permission or approval callback
- **THEN** the run fails closed before provider work starts or uses an explicitly supported fallback adapter
- **AND** the runtime capability state remains `degraded` or `unsupported` for that adapter

#### Scenario: Permission interception is installed late
- **WHEN** adapter startup cannot prove the permission or approval callback is installed before the first model/tool turn
- **THEN** the run fails before the first tool request can execute
- **AND** the diagnostic explains the adapter safety setup failure without exposing secrets

### Requirement: Codex Programmatic Surface Boundary
The system SHALL treat Codex SDK, Codex app-server, ACP, and `codex exec` as distinct Codex programmatic surfaces with separate capability states.

#### Scenario: Desktop and headless surfaces are displayed
- **WHEN** Locus shows or records Codex runtime metadata
- **THEN** it distinguishes desktop/chat adapter source from headless `codex exec` source
- **AND** it does not infer headless support from desktop adapter support or desktop support from headless `codex exec`
- **AND** each surface reports its own supported, degraded, and unsupported capability states

#### Scenario: Headless Codex remains on exec
- **WHEN** desktop/chat migrates to app-server while headless Codex still uses `codex exec`
- **THEN** the headless path remains labeled as batch/fallback mode
- **AND** missing rich event, approval, or session primitives remain degraded or unsupported for headless until separately implemented and tested
