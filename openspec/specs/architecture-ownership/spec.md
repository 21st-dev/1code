# architecture-ownership Specification

## Purpose
Defines the canonical ownership and no-duplicate-business-path guardrails for
architecture-sensitive Locus runtime, provider, guard, MCP, route, and renderer
event-state changes.
## Requirements
### Requirement: Canonical Ownership Map

The system SHALL maintain a canonical ownership map for cross-cutting runtime,
provider, guard, MCP, route, and renderer runtime-event state behavior.

#### Scenario: Architecture-sensitive change is started

- **WHEN** a change modifies runtime, provider, guard, auth, capability, MCP,
  chat, or renderer runtime-event state logic
- **THEN** the implementer identifies the canonical owner from the ownership map
- **AND** the change updates that owner instead of adding a parallel business
  path

### Requirement: No Duplicate Business Paths

The system SHALL reject long-lived old/new duplicate implementations for the
same business capability.

#### Scenario: Logic is extracted into a new module

- **WHEN** a route, transport, adapter, or helper extracts business logic into a
  new owner
- **THEN** the same change removes or replaces the old helper and call sites
- **AND** tests or architecture guards cover the new single-owner boundary

#### Scenario: Temporary dual path is required

- **WHEN** a migration needs a temporary second implementation
- **THEN** the change declares the canonical owner, migration flag or gate,
  deletion date or follow-up, tests or guard coverage, and deprecation comment
- **AND** callers do not silently choose between the old and new path without
  the migration gate

### Requirement: Architecture Guard Check

The system SHALL provide a local architecture guard check for known duplicate
ownership patterns.

#### Scenario: Guard check runs

- **WHEN** the architecture guard check is executed
- **THEN** it reports high-signal duplicate owner violations
- **AND** it points the implementer to the ownership map for the canonical owner
- **AND** it avoids broad keyword-only failures that would block unrelated work

### Requirement: Runtime Surface Separation

The system SHALL keep desktop chat runtime behavior and headless batch runtime
behavior as separate product surfaces.

#### Scenario: Codex desktop chat changes

- **WHEN** Codex desktop chat behavior is changed
- **THEN** it uses the desktop chat runtime owner
- **AND** `codex exec` remains headless/batch fallback rather than becoming a
  second desktop chat implementation

#### Scenario: Claude desktop chat changes

- **WHEN** Claude desktop chat behavior is changed
- **THEN** it uses the Claude desktop chat runtime owner and Claude Agent SDK
  surface
- **AND** the bundled Claude Code CLI install surface does not become a second
  desktop chat implementation

### Requirement: Runtime Execution Boundary Ownership
The system SHALL keep runtime request shape, adapter selection, permission
policy, event normalization, redaction, and persistence boundaries in canonical
runtime owners rather than duplicating those rules in routes, transports, or
headless adapters.

#### Scenario: Adapter selection changes
- **WHEN** a change adds, removes, or selects between batch, SDK, app-server,
  ACP, or future runtime adapter sources
- **THEN** the change updates the canonical runtime execution selector
- **AND** route, CLI, protocol, and Local Job API code do not derive a second
  durable adapter-selection truth table

#### Scenario: Runtime events cross surfaces
- **WHEN** a desktop or headless runtime emits events that are persisted or
  exposed to renderer, CLI, protocol, or Local Job API callers
- **THEN** the events pass through the canonical runtime event and redaction
  owners before persistence or external exposure
- **AND** surface-specific envelopes may map those events without owning a
  second event vocabulary

#### Scenario: Temporary dual execution path is required
- **WHEN** a migration temporarily keeps old headless batch behavior and a new
  shared runtime execution path
- **THEN** the change declares the canonical owner, migration gate, deletion
  condition or follow-up, and tests proving which path is active
- **AND** callers cannot silently choose between old and new behavior without
  that gate

### Requirement: Canonical Chat Message Model And Normalization

