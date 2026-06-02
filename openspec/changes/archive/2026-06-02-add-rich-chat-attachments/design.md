# Rich Chat Attachments Design

## Context
The current app can identify images in the renderer, convert them to base64, display chips, and pass image data through Claude and Codex transport paths. The gaps are product-level consistency and data lifecycle: image-only sends are uneven, attachment bytes can be embedded in renderer/message state, and the UI does not yet explain provider/model limitations.

Official Codex-like workflows are not only "upload a file"; they make context explicit. Users can share screenshots, wireframes, diagrams, selected code, and other local context while staying inside the coding tool. This change focuses on the local rich attachment layer. Cloud task handoff, remote control, and a VS Code companion extension remain out of scope.

## Goals
- Make image attachment behavior consistent across new chats, active chats, queued messages, and drafts.
- Let users add images from file picker, drag-and-drop, and clipboard paste.
- Allow image-only messages wherever normal chat sends are allowed.
- Show attachment context clearly before send and in persisted user messages.
- Keep attachment storage local-first and avoid long-lived base64 in renderer storage.
- Warn or block when the selected provider/model cannot process images.
- Preserve existing file mention and selected-text context behavior.

## Non-Goals
- Do not build Codex cloud task handoff.
- Do not build a VS Code extension or remote-control protocol.
- Do not add arbitrary binary document ingestion beyond current file mention/text context behavior.
- Do not add image generation or editing.
- Do not promise vision support for providers/models that do not support images.
- Do not silently upload images before the user sends the message.

## Attachment Model
Use a small metadata object in renderer/message state and keep bytes in a local attachment store.

```ts
type ChatAttachment = {
  id: string
  kind: "image"
  source: "file-picker" | "drag-drop" | "clipboard" | "screenshot"
  filename: string
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/bmp"
  sizeBytes: number
  width?: number
  height?: number
  sha256?: string
  localRef: string
  previewUrl?: string
  status: "staging" | "ready" | "failed"
  error?: string
}
```

`localRef` should be opaque to the renderer. The main process resolves it to bytes when the user sends the message.

## Local Storage Lifecycle
1. User selects, drops, or pastes an image.
2. Renderer creates a temporary preview URL and requests main-process staging.
3. Main process validates media type and size, optionally normalizes or compresses the image, writes bytes to an app-controlled attachment directory, and returns metadata.
4. Renderer stores only metadata and preview information in drafts and message parts.
5. On send, transport sends attachment ids/refs to the main process.
6. Main process resolves attachment refs into provider-specific payloads.
7. Cleanup removes unreferenced staged attachments after draft deletion or a retention window.

Recommended storage root:

```text
{userData}/attachments/<chatId>/<subChatId>/<attachmentId>.<ext>
```

The renderer may still use base64 transiently for clipboard images if needed, but long-lived storage should be file-backed in the main process.

## Input Surfaces
The same attachment behavior should exist in:
- New chat form
- Active chat input
- Queue send path
- Force-send path
- Draft restore path

Supported input methods:
- attachment button with file picker
- drag-and-drop over the input surface
- clipboard paste from screenshots or copied image files

Image-only messages should be valid if at least one ready image attachment exists.

## Provider Capability Model
Add a provider/model capability map for the active chat provider:

```ts
type AttachmentCapability = {
  supportsImages: boolean
  maxImages: number
  maxImageBytes: number
  supportedMediaTypes: string[]
  disclosureKey: "local" | "remote-provider"
}
```

The UI should:
- allow staging images independent of provider selection;
- block send with a clear error if the selected provider/model cannot process images;
- show a concise warning when images will be sent to a remote provider;
- re-evaluate capability when the user changes provider/model.

## Message Parts
Keep compatibility with current `data-image` rendering while moving toward lightweight persisted parts:

```ts
type ImageAttachmentPart = {
  type: "attachment-image"
  attachmentId: string
  filename: string
  mediaType: string
  sizeBytes: number
  width?: number
  height?: number
}
```

During migration, transports may continue accepting `data-image` parts, but new code should prefer attachment refs and resolve bytes late in the main process.

## Guardrails
- Enforce a max image count per message.
- Enforce per-image and total attachment size limits.
- Show unsupported type errors before send.
- Deduplicate identical images by hash when practical.
- Avoid logging base64 or full local paths.
- Keep attachment staging local until explicit send.
- Preserve user ability to remove an attachment before send.

## Verification Strategy
- Unit-test attachment utility functions where they can run without Electron.
- Add renderer smoke checks for file picker, drag/drop, paste, remove, image-only send, and draft restore.
- Add transport-level tests or fixtures that verify Claude and Codex payloads receive resolved image bytes.
- Run an Electron smoke test for:
  - new chat with only an image
  - active chat with text plus image
  - queued image message during streaming
  - provider switch from image-capable to unsupported model

## Open Questions
- Should HEIC/HEIF be supported in the first release or converted through a later native image pipeline?
- What should the initial max image size and max image count be for Claude and Codex paths?
- Should staged unsent attachments be retained across app restarts or only as part of saved drafts?
