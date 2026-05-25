# Change: Add long text context attachments

## Why
Large pasted text currently avoids freezing the editor by being written to a local pasted-text file, but the chat send path only preserves a custom mention token that runtimes do not reliably resolve into text context. Users can believe a long paste was sent while Claude Code, Codex, or provider-backed chat only receives a reference-like token.

## What Changes
- Add a first-class long text context attachment model for pasted text and provider handoff history.
- Store long text content in an app-managed local attachment store and keep renderer/message state limited to metadata.
- Enforce explicit per-attachment and per-message text size limits before send.
- Resolve long text attachment refs in the main process and inject the resolved text into runtime prompts in a consistent bounded format.
- Preserve current short-text paste behavior and existing file/image attachment behavior.
- Show pending and sent long text context clearly so users know whether the full text was included.

## Impact
- Affected specs: `agent-long-text-context`
- Affected code:
  - `src/renderer/features/agents/utils/paste-text.ts`
  - `src/renderer/features/agents/hooks/use-pasted-text-files.ts`
  - `src/renderer/features/agents/main/new-chat-form.tsx`
  - `src/renderer/features/agents/main/chat-input-area.tsx`
  - `src/renderer/features/agents/main/active-chat.tsx`
  - `src/renderer/features/agents/components/queue-processor.tsx`
  - `src/renderer/features/agents/lib/message-parts.ts`
  - `src/renderer/features/agents/lib/ipc-chat-transport.ts`
  - `src/renderer/features/agents/lib/acp-chat-transport.ts`
  - `src/main/lib/trpc/routers/files.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/trpc/routers/codex.ts`
  - likely a new main-process long text attachment helper or router
- Related pending work:
  - This is narrower than `add-rich-chat-attachments`, which remains a deferred image/rich-attachment proposal.
- Security/privacy considerations:
  - Long text bytes stay local until explicit send.
  - Renderer-visible state and persisted message JSON should not contain full long text bodies.
  - Runtime prompts must not log full attached text content.