The system SHALL maintain a single canonical chat message model and a single owner
for **persisted-message** normalization (the hydration moment), distinct from the
live runtime-event-state path. The canonical model SHALL cover the AI SDK base
parts, the app's local data parts, and local message-level fields, not only the AI
SDK generic, and SHALL distinguish persisted/hydrated parts from render-derived
parts. The model and its part schema SHALL be defined once in a shared location
that does not depend on renderer or main code, and the renderer send-side type and
main create-input schema SHALL derive from that single definition. Low-level
tool-shape primitives SHALL exist as single shared functions reused by both the
hydration normalizer and the render path. Persisted sub-chat messages SHALL be
hydrated through the one hydration normalizer, and renderer chat consumers SHALL
type against the canonical model rather than casting persisted or streamed messages
to `any`. The canonical model governs the renderer read/hydration side; the
main-process write side may adopt it later without a second definition.

#### Scenario: Persisted messages are hydrated

- **WHEN** the renderer loads persisted sub-chat messages from storage
- **THEN** the messages are normalized through the single persisted-message
  normalizer that returns the canonical message model
- **AND** the normalizer is unit-tested for legacy tool-invocation migration,
  Codex MCP and ACP tool-shape normalization, and tool state mapping

#### Scenario: Canonical model covers local shapes

- **WHEN** the canonical message model is defined
- **THEN** it is a local extension of the AI SDK message type (the AI SDK message
  requires `parts` and fixes data-part discriminants, which the app's parts do not
  follow), preserving optional `parts`, a message-level `createdAt` typed to match
  what is persisted (an ISO string), and typed metadata extensions
- **AND** the persisted part union encodes the AI SDK base parts and the local data
  parts the app persists (image attachments, file attachments, file content,
  long-text attachments, legacy image data)
- **AND** the AI SDK base part union is narrow and explicit, excluding generic
  `DataUIPart`, so unregistered arbitrary `data-*` parts are not accepted; local
  `data-image` and `data-file` enter only through explicit local part definitions
- **AND** render-derived parts that are never persisted are kept in a separate
  renderable part union, not the persisted union
- **AND** tests assert every persisted part type is a member of the persisted union
  and every part type rendered by the chat view is a member of the renderable union,
  including a rejection case for an unregistered generic data part such as `data-foo`

#### Scenario: Message part shapes have one definition

- **WHEN** the renderer send-side type and the main create-input schema describe
  message parts
- **THEN** both derive from the single shared message-model definition (type and
  schema) rather than declaring part shapes independently
- **AND** the shared module does not depend on renderer or main code

#### Scenario: One set of normalization primitives, two moments

- **WHEN** tool-shape normalization is applied at hydration and at render time
- **THEN** both paths call the same shared primitive functions, with no second copy
- **AND** the single-owner rule forbids a second persisted-history normalizer, not
  the reuse of the shared primitives at render time

#### Scenario: Compatibility shim is removed and enforced

- **WHEN** the canonical model and normalizer are in place
- **THEN** the `mock-api` chat-and-normalization path is removed rather than kept
  as a parallel implementation
- **AND** genuine web-only stubs are relocated to a clearly named module
- **AND** the remaining chat call sites consume the canonical owner directly
- **AND** the architecture guard check fails if `mock-api` is reintroduced, if the
  persisted normalizer is exported from more than one module, or if a removed
  call-site import reappears

#### Scenario: Boundary casts are eliminated

- **WHEN** a transport, store, or chat view reads message parts or metadata
- **THEN** it narrows against the canonical message model instead of casting to
  `any`
- **AND** typed message metadata extensions are part of the canonical model

#### Scenario: Live event ownership is preserved

- **WHEN** streamed runtime chunks are normalized
- **THEN** `runtime-event-state.ts` remains the canonical owner for live event
  normalization
- **AND** the persisted-message normalizer does not duplicate that live path

