## ADDED Requirements

### Requirement: Persisted settings must have a functional reader

The application SHALL NOT persist a settings atom (`atomWithStorage` in
`src/renderer/lib/atoms/index.ts`) that no runtime code reads, whether directly or
through a derived atom that itself has a reader. Settings state that writes
localStorage but is never consumed MUST NOT ship.

#### Scenario: Defined persisted setting is consumed

- **WHEN** a persisted settings atom is defined
- **THEN** at least one module outside its own definition reads it, or it feeds a
  derived atom that is itself read

#### Scenario: Dead persisted setting is rejected

- **WHEN** a persisted settings atom (or the derived selector it exclusively feeds)
  has zero readers across `src/` outside its own definition file
- **THEN** the `assertNoDeadSettingsState` guard fails the architecture check

### Requirement: Every Settings tab module must be rendered

Each Settings tab module (`agents-*-tab.tsx` under `settings-tabs/`) MUST be
reached by the settings content switcher (`settings-content.tsx`). Reachability is
checked by **module path**, not by exported component name, so that aliased
re-exports (for example `AgentsProjectWorktreeTab` re-exporting the rendered
`AgentsProjectsTab`) are not false positives. A tab module that the switcher never
imports MUST NOT ship.

#### Scenario: Tab module is rendered

- **WHEN** an `agents-*-tab.tsx` module exists under `settings-tabs/`
- **THEN** the settings content switcher imports that module by path and renders it
  for some tab id

#### Scenario: Unrendered tab module is rejected

- **WHEN** an `agents-*-tab.tsx` module is never imported by the settings content
  switcher
- **THEN** the `assertNoDeadSettingsState` guard fails the architecture check

### Requirement: Runtime capability flags expose a control or are a hardcoded default

A runtime capability flag MUST be either backed by a user-facing control in
Settings or implemented as a hardcoded default — for example, the flag gating
whether TodoWrite/Task tools are exposed. Such a flag MUST NOT be persisted as
hidden state that no UI can change.

#### Scenario: Tool exposure resolves without a control-less flag

- **WHEN** the renderer determines whether to expose TodoWrite/Task tools
- **THEN** it resolves to the preserved default (enabled) from an explicit constant,
  not from a persisted flag that has no settings control

#### Scenario: Orphan capability flag is rejected

- **WHEN** a runtime capability flag is persisted but has no settings control
- **THEN** it is either given a control or inlined to a hardcoded default before it ships
