## Context

The renderer was lifted from a web product. Rather than rewrite every call site,
`src/renderer/lib/mock-api.ts` re-creates the old `api.*` shape over real tRPC
(`trpc.chats.*`) plus web-only stubs (stripe/user/claudeCode/agentInvites/
repositorySandboxes), using `AnyObj`/`AnyFn` to emulate the old surface. It also
hosts the only persisted-message normalizer: in `getAgentChat` it parses
`sub_chats.messages` JSON and migrates legacy `tool-invocation` parts, normalizes
Codex MCP wrapper shapes and ACP tool titles (verb map), and maps tool `state`
(DB `result` → SDK `output-available`/`output-error`).

Meanwhile transports declare `ChatTransport<UIMessage>` (AI SDK) but fall back to
`type UIMessageChunk = any`, and `message-store.ts` defines its own loose
`Message`/`MessagePart` (`[key: string]: any`, `metadata?: any`, `parts?` optional,
plus a message-level `createdAt`). The seams between these three representations
are bridged with ~40 `as any` and ~16 `@ts-ignore`, concentrated in
`active-chat.tsx`, `message-store.ts`, and the two transports. The existing
`src/shared/codex-tool-normalizer.ts` (pure, exported, testable) is the precedent
for where normalization should live.

There are also TWO facts that bound this change and were under-specified in the
first draft:

1. **Persisted hydration is not the only normalization site.** The render path in
   `assistant-message-item.tsx` re-normalizes every message's parts on each render
   via `normalizeCodexToolPart` (shared) composed with a **locally-defined**
   `normalizeAcpParts` — deliberately without `useMemo` because the AI SDK mutates
   parts in place. So live/streamed parts are normalized at render, while persisted
   parts are normalized at hydration (mock-api). A naive "single normalizer" claim
   is therefore false until this layering is named.
2. **The renderer is not the only writer of `sub_chats.messages`.** The main
   process writes message JSON as `any[]` — e.g. `persistClaudeAgentSdkAssistantResponse`
   (`src/main/lib/claude/agent-sdk-message-persistence.ts`) and the Codex path
   (`src/main/lib/trpc/routers/codex.ts`). The canonical model's authority over the
   write side must be stated explicitly.

`docs/OWNERSHIP_MAP.md` already names `runtime-event-state.ts` as the canonical
owner of live runtime-event normalization and forbids parallel old/new
implementations across adapters/transports.

## Goals / Non-Goals

**Goals:**
- One canonical renderer chat message model covering the AI SDK base parts AND the
  app's local data/UI parts and local message fields (enumerated below), with typed
  metadata extensions and a typed tool-part state.
- One shared, unit-tested **persisted-message** normalizer (the hydration owner)
  returning that model, built on shared low-level tool-shape primitives that the
  render path also reuses (no second copy of those primitives).
- Remove `mock-api.ts`; no parallel compat path.
- Remove boundary `as any`/`@ts-ignore` at the message/transport seams.
- A renderer architecture guard that actually fails if the single-owner boundary
  is violated (mock-api revived, a second persisted normalizer, or stale imports).

**Non-Goals:**
- Any change to rendering behavior or message semantics (behavior-preserving).
- Re-owning the live runtime-event-state path — it stays as-is.
- **Retyping the main-process writers** of `sub_chats.messages`
  (`persistClaudeAgentSdkAssistantResponse`, codex router). v1 governs the
  renderer read/hydration side only; main keeps writing `any[]` JSON and the
  normalizer remains the tolerant read boundary. The canonical type lives in
  `src/shared/` so main writers CAN adopt it later (separate follow-up).
- **Collapsing render-time normalization into the transport/runtime-event-state
  boundary** so the render path consumes already-canonical parts. Desirable, but
  the live path is owned elsewhere and out of scope; v1 only de-duplicates the
  primitives, it does not move the live normalization moment.
- Splitting `active-chat.tsx` for size (separate follow-up); this change touches
  it only at type seams.
