# Long Text Context Attachments Design

## Context
The app already has a defensive paste path: large pasted text is not inserted into the contentEditable editor because that can freeze the UI. Instead, it is written to a local pasted-text file and represented in the message as a custom `pasted:` mention. The gap is that the send pipeline treats that mention as display metadata, not as a guaranteed runtime context payload.

The desired behavior is not a full document-ingestion system. It is a reliable local-first bridge from "user pasted a long text block" to "the selected runtime received the text as explicit context".

## Goals
- Prevent editor freezes from large pasted text.
- Make pending and sent long text context visible to the user.
- Keep full long text bodies out of renderer state, localStorage drafts, and message JSON.
- Resolve attachment content in the main process, not in the renderer.
- Use one runtime-neutral metadata shape for Claude Code, Codex, and OpenAI-compatible provider paths.
- Inject resolved text into runtime prompts in a deterministic, bounded format for the first implementation.
- Block oversize sends clearly instead of silently truncating or pretending the full text was sent.

## Non-Goals
- Do not build general binary/document upload handling.
- Do not implement image or screenshot attachment lifecycle; that remains covered by `add-rich-chat-attachments`.
- Do not add vector search or RAG in the first implementation.
- Do not rely on runtime-specific file-reference syntax as the only delivery mechanism.
- Do not send staged long text to any provider before the user sends the message.

## Attachment Model
Renderer and persisted message state should carry metadata only:

```ts
type LongTextAttachment = {
  id: string
  kind: "pasted" | "chatHistory"
  filename: string
  byteLength: number
  preview: string
  localRef: string
  createdAt: string
}
```

`localRef` is opaque to the renderer. It is not an arbitrary filesystem path and must be resolved by the main process.

## Local Storage Lifecycle
1. User pastes text above the large-paste threshold or continues a chat with history handoff.
2. Renderer sends the text to the main process for staging.
3. Main process validates text size and writes it to an app-managed location.
4. Main process returns `LongTextAttachment` metadata.
5. Renderer stores the metadata in pending input, drafts, queue items, and persisted user message parts.
6. On send, the selected transport sends attachment refs with the user message request.
7. Main process resolves refs, validates aggregate size, injects prompt context, and starts the runtime request.
8. Cleanup may remove unreferenced staged attachments after draft deletion, message deletion, or a retention window.

Recommended storage root:

```text
{userData}/long-text-attachments/<chatId>/<subChatId>/<attachmentId>.txt
```

## Size Limits
Use conservative initial defaults:

- Single long text attachment: 1 MiB.
- Aggregate long text attachments per send: 3 MiB.
- Inline paste remains small and editor-oriented.

Oversize input should be blocked with a clear message. The first implementation should not auto-truncate because truncation can create false confidence that the full text was included.

## Message Parts
New code should prefer a metadata part instead of embedding the custom mention token as the source of truth:

```ts
type LongTextAttachmentPart = {
  type: "long-text-attachment"
  attachmentId: string
  kind: "pasted" | "chatHistory"
  filename: string
  byteLength: number
  preview: string
  localRef: string
}
```

The UI may still render a friendly pasted-text chip or summary, but runtime delivery should use the attachment part/refs rather than parsing `@[pasted:...]` from normal text.

## Prompt Injection Format
For the first implementation, all runtimes receive resolved text through a bounded prompt block:

```text
<attached_text id="..." kind="pasted" filename="pasted_123.txt" bytes="38120">
...
</attached_text>
```

If multiple attachments are present, preserve the user-visible order and include each block before the user's typed prompt.

This format is intentionally runtime-neutral. It works for Claude Code, Codex, and provider-backed chat without waiting for a common native file-input API.

## Runtime Adapters
- Claude Code path: `IPCChatTransport` should pass metadata refs to the main process; `claude.ts` resolves and prepends prompt blocks before invoking the SDK.
- Codex path: `ACPChatTransport` should pass metadata refs to the main process; `codex.ts` resolves and prepends prompt blocks before `streamText`.
- OpenAI-compatible/provider profile paths: keep using the same prompt text produced by the router unless a later provider-specific file API is added.

Runtime-specific `@file` or native file input can be added later as an optimization. It must preserve the same user-visible guarantee: if the UI says included, the runtime gets the content.

## UI Behavior
- Pending input shows removable long text context cards with filename, size, and preview.
- Sent user messages show a compact long text context summary.
- Deleting a pending card removes it from the pending send.
- Oversize staging or send failures show a blocking error.
- Attachment-only messages are valid if at least one ready long text attachment exists.

## Migration and Compatibility
- Existing `pasted:` and `chatHistory:` mention tokens may continue to render for older messages.
- New messages should write metadata parts and avoid using mention tokens as the runtime source of truth.
- The old `writePastedText` endpoint can be migrated or wrapped by the new staging API.

## Risks and Mitigations
- Risk: Prompt injection of multi-MiB text can consume model context quickly.
  - Mitigation: enforce aggregate limits and show size in UI.
- Risk: Full pasted text leaks into logs.
  - Mitigation: log ids, byte counts, and filenames only.
- Risk: Renderer stores full text in draft/localStorage by accident.
  - Mitigation: add tests around draft/message serialization.
- Risk: Runtime paths drift and one provider receives only metadata.
  - Mitigation: add transport/router tests for Claude and Codex prompt construction.

## Open Questions
- Should the initial single-attachment limit stay at 1 MiB, or should internal tester builds allow 2 MiB?
- Should sent long text attachments be retained indefinitely with the chat, or should old attachment bytes be pruned after export/archive?
