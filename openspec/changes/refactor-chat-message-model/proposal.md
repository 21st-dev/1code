## Why

The renderer carries three unreconciled representations of a chat message, and
`as any` is the glue between them:

1. AI SDK `UIMessage` (transports type themselves `ChatTransport<UIMessage>`, but
   even there give up with `type UIMessageChunk = any`);
2. the store's own `Message`/`MessagePart` (`message-store.ts`), which is itself
   built on `any` (`input?: any; output?: any; [key: string]: any; metadata?: any`);
3. raw persisted JSON in `sub_chats.messages`, normalized at read time by a large
   untyped transform that lives inside `src/renderer/lib/mock-api.ts`.

`mock-api.ts` is misnamed: it is no longer mock data — it is a web-app
compatibility shim wrapping real tRPC plus web-only stubs, and it also owns the
**only** persisted-message normalizer (legacy `tool-invocation` migration, Codex
MCP/ACP tool-shape normalization, tool `state` mapping). That normalization being
buried in a file called "mock", behind `AnyObj`, is the root of both the naming
debt and the boundary `as any`. There is no canonical message type, so consuming
code (active-chat, message-store, transports) casts to `any` to bridge the seams.

This is a behavior-preserving refactor: consolidate to one canonical message
model and one shared, tested normalizer, then delete the shim. No user-facing
behavior changes.

## What Changes

- Add a canonical chat message model as the single source of truth, defined as a
  local **extension** of the AI SDK type —
  `Omit<UIMessage, "parts"> & { parts?: CanonicalChatMessagePart[]; createdAt?: string | Date; metadata? }`
  — because `UIMessage.parts` is required and `DataUIPart` is fixed to
  `` `data-${NAME}` ``, which the app's local parts do not follow. Two part types:
  - `CanonicalChatMessagePart` = **persisted/hydrated** parts: AI SDK base
    (`text`/`reasoning`/`step-start`/`tool-*` with a typed `state`, plus SDK
    file/source/dynamic-tool parts) as a narrow explicit union that excludes generic
    `DataUIPart`, PLUS local parts `attachment-image`, `data-image`, `data-file`,
    `file-content`, `long-text-attachment` admitted only through explicit local
    part types.
  - `RenderableMessagePart` = `CanonicalChatMessagePart` ∪ **render-derived** parts
    (`exploring-group`, `task-group`) that are built during rendering and never
    persisted — kept out of the canonical/persisted union.
  `createdAt` is `string | Date` (persistence writes an ISO string; coercing to a
  single `Date` is a deferred follow-up). The canonical type + a matching zod schema
  live in `src/shared/chat-message.ts` as the **single definition**; the existing
  `AgentUserMessagePart` (`message-parts.ts`) and the `chats-crud.ts`
  `initialMessageParts` zod union are rewired to derive from shared (no third copy).
  Replace the loose `Message`/`MessagePart` in `message-store.ts` with it, plus a
  structural test that every rendered part type is a member of `RenderableMessagePart`
  and every persisted part type is a member of `CanonicalChatMessagePart`; an
  unregistered generic data part such as `data-foo` must be rejected.
- Extract the **persisted-message (hydration)** normalizer out of `mock-api.ts`
  into a shared, pure, unit-tested module (sibling to
  `src/shared/codex-tool-normalizer.ts`), and promote the render-time
  `normalizeAcpParts` (today defined inside `assistant-message-item.tsx`) into
  `src/shared/` so hydration and render share ONE copy of the tool-shape
  primitives. Render-time normalization stays (the live in-place path needs it) —
  the single-owner rule targets the hydration orchestrator and the primitives, not
  the render application.
- Replace the chat surface of `mock-api.ts` with a typed adapter (or inline tRPC
  + normalizer at the call sites), split the genuine web-only stubs into a
  clearly named module, and **delete `mock-api.ts`** — no parallel old/new path.
  Update the call sites: `agents-content.tsx`, `active-chat.tsx`,
  `agent-diff-view.tsx`, `sub-chat-selector.tsx`, `agents-subchats-sidebar.tsx`.
- Add an `assertChatMessageModelOwner` assertion to
  `scripts/check-architecture-guards.mjs` so the single-owner boundary is
  machine-enforced (fails on a revived `mock-api`, a second persisted normalizer,
  or stale imports) — the existing guard does not cover this.
- Thread the canonical type through the transport and store seams and remove the
  boundary `as any`/`@ts-ignore` incrementally (type `UIMessageChunk`, narrow
  part-union access). This is done in small steps; `active-chat.tsx` is updated
  at the seams only, **not** broadly rewritten.
- Update the `CLAUDE.md` "DEPRECATED mock-api" note to reflect the new owner.

Scope boundary: the canonical model governs the **renderer read/hydration side**.
The main-process writers of `sub_chats.messages`
(`persistClaudeAgentSdkAssistantResponse`, codex router) keep writing `any[]` JSON
in v1; the normalizer stays the tolerant read boundary, and the type lives in
`src/shared/` so the write side can adopt it in a later change.

Out of scope: changing rendering behavior, the live runtime-event-state path
(`runtime-event-state.ts` remains the canonical owner for streamed chunks),
retyping the main-process write side, collapsing render-time normalization into
the transport boundary, and splitting `active-chat.tsx` for size (separate
follow-ups).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `architecture-ownership`: declare a canonical owner for the renderer chat
  message model and persisted-message normalization, and require removal of the
  `mock-api` duplicate/compat path rather than a long-lived parallel
  implementation.

## Impact

- **Renderer types/stores**: `src/renderer/features/agents/stores/message-store.ts`
  (canonical `Message`/`MessagePart`), new shared
  `src/shared/chat-message.ts` (or renderer types module) + tests.
- **Normalizer**: new `src/shared/chat-message-normalizer.ts` (+ tests) carrying
  the logic currently in `mock-api.ts`, plus `normalizeAcpParts` promoted from
  `assistant-message-item.tsx` into `src/shared/`.
- **Render path**: `assistant-message-item.tsx` imports the promoted
  `normalizeAcpParts` (call shape unchanged) instead of defining it locally, and
  its render-derived parts (`exploring-group`/`task-group`) type as
  `RenderableMessagePart`.
- **Single-definition rewiring**: `src/main/lib/trpc/routers/chats-crud.ts`
  (`initialMessageParts` zod union) and
  `src/renderer/features/agents/lib/message-parts.ts` (`AgentUserMessagePart`)
  derive from the shared `src/shared/chat-message.ts` type + zod schema instead of
  re-declaring part shapes.
- **Removed**: `src/renderer/lib/mock-api.ts`; its web-only stubs move to a
  clearly named module.
- **Call sites**: `agents-content.tsx`, `active-chat.tsx`, `agent-diff-view.tsx`,
  `sub-chat-selector.tsx`, `agents-subchats-sidebar.tsx`.
- **Transports/seams**: `ipc-chat-transport.ts`, `acp-chat-transport.ts`,
  `message-store.ts`, `active-chat.tsx` (`as any` removal at boundaries only).
- **Architecture guard**: `scripts/check-architecture-guards.mjs` gains
  `assertChatMessageModelOwner`.
- **Not modified in v1 (read-side scope)**: main writers
  `src/main/lib/claude/agent-sdk-message-persistence.ts` and
  `src/main/lib/trpc/routers/codex.ts` keep emitting `any[]` JSON; write-side
  adoption is a deferred follow-up.
- **Docs**: `CLAUDE.md`, `docs/OWNERSHIP_MAP.md`.
- No DB/schema/migration changes; no breaking API changes; behavior preserved.