- Re-implementing web-only stubs as real features (they stay stubs, just moved).

## Decisions

- **Canonical model is a local EXTENSION of `UIMessage`, not `UIMessage` generics
  alone.** The first draft said "use `UIMessage<METADATA, DATA_PARTS, TOOLS>`", but
  AI SDK 6 does not allow expressing the app's parts that way:
  - `UIMessage.parts` is **required** (`parts: Array<UIMessagePart<…>>`), yet the
    app stores messages with optional `parts` plus a message-level `createdAt`.
  - `DataUIPart`'s discriminant is fixed to `` `data-${NAME}` `` (ai
    `dist/index.d.ts`). The app's local parts `attachment-image`, `file-content`,
    and `long-text-attachment` do NOT follow that convention, so they cannot be
    modeled as `DATA_PARTS` without renaming on-disk shapes (a behavior change).
  Therefore the canonical type is an explicit local extension, e.g.:
  ```ts
  type CanonicalChatMessage = Omit<UIMessage, "parts"> & {
    parts?: CanonicalChatMessagePart[]   // persisted/hydrated parts only
    createdAt?: string | Date            // see createdAt decision below
    metadata?: ChatMessageMetadata       // sdkMessageUuid, outputTokens, …
  }
  // Persisted/hydrated parts — what is actually stored in sub_chats.messages:
  type AiSdkBaseMessagePart =
    | TextUIPart
    | ReasoningUIPart
    | ToolUIPart<UITools>
    | DynamicToolUIPart
    | SourceUrlUIPart
    | SourceDocumentUIPart
    | FileUIPart
    | StepStartUIPart
  type CanonicalChatMessagePart =
    | AiSdkBaseMessagePart                  // AI SDK base, excluding generic DataUIPart
    | AttachmentImagePart                   // type: "attachment-image"
    | DataImagePart                         // type: "data-image"
    | DataFilePart                          // type: "data-file"
    | FileContentPart                       // type: "file-content"
    | LongTextAttachmentPart                // type: "long-text-attachment"
  // Render-time superset — adds parts DERIVED during rendering, never persisted:
  type RenderableMessagePart =
    | CanonicalChatMessagePart
    | ExploringGroupPart                    // type: "exploring-group" (groupExploringTools)
    | TaskGroupPart                         // type: "task-group" (groupTaskTools)
    | /* any other render-only grouping types found in the inventory */
  ```
- **Persisted parts and render-derived parts are SEPARATE types.** `exploring-group`
  and `task-group` are built at render time by `groupExploringTools` /
  `groupTaskTools` in `assistant-message-item.tsx` — they are never persisted to or
  hydrated from `sub_chats.messages`. Putting them in `CanonicalChatMessagePart`
  (the persisted/hydrated union) would mis-state the on-disk contract. So the model
  splits: `CanonicalChatMessagePart` = persisted/hydrated parts only;
  `RenderableMessagePart` = `CanonicalChatMessagePart` ∪ render-derived grouping
  parts. The normalizer returns `CanonicalChatMessagePart[]`; the render pipeline
  produces `RenderableMessagePart[]`.
- **The part inventory is explicit, complete, and classified, or Phase 0 is not "no
  logic change".** Phase 0 enumerates every part `type` discriminant in use (grep
  the renderer + the `chats-crud.ts` schema) and classifies each as:
  - AI SDK base parts: `text`, `reasoning`, `step-start`, `tool-*`, `dynamic-tool`,
    `source-url`, `source-document`, `file` (and the discriminated tool `state`
    values incl. `output-available`/`output-error`) → canonical. This base is a
    narrow explicit union and MUST NOT use `UIMessagePart<UIDataTypes, UITools>`,
    because that includes generic `DataUIPart<UIDataTypes>` and would admit
    unregistered `` data-${string} `` parts.
  - Local persisted data parts: `attachment-image`, `data-image`, **`data-file`**,
    `file-content`, `long-text-attachment` (all confirmed in `message-parts.ts` and
    the `chats-crud.ts` create schema; `data-file` must NOT be treated as
    render-only or legacy) → canonical through explicit local part types only.
  - Render-derived parts: `exploring-group`, `task-group` (and any other grouping
    types found) → `RenderableMessagePart` only, NOT canonical.
  - Message-level local fields: `createdAt`, optional `parts`, typed `metadata`.
  Only after this classification is the type swap behavior-neutral.
