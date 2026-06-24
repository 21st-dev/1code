# Spec Delta: provider-routing-ux

## ADDED Requirements

### Requirement: Engine selection is the sole runtime switch

The chat composition UI SHALL provide a single Engine control that selects the
runtime (Claude Code, Codex, Qwen Code, Kun) and SHALL be the only control that
changes the runtime. The Engine control SHALL surface runtime status derived from
the runtime capability manifest and runtime setup status (e.g. experimental,
unavailable, setup-required) without changing manifest data. Setup-required or
unavailable engines SHALL be non-runnable: they SHALL NOT change the selected
runtime, start a run, or create a sub-chat, though the UI MAY disable them or
route the user to setup. No other control — including the Model control — SHALL
change the selected runtime.

#### Scenario: Engine control switches runtime
- **WHEN** the user opens the Engine control
- **THEN** it lists the enabled runtimes with manifest/setup-derived status and
  selecting a ready runtime changes the runtime
- **AND** no other control changes the runtime

#### Scenario: Engine status reflects the manifest
- **WHEN** a runtime is experimental, unavailable, or requires setup
- **THEN** the Engine control shows that status from the runtime manifest/setup
  status rather than presenting the runtime as ready

#### Scenario: Setup-required engines cannot start work
- **WHEN** a runtime is unavailable or requires setup
- **THEN** selecting it does not change the selected runtime
- **AND** no run starts and no active-chat sub-chat is created
- **AND** the UI either disables the engine choice or routes the user to the
  relevant setup surface

### Requirement: Model control is runtime-scoped and never switches runtime

The chat composition UI SHALL provide a single Model control whose shape is
identical for every runtime and whose contents are scoped to the currently
selected Engine. It SHALL present that runtime's model sources, models, and
provider profiles, and SHALL show contextual options (such as Codex thinking and
account source, or Claude thinking) ONLY when the selected engine/model supports
them. The Model control's selected value SHALL be per-engine. New-chat selections
SHALL use the existing global/project defaults, while active-chat selections SHALL
use the current sub-chat model/source atom families before updating any
`lastSelected*` defaults for future chats. The Model control SHALL NOT change the
selected runtime.

#### Scenario: Model control content follows the selected engine
- **WHEN** the selected Engine changes
- **THEN** the Model control shows the new runtime's sources/models/profiles and
  its own per-engine selected value
- **AND** contextual options appear only for the runtimes/models that support them

#### Scenario: Model control never switches runtime
- **WHEN** the user selects any item in the Model control
- **THEN** the runtime is unchanged and only the model/source for the current
  Engine changes

#### Scenario: Active-chat model selection is sub-chat scoped
- **WHEN** the user changes Model state in an active-chat sub-chat
- **THEN** the current sub-chat's model/source state is updated
- **AND** other open sub-chats keep their own selected model/source state
- **AND** any `lastSelected*` update is used only as a default for later chats

#### Scenario: Claude and Codex selection behavior is preserved
- **WHEN** Claude Code or Codex is the selected Engine
- **THEN** model selection, thinking, Codex account source, source/model
  compatibility, provider-profile selection, and Ollama selection behave as before
  the split
- **AND** these behaviors are available from the Model control rather than a
  combined runtime+model menu

### Requirement: Runtime-managed Model state for runtimes without profile parity

The Model control SHALL render a runtime-managed / setup state for a runtime whose
provider-profile capability is not supported (e.g. Qwen Code's `degraded`
`providerProfiles`) instead of fabricating provider-profile parity, and SHALL NOT
present provider-profile rows for that runtime. Kun SHALL use the same Model
control rather than a bespoke selector, and the renderer SHALL handle only
source/profile identifiers and SHALL NOT receive plaintext provider secrets.

#### Scenario: Qwen shows runtime-managed state
- **WHEN** Qwen Code is the selected Engine
- **THEN** the Model control shows a runtime-managed / setup state, not
  provider-profile rows
- **AND** no provider secret is sent to the renderer

#### Scenario: Kun uses the shared Model control
- **WHEN** Kun is the selected Engine
- **THEN** its provider profiles and BYO config are shown through the same Model
  control used by other runtimes, not a bespoke Kun selector

### Requirement: Engine switch preserves empty and non-empty active-chat behavior

Switching the Engine in active chat SHALL preserve the existing distinction
between empty and non-empty sub-chats for ALL runtimes (Claude Code, Codex, Qwen
Code, Kun) — not only Claude and Codex. If the current active sub-chat is empty,
the Engine switch SHALL update that sub-chat in place without history attachment
or a new tab. If the current active chat has history, switching the Engine SHALL
start a new sub-chat that attaches the prior conversation as history context and
inherits per-runtime model preferences, after the existing confirmation. The
confirmation that previously lived inside the combined model selector SHALL be
presented by the Engine control. The same Engine and Model controls SHALL be used
on both the new-chat form and the active-chat input.

#### Scenario: Switching engine in an empty active sub-chat updates in place
- **WHEN** the user switches the Engine while the active sub-chat has no messages
- **THEN** the current sub-chat runtime is updated in place
- **AND** no history attachment is staged and no new sub-chat is created
- **AND** this works when switching into Qwen Code or Kun, not only Claude/Codex

#### Scenario: Switching engine in an active chat starts a new sub-chat
- **WHEN** the user switches the Engine while an active chat has history
- **THEN** the UI confirms, then creates a new sub-chat with the prior history
  attached and per-runtime model preferences inherited for the target runtime
- **AND** this works when switching into Qwen Code or Kun, not only Claude/Codex

#### Scenario: Switching into a runtime without provider profiles
- **WHEN** the target runtime has no provider-profile selection (e.g. Qwen)
- **THEN** the new sub-chat starts with that runtime's runtime-managed source
  rather than failing on absent provider-profile inheritance

#### Scenario: New-chat and active-chat use the same controls
- **WHEN** the Engine or Model control renders on the new-chat form and on the
  active-chat input
- **THEN** both surfaces use the same Engine and Model components with consistent
  behavior

### Requirement: Engine and Model controls are localized

The Engine and Model controls SHALL localize app-authored labels, runtime status
copy, and setup actions in English and Simplified Chinese. Provider names, model
IDs, profile names, protocols, and URLs SHALL remain unchanged.

#### Scenario: User switches language with Engine and Model controls visible
- **WHEN** the user views chat composition in English or Simplified Chinese
- **THEN** Engine, Model, setup-required/unavailable statuses, and setup actions
  render in the selected language
- **AND** provider names, model IDs, profile names, protocols, and URLs remain
  unchanged
