## 1. Ownership and guardrails

- [x] 1.1 Confirm canonical owners in `docs/OWNERSHIP_MAP.md` for renderer chat,
  transports, and runtime-event-state before changing normalization or message
  types; add the new persisted-message-normalizer + canonical-model owner entries.
- [x] 1.2 Confirm no conflicting active OpenSpec change touches chat rendering,
  transports, or `architecture-ownership`.

## 2. Phase 0 — canonical message model (no behavior change)

- [x] 2.1 Inventory every message part `type` discriminant used in the renderer
  (grep `assistant-message-item.tsx`, `active-chat.tsx`, the `ui/` tool renderers)
  AND the existing type sources — `AgentUserMessagePart` in `message-parts.ts` and
  the `chats-crud.ts` `initialMessageParts` zod union — and classify each as a
  **persisted** part, a **render-derived** part (e.g. `exploring-group`,
  `task-group`), or a message-level field. This classification is the input to 2.2.
- [x] 2.2 Add `src/shared/chat-message.ts` defining the canonical model as a local
  EXTENSION of the AI SDK type, not the generic alone (because `UIMessage.parts` is
  required and `DataUIPart` is fixed to `` `data-${NAME}` ``):
  `Omit<UIMessage, "parts"> & { parts?: CanonicalChatMessagePart[]; createdAt?: string | Date; metadata?: ChatMessageMetadata }`.
  Define TWO part unions: `CanonicalChatMessagePart` = persisted/hydrated parts (a
  narrow explicit AI SDK base union for `text`/`reasoning`/`step-start`/`tool-*`
  with the tool `state` union, plus SDK `file`/`source-*`/`dynamic-tool` parts, and
  **excluding generic `DataUIPart`** so arbitrary `` data-${string} `` is not
  accepted; local `attachment-image`, `data-image`, **`data-file`**,
  `file-content`, and `long-text-attachment` enter only through explicit local part
  types); and `RenderableMessagePart` = `CanonicalChatMessagePart` ∪ render-derived
  parts from 2.1 (`exploring-group`, `task-group`). `createdAt` is `string | Date`
  (persistence writes an ISO string; do not type as `Date`).
- [x] 2.3 Make `src/shared/chat-message.ts` the single definition: export a matching
  zod schema, then rewire `chats-crud.ts` `initialMessageParts` and renderer
  `AgentUserMessagePart` to derive from the shared type/schema (no third copy).
  Confirm `src/shared/` does not import renderer/main code.
- [x] 2.4 Replace the loose `Message`/`MessagePart` in
  `src/renderer/features/agents/stores/message-store.ts` with the canonical model
  (re-export or import), keeping all logic unchanged.
- [x] 2.5 Add structural tests: every **persisted** part `type` from 2.1 is a member
  of `CanonicalChatMessagePart`, and every **rendered** part `type` is a member of
  `RenderableMessagePart`; also assert an unregistered generic data part such as
  `data-foo` is rejected by the canonical persisted type/schema (so a future add
  can't silently drop a case, leak a render-only part into the persisted union, or
  reintroduce broad `DataUIPart` acceptance).
- [x] 2.6 `bun run ts:check` stays green after the type swap.

## 3. Phase 1 — extract the normalizer with characterization tests

- [ ] 3.1 Move the `getAgentChat` persisted-message transform from
  `src/renderer/lib/mock-api.ts` into a pure
  `src/shared/chat-message-normalizer.ts` returning the canonical model; it may
  reuse `codex-tool-normalizer.ts`.
- [ ] 3.2 Promote `normalizeAcpParts` out of `assistant-message-item.tsx` into
  `src/shared/` (verbatim) so the hydration normalizer and the render path import
  the same primitive; keep the render call shape unchanged (no `useMemo`, in-place
  mutation preserved). No second copy of `normalizeAcpParts`/`normalizeCodexToolPart`.
- [ ] 3.3 Add characterization tests covering legacy `tool-invocation` migration,
  Codex MCP wrapper normalization, ACP tool-title verb mapping, tool `state`
  mapping, AND the `createdAt` shape after hydration (it is an ISO string today),
  asserting current output on representative fixtures (incl. real Claude and Codex
  persisted blobs to pin the read boundary).
- [ ] 3.4 Have `mock-api.ts` delegate to the shared normalizer temporarily (still
  present) so behavior is provably unchanged before call-site migration.

## 4. Phase 2 — retire the compat shim (single owner)

- [ ] 4.1 Add a typed chat adapter (or inline typed tRPC + normalizer) for the
  chat surface currently behind `api.agents.*` / `api.useUtils`.
- [ ] 4.2 Migrate the call sites to the typed owner: `agents-content.tsx`,
  `active-chat.tsx`, `agent-diff-view.tsx`, `sub-chat-selector.tsx`,
  `agents-subchats-sidebar.tsx`.
- [ ] 4.3 Inventory web-only stub consumers and move the genuine stubs
  (stripe/user/claudeCode/agentInvites/repositorySandboxes) to
  `src/renderer/lib/web-stubs.ts` with identical return shapes; delete unused.
- [ ] 4.4 Delete `src/renderer/lib/mock-api.ts`; update `CLAUDE.md` and
  `docs/OWNERSHIP_MAP.md` to point at the new owners (persisted-message normalizer
  = hydration owner; `runtime-event-state.ts` stays the live owner; main writers
  noted as read-side-governed, write-side adoption deferred).
- [ ] 4.5 Add an `assertChatMessageModelOwner` assertion to
  `scripts/check-architecture-guards.mjs` that fails if `mock-api.ts` exists, if
  the persisted normalizer is exported from more than one module, or if any removed
  call-site import path reappears.

## 5. Phase 3 — remove boundary casts

- [ ] 5.1 Type `UIMessageChunk` in `ipc-chat-transport.ts` and
  `acp-chat-transport.ts`; narrow part-union access instead of `(part as any)`.
  Add a typed transport-seam adapter that converts canonical ⇄ AI SDK `UIMessage`
  (canonical optional-parts/local-parts ↔ `UIMessage` required-parts), so local
  parts pass through opaquely and only the renderer interprets them.
- [ ] 5.2 Remove `as any`/`@ts-ignore` at message seams in `message-store.ts` and
  `active-chat.tsx`, editing only type boundaries (no control-flow/render change).
- [ ] 5.3 Verify no parallel normalization path remains: `mock-api.ts` gone, one
  hydration normalizer, one shared copy each of `normalizeCodexToolPart` /
  `normalizeAcpParts`, and `metadata`/state access is typed.

## 6. Validation

- [ ] 6.1 Run the new normalizer characterization tests, the part-union structural
  test, and existing chat/store tests.
- [ ] 6.2 Run `bun run ts:check`.
- [ ] 6.3 Run the architecture guard check, including the new
  `assertChatMessageModelOwner` assertion, and confirm it fails on a deliberately
  reintroduced `mock-api.ts` / second normalizer.
- [ ] 6.4 Run `openspec validate refactor-chat-message-model --strict --no-interactive`.
- [ ] 6.5 Smoke-test chat hydration for Claude and Codex/ACP histories to confirm
  rendered messages, tools, and diffs are unchanged.