- **`createdAt` is `string | Date`, not `Date`, in v1.** Persistence writes an ISO
  **string** (`agent-sdk-message-persistence.ts` → `now().toISOString()`), and
  mock-api today just `JSON.parse`es and passes it through, so hydrated messages
  carry `createdAt` as a string; freshly-created in-memory messages may carry a
  `Date`. To stay behavior-preserving the canonical type is `createdAt?: string |
  Date`, and a characterization test pins the actual hydrated shape. Coercing to a
  single `Date` in the normalizer is the cleaner end state but is a **deferred
  follow-up** that requires auditing every `createdAt` consumer first; doing it in
  this change would be a behavior change, not a type swap.
- **One shared definition; renderer and main DERIVE from it (no third copy).**
  Today the same part shapes are declared three times: `AgentUserMessagePart`
  (renderer `message-parts.ts`), the `initialMessageParts` zod union (main
  `chats-crud.ts`), and the store type. The canonical type and a matching zod
  schema live in `src/shared/chat-message.ts`; `message-parts.ts` and
  `chats-crud.ts` are rewired to import/derive from shared (TS type from the shared
  type, the main zod union from a shared schema). `src/shared/` already holds the
  part subtypes (`chat-attachments.ts`, `long-text-attachments.ts`) and does not
  import renderer code — the dependency direction is renderer/main → shared, never
  the reverse.
- **Transport seam adapts canonical ↔ AI SDK `UIMessage`.** Transports implement
  `ChatTransport<UIMessage>` and the AI SDK requires real `UIMessage` (required
  `parts`, standard part shapes). The canonical model is the store/render
  representation; at the transport boundary we adapt between the two (canonical
  optional-parts/local-parts ⇄ `UIMessage` required-parts). This boundary is
  exactly where today's `as any` lives, so typing the adapter — not forcing the
  store type to BE `UIMessage` — is what removes those casts. Local parts the SDK
  doesn't know about pass through the transport as opaque/data parts and are only
  interpreted by the renderer.
- **Two normalization moments, one set of primitives (resolves "no parallel
  path").** Hydration (persisted JSON → canonical) and render (live in-place AI SDK
  parts) are two legitimate moments. v1 declares: (a) the **persisted-message
  normalizer** in `src/shared/chat-message-normalizer.ts` is the single owner of
  the hydration moment; (b) the low-level tool-shape primitives are single shared
  functions — `normalizeCodexToolPart` is already shared, and `normalizeAcpParts`
  is **promoted out of `assistant-message-item.tsx` into `src/shared/`** so both
  the hydration normalizer and the render path import the same code. "No parallel
  normalization path" means no second *copy* of these primitives and no second
  persisted-history orchestrator — it does NOT forbid applying the shared
  primitives at render time, which the live (in-place-mutated) path still needs.
- **Read-side authority only; main writers are out of scope but share the type.**
  The canonical model governs renderer hydration + render. Main-process writers
  (`persistClaudeAgentSdkAssistantResponse`, codex router) keep writing `any[]`
  JSON in v1; the normalizer is the tolerant boundary that maps whatever was
  written into the canonical shape. The type is placed in `src/shared/` so a later
  change can adopt it on the write side without another type definition. This keeps
  the blast radius renderer-local while leaving a clean adoption path.
- **Normalizer is a pure shared module.** Move the `getAgentChat` transform into
  `src/shared/chat-message-normalizer.ts` (sibling to `codex-tool-normalizer.ts`,
  which it already calls). Pure `raw → CanonicalMessage[]`, no React/tRPC. This
  makes the legacy/codex/acp/state behavior unit-testable in isolation and is the
  safety net for the rest of the refactor.
