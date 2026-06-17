## ADDED Requirements

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
