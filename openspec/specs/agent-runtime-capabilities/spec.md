# agent-runtime-capabilities Specification

## Purpose
TBD - created by archiving change add-agent-runtime-capability-model. Update Purpose after archive.
## Requirements
### Requirement: Runtime Capability Manifest
The system SHALL expose each supported coding-agent runtime through an explicit capability manifest instead of inferring behavior from provider or runtime names.

#### Scenario: Runtime manifest is requested
- **WHEN** a desktop, CLI, job, protocol, or main-process caller requests runtime metadata
- **THEN** the system returns a manifest for each registered runtime
- **AND** each manifest includes runtime ID, display metadata, capability IDs, capability state, capability scope, non-secret reason text, and optional remediation hints
- **AND** the renderer receives no provider secrets, OAuth tokens, raw request headers, or plaintext credential material

#### Scenario: Runtime is missing
- **WHEN** a caller requests a runtime that is not registered or not available in the current environment
- **THEN** the system returns a normalized unavailable-runtime diagnostic before starting provider work
- **AND** the diagnostic does not fall back to another runtime silently

### Requirement: Capability States
The system SHALL model runtime capabilities with explicit `supported`, `degraded`, and `unsupported` states.

#### Scenario: Capability is supported
- **WHEN** a runtime marks a capability as `supported`
- **THEN** the runtime adapter or a Locus-owned shared layer provides the behavior through code
- **AND** tests or smoke evidence cover the behavior before the implementation checklist is completed
- **AND** prompt-only instructions, UI labels, indexed documentation, and post-run audit alone do not satisfy the support claim
- **AND** a forced smoke prompt that only succeeds for one narrow command shape does not satisfy support for productive real UI guarded editing

#### Scenario: Capability is degraded
- **WHEN** a runtime can provide only partial, read-only, prompt-assisted, discovery-only, fail-closed-only, forced-smoke-only, or post-run-audited behavior
- **THEN** the capability state is `degraded`
- **AND** callers can display the partial behavior with a clear limitation reason
- **AND** callers do not treat the capability as fully supported for safety, mutation, execution, or automation decisions

#### Scenario: Capability is unsupported
- **WHEN** a runtime has no stable primitive and no Locus-owned shared layer for a capability
- **THEN** the capability state is `unsupported`
- **AND** callers disable, hide, or reject behavior that depends on that capability before provider work starts
- **AND** the manifest includes a concise reason when practical

### Requirement: Capability Scopes
The system SHALL distinguish runtime-neutral capabilities from runtime-specific capabilities.

#### Scenario: Capability is runtime-neutral
- **WHEN** a feature is presented as runtime-neutral
- **THEN** every runtime allowed to use that feature reports `supported` for the required capability set
- **AND** callers apply the same safety, event, cancellation, and result semantics across those runtimes
- **AND** a runtime with `degraded` or `unsupported` state is gated out or shown with explicit downgrade behavior

#### Scenario: Capability is runtime-specific
- **WHEN** a capability is available only for Claude Code, Codex, or another selected runtime
- **THEN** the system may expose it as a first-class runtime-specific capability
- **AND** UI, CLI, jobs, and protocol surfaces label it with its owning runtime
- **AND** other runtimes are not required to emulate it for the owning runtime's feature to ship

#### Scenario: Runtime-specific capability is requested for the wrong runtime
- **WHEN** a caller requests a runtime-specific capability for a runtime that does not own or support it
- **THEN** the system rejects or disables the request before provider work starts
- **AND** returns a normalized unsupported-capability diagnostic

#### Scenario: Folderless assistant is advertised as runtime-neutral
- **WHEN** folderless quick chat is presented for both Claude and Codex
- **THEN** both runtimes report supported assistant-tier pre-tool enforcement for web-only quick chat
- **AND** any adapter path that cannot prove fail-closed assistant enforcement is gated out or labeled degraded before the user starts a quick chat with that runtime

### Requirement: Capability-Driven Runtime Surfaces

The system SHALL gate runtime-dependent UI, CLI, job, and protocol behavior from
capability manifests. When the behavior depends on a concrete capability whose
kind has a registered Runtime Capability Projection adapter, the caller SHALL
also consume runtime projection availability from the Runtime Capability
Projection owner instead of inferring availability from install state or runtime
names. Capability kinds without a registered projection adapter remain governed
by their existing owner and verifier, and callers SHALL NOT fabricate projection
stubs only to satisfy this requirement.

#### Scenario: Desktop renders runtime controls
- **WHEN** the desktop UI renders controls for rollback, fork, tools, MCP, plugins, commands, workflows, App Agents, skills, attachments, or provider profiles
- **THEN** it uses the selected runtime's capability manifest to enable, disable, warn, or hide those controls
- **AND** runtime-projected concrete capabilities with registered projection adapters show runtime availability separately from Locus install state
- **AND** it does not assume Claude Code and Codex are feature-equivalent
- **AND** it does not assume a runtime lacks a feature solely from the runtime name