- **Single-owner boundary is machine-enforced.** `scripts/check-architecture-guards.mjs`
  today only asserts owners like `runtime-event-state`; it would not catch a
  revived `mock-api`, a stray import of the removed module, or a second
  persisted-message normalizer. This change adds a guard assertion (e.g.
  `assertChatMessageModelOwner`) that fails when `mock-api.ts` exists, when the
  persisted normalizer is exported from more than one module, or when removed
  call-site imports reappear. Without it, the spec's single-owner scenarios are
  not provable.
- **Retire the shim, don't fork it.** Per "No Duplicate Business Paths", the same
  change that introduces the typed adapter removes `mock-api.ts`. Web-only stubs
  move to `src/renderer/lib/web-stubs.ts` (or are deleted where unused). Each of
  the 5 chat call sites switches to the typed adapter / direct tRPC + normalizer.
- **Phased, seam-only `as any` removal.** Thread the canonical type outward in
  small steps; type `UIMessageChunk`; narrow part-union access (`part.type`
  discriminant) instead of `(part as any)`. Do not broadly rewrite
  `active-chat.tsx` — only its boundary casts.

## Risks / Trade-offs

- **Behavior regression in normalization** (the transform is subtle: codex/acp
  edge cases, state mapping) → Land the extracted normalizer + characterization
  tests FIRST, asserting current output on representative legacy/codex/acp
  fixtures, before touching call sites. This is the gate for every later phase.
- **Touching the 7k-line `active-chat.tsx`** → Restrict edits to type seams; no
  control-flow or render changes. Reviewer checks the diff is cast-removal only.
- **`UIMessage` generic churn** (SDK version differences) → Pin the model to the
  installed `ai` version's generics; keep the canonical type in one module so an
  SDK bump touches one place.
- **Hidden coupling to web-only stub shapes** (some callers may rely on stub
  return shapes) → Inventory stub consumers before moving; keep identical return
  shapes in `web-stubs.ts`.
- **Incomplete part inventory silently drops a part type** (Phase 0 type swap looks
  green but a render branch loses its case) → Drive the union from a grepped
  inventory of all `type` discriminants; add a structural test that every rendered
  part type is a member of the canonical union.
- **Promoting `normalizeAcpParts` changes render output** (it was local and
  un-memoized for in-place mutation reasons) → Move it verbatim; keep the
  no-`useMemo` call shape at the render site; cover it with the normalizer
  characterization tests so render-time behavior is pinned.
- **Write/read drift while main stays `any[]`** (a main writer emits a shape the
  normalizer doesn't tolerate) → The normalizer keeps an explicit unknown/passthrough
  fallback; characterization fixtures include real Claude and Codex persisted blobs.

## Migration Plan

1. Phase 0 — inventory every part `type` discriminant in the renderer; define the
   canonical model (AI SDK base + local data parts + virtual parts + `createdAt`/
   `metadata`) in `src/shared/chat-message.ts`; re-point `message-store.ts` types to
   it (no logic change).
2. Phase 1 — extract the hydration normalizer to
   `src/shared/chat-message-normalizer.ts` and promote `normalizeAcpParts` into
   `src/shared/` (both the normalizer and `assistant-message-item.tsx` import it);
   add characterization tests on legacy/codex/acp/state fixtures; `mock-api.ts`
   temporarily delegates to the normalizer (still present).
3. Phase 2 — introduce typed adapter / direct call sites; migrate the 5 callers;
   move web-only stubs; delete `mock-api.ts`; add the `assertChatMessageModelOwner`
   guard.
4. Phase 3 — remove boundary `as any`/`@ts-ignore` in transports, store, and
   active-chat seams; `bun run ts:check` clean.

Rollback: phases are independent commits; reverting a later phase leaves earlier
phases (canonical type + tested normalizer) safely in place.
