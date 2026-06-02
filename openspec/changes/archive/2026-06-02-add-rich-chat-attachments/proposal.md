# Change: Add rich chat attachments

## Status
Complete. Implementation, automated verification, and local Electron UI smoke checks have passed.

## Why
Agent Code for Me already has a basic image attachment path, but the experience is not yet consistent across new chats, active chats, queued sends, drafts, and provider capability differences. To feel closer to Codex app and IDE-extension workflows, image and screenshot sharing should be reliable, visible, local-first, and clear about what context will be sent.

## What Changes
- Add a first-class rich attachment model for chat input and persisted messages.
- Support image attachment from file picker, drag-and-drop, and clipboard paste in both new-chat and active-chat surfaces.
- Support image-only messages anywhere text messages are valid.
- Add attachment previews, remove actions, loading/error states, and count/size/type guardrails.
- Add provider capability checks so unsupported models clearly explain why an attachment cannot be sent.
- Move persisted image content out of message JSON where possible, using local attachment references and resolving bytes in the main process at send time.
- Keep existing file mentions and small text-file context behavior compatible with the new attachment UI.

## Impact
- Affected specs: `agent-chat-attachments`
- Affected code:
  - `src/renderer/features/agents/hooks/use-agents-file-upload.ts`
  - `src/renderer/features/agents/main/new-chat-form.tsx`
  - `src/renderer/features/agents/main/chat-input-area.tsx`
  - `src/renderer/features/agents/main/active-chat.tsx`
  - `src/renderer/features/agents/components/queue-processor.tsx`
  - `src/renderer/features/agents/lib/ipc-chat-transport.ts`
  - `src/renderer/features/agents/lib/acp-chat-transport.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/trpc/routers/codex.ts`
  - likely new main-process attachment service/router
  - chat draft and message rendering utilities
- Security/privacy considerations:
  - Attachment bytes must stay local until an explicit send.
  - Renderer-visible state should avoid storing plaintext base64 in localStorage or long-lived message JSON.
  - Provider warnings must make it clear when images leave the machine for model processing.