#### Scenario: CLI or job starts runtime work
- **WHEN** a CLI, job, schedule, or protocol caller requests runtime work with options that require specific capabilities
- **THEN** the caller validates the requested options against the selected runtime's manifest before provider work starts
- **AND** unsupported required capabilities produce normalized diagnostics and non-zero command/job failure where applicable
- **AND** concrete capabilities for registered projection adapters that are unavailable or incompatible for the selected runtime are excluded, disabled, or rejected before provider work starts

#### Scenario: Capability changes over time
- **WHEN** a runtime CLI, SDK, ACP layer, or Locus-owned shared layer adds or removes a stable primitive
- **THEN** the runtime manifest is updated through a reviewed change
- **AND** tests or smoke evidence are updated for every capability state changed to `supported`

#### Scenario: Runtime-projected capability is unavailable
- **WHEN** a concrete capability kind has a registered projection adapter
- **AND** a capability is installed in Locus but unavailable, incompatible, or not projected for the selected runtime
- **THEN** callers disable, warn, or exclude that concrete capability before provider work starts
- **AND** they expose a normalized non-secret reason instead of silently attempting to use it

### Requirement: Cross-Runtime Parity Boundary
The system SHALL NOT require Claude Code and Codex to reach feature-for-feature parity before either runtime can expose truthful first-class capabilities.

#### Scenario: Claude supports a capability that Codex does not
- **WHEN** Claude Code exposes a stable CLI, SDK, or Locus adapter primitive for a capability
- **AND** Codex has no equivalent stable primitive or shared Locus layer
- **THEN** Locus may expose the capability for Claude as runtime-specific or runtime-neutral only where other selected runtimes also support it
- **AND** Codex reports `degraded` or `unsupported` with a reason instead of emulating the capability through prompt-only behavior

#### Scenario: Codex supports a capability that Claude does not
- **WHEN** Codex or ACP exposes a stable primitive for a capability
- **AND** Claude Code has no equivalent stable primitive or shared Locus layer
- **THEN** Locus may expose the capability for Codex as runtime-specific or runtime-neutral only where other selected runtimes also support it
- **AND** Claude reports `degraded` or `unsupported` with a reason instead of hiding the Codex capability behind a lowest-common-denominator surface

#### Scenario: Shared Locus layer provides parity
- **WHEN** Locus implements a shared layer that safely provides the same capability semantics across multiple runtimes
- **THEN** those runtimes may report the capability as `supported`
- **AND** tests cover the shared layer and each runtime adapter path that depends on it

### Requirement: Adapter-Specific Capability Evidence
The system SHALL record Codex capability support evidence per adapter source rather than assuming every Codex transport has identical behavior.

#### Scenario: Codex capability support is evaluated
- **WHEN** Codex desktop/chat, headless `codex exec`, SDK, or app-server paths report a capability as `supported`
- **THEN** the capability evidence identifies the adapter source or Locus-owned shared layer that provides the behavior
- **AND** tests or smoke evidence cover that adapter source before the capability is shown as supported for that path
- **AND** support on one Codex path does not imply support on another Codex path

#### Scenario: App-server is the sole desktop adapter after ACP removal
- **WHEN** the ACP temporary-compat path is removed and app-server is the only Codex desktop/chat adapter
- **THEN** capability reasons and remediation hints do not cite ACP-specific primitives as evidence for supported behavior
- **AND** deleting the ACP capability overrides does not leave any app-server capability silently upgraded to `supported`
- **AND** Locus-owned shared files retained under `acp-*` names (for example the shared permission decisioning module) remain valid capability evidence for the app-server path

### Requirement: Capability Trace Evidence
Runtime capability inspection SHALL be driven by canonical manifests or sanitized runtime trace evidence rather than renderer inference.

#### Scenario: Capability evidence is available
- **WHEN** a runtime, provider binding, adapter source, or shared Locus layer reports capability state through a canonical manifest or sanitized trace event
- **THEN** the UI may show capability rows with supported, degraded, or unsupported state, reason text, owner/runtime, and remediation hints
- **AND** renderer code does not infer capability truth from runtime names, provider labels, button visibility, or raw log text alone

#### Scenario: Capability evidence is unavailable
- **WHEN** provider binding or capability state is only present in logs, incidental metadata, or runtime-specific diagnostics without a canonical manifest or trace event
- **THEN** the capability inspector remains hidden, disabled, or explicitly marked unavailable for that run
- **AND** the UI does not present capability status as a complete truth table

#### Scenario: Capability row is degraded or unsupported
- **WHEN** a capability row reports degraded or unsupported state
- **THEN** the row includes the non-secret reason and a concrete next action when available
- **AND** controls that require unsupported capabilities remain disabled or fail closed before provider work starts

