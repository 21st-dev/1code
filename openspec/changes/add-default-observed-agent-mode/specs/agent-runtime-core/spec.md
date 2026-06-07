## ADDED Requirements
### Requirement: Default Observed Agent Control
The runtime core SHALL run normal desktop Agent-mode requests through an explicit observed control level by default.

#### Scenario: Unguarded Agent mode starts
- **WHEN** the user starts a desktop Agent-mode run without a scope contract or strict override
- **THEN** the resolved `PermissionPolicy` uses control level `observe`
- **AND** the runtime is allowed to continue normal supported actions
- **AND** catastrophic actions are loudly denied before execution when the selected runtime exposes a pre-tool hook for observed mode
- **AND** observable tool, shell, file, MCP, runtime, or provider actions are emitted as sanitized runtime events when the selected runtime exposes hooks or stream chunks
- **AND** the run remains cancelable through the shared abort mechanism

#### Scenario: Observed mode is not hard guard
- **WHEN** a run uses control level `observe`
- **THEN** the hard tool guard capability is not upgraded because of observation alone
- **AND** the run is not labeled as guarded or hard-enforced
- **AND** risky observed actions may be highlighted while still being allowed by default unless they match the explicit catastrophic denylist

#### Scenario: Runtime hook is unavailable
- **WHEN** the selected runtime cannot install a pre-tool observation hook for an observed Agent run
- **THEN** the run emits a renderer-safe degraded observation diagnostic
- **AND** the runtime may continue with stream-only visibility
- **AND** the diagnostic does not claim catastrophic pre-execution blocking, scope-contract enforcement, or hard guard support

#### Scenario: Observed mode blocks a catastrophic action
- **WHEN** an observed Agent-mode run requests a high-risk shell command, a write to a sensitive path, or a network-egress action classified as catastrophic by the guard owner
- **AND** the selected runtime exposes a pre-tool hook for observed mode
- **THEN** the action is denied before execution
- **AND** the runtime emits a sanitized event with control level, tool name, risk category, deny decision, and a renderer-safe explanation
- **AND** the denial is visible to the user rather than silently hidden

### Requirement: Observed Action Risk Metadata
The runtime core SHALL attach guard-owned risk metadata to observed tool and permission events.

#### Scenario: Runtime observes a tool action
- **WHEN** a runtime hook or stream chunk identifies a tool action during observed mode
- **THEN** the action event includes the control level, tool name, bounded action metadata, and a risk level derived from the guard owner
- **AND** raw provider secrets, raw environment values, raw headers, full file contents, and unbounded command output are not persisted or emitted to renderer state

#### Scenario: Runtime observes a high-risk shell command
- **WHEN** an observed tool action includes a high-risk or ambiguous shell command according to the guard-owned classifier
- **THEN** the event is tagged as high risk
- **AND** the default observed policy denies the action only when it matches the catastrophic denylist and the runtime exposes a pre-tool hook

#### Scenario: Runtime observes network egress
- **WHEN** an observed tool action may send project data to a network destination through web fetch, shell, MCP, runtime, or provider behavior
- **THEN** the event includes network-egress risk metadata derived from the guard owner
- **AND** the renderer can highlight the risk without owning a second network-egress classifier
