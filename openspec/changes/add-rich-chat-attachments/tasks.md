## Status
In progress. The user explicitly resumed `add-rich-chat-attachments`.

## 1. Attachment Model and Storage
- [x] 1.1 Define shared attachment metadata types for renderer and main-process boundaries.
- [x] 1.2 Add a main-process attachment staging service with validation, local storage, and cleanup.
- [x] 1.3 Store draft/message attachment references without long-lived base64 payloads.
- [x] 1.4 Preserve compatibility with existing `data-image` message parts during migration.

## 2. Input UI
- [x] 2.1 Make new-chat and active-chat inputs share the same image acceptance rules.
- [x] 2.2 Support file picker, drag-and-drop, and clipboard paste for images in both input surfaces.
- [x] 2.3 Allow image-only sends in new chats, active chats, queued sends, and force sends.
- [x] 2.4 Add attachment preview, remove, loading, failed, size, and unsupported-type states.
- [x] 2.5 Keep file mentions and small text-file context behavior working alongside image attachments.

## 3. Provider Capability and Disclosure
- [x] 3.1 Add a provider/model image-capability map.
- [x] 3.2 Disable or block send with a clear message when the selected provider/model cannot process images.
- [x] 3.3 Show concise disclosure when images will be sent to a remote provider.
- [x] 3.4 Re-check attachment capability when provider or model selection changes.

## 4. Send Pipeline
- [x] 4.1 Resolve staged image refs into Claude image payloads in the main process.
- [x] 4.2 Resolve staged image refs into Codex image payloads in the main process.
- [x] 4.3 Preserve image refs through queue processing and auth retry flows.
- [x] 4.4 Ensure transport/server logs never include base64 image bytes.

## 5. Message Rendering and Drafts
- [x] 5.1 Render sent image attachments from local refs in user bubbles.
- [x] 5.2 Restore image attachments from drafts without losing preview/remove controls.
- [x] 5.3 Clean up unsent staged attachments after draft deletion or configured retention.
- [x] 5.4 Keep attachment-only summary text accurate and localized-ready.

## 6. Verification
- [ ] 6.1 Verify new chat can send an image-only message.
- [ ] 6.2 Verify active chat can send text plus image and image-only messages.
- [ ] 6.3 Verify drag-and-drop and clipboard screenshot paste both stage images.
- [ ] 6.4 Verify queued image messages send after the active stream finishes.
- [ ] 6.5 Verify unsupported provider/model paths show a clear blocking message.
- [ ] 6.6 Verify no long-lived localStorage or SQLite message JSON contains base64 image bytes for new attachments.
- [ ] 6.7 Run `openspec validate add-rich-chat-attachments --strict --no-interactive`.
