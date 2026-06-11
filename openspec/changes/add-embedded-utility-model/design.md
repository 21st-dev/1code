## Context
The app is a local-first Electron desktop coding-agent client. It already supports local project state, encrypted provider credentials, Ollama helper generation, OpenAI-compatible utility provider settings, and a local-only cloud guard. The missing piece is a product-owned local helper model that can run without requiring a separate Ollama install.

The embedded model should be treated as a utility subsystem, not as the product's main agent brain. It should help with bounded text generation such as titles, branch names, workspace names, file rename suggestions, and commit-message drafts.

## Goals / Non-Goals
- Goals:
  - Let users enable a local utility model with one obvious recommended path.
  - Keep model downloads explicit, verifiable, and removable.
  - Keep generated helper text local when the embedded model succeeds.
  - Reuse the existing utility-generation surfaces instead of creating a separate chat product.
  - Preserve deterministic fallbacks so helper workflows still work without a model.
- Non-Goals:
  - Do not run full agent chats through the embedded model.
  - Do not make users choose from a complex model marketplace in the MVP.
  - Do not bundle model weights in the default installer.
  - Do not support every platform in the first implementation slice.

## Decisions
- Decision: Use a llama.cpp-compatible sidecar runtime for the first implementation.
  - Reason: GGUF model files are common, quantized models can be small enough for utility tasks, and a sidecar keeps native inference isolated from the Electron renderer.
  - Alternative considered: MLX. This is attractive on Apple Silicon but does not cover Windows/Linux and would make cross-platform support harder.
  - Alternative considered: onnxruntime. This is viable, but model packaging and text-generation server behavior are less aligned with existing local LLM workflows than llama.cpp.

- Decision: Download model files into app-managed user data instead of shipping model weights in the app bundle.
  - Reason: Installer size, model licensing, update cadence, and user storage control are better handled as explicit downloads.
  - Target location: `{app.getPath("userData")}/local-models/`.

- Decision: Keep model choice simple by default.
  - Reason: Most users need the utility feature to work, not a model-selection research task.
  - MVP UI should show a recommended model first, optional presets only when useful, and an advanced custom GGUF picker behind a secondary affordance.

- Decision: Expose embedded generation only through main-process tRPC procedures.
  - Reason: Renderer code should not manage model file paths, sidecar ports, process lifecycle, or raw local model server details.

- Decision: Default the utility routing to local-first when a local utility model is enabled.
  - Proposed order: embedded local model, Ollama, configured purpose-specific API provider, deterministic fallback.
  - Rationale: Enabling and installing the local utility model is an explicit privacy-oriented user choice.
  - Implementation may still expose an advanced per-purpose preference later if users want a configured API provider to take priority.

## Architecture
### Model Catalog
Create a versioned catalog file that lists supported model options:

```ts
type LocalUtilityModelCatalogEntry = {
  id: string
  displayName: string
  description: string
  runtime: "llama.cpp"
  format: "gguf"
  recommended: boolean
  downloadUrl: string
  sha256: string
  sizeBytes: number
  licenseName: string
  licenseUrl: string
  hardwareNotes?: string
}
```

The app must display size, source, and license before download. The implementation should keep the initial catalog small: one recommended model is enough for the MVP.

### Sidecar Lifecycle
The main process owns sidecar lifecycle:

1. Check installed model metadata and verified hash.
2. Start the sidecar on demand when a utility generation request arrives.
3. Bind only to `127.0.0.1` on a dynamic local port.
4. Apply short utility-oriented limits such as max tokens, timeout, and small context windows.
5. Stop the process on app quit and optionally after an idle timeout.

Renderer-visible APIs should expose status, download progress, installed model metadata, and high-level generation results, not the raw sidecar URL.

### Utility Router
Introduce a small utility-generation abstraction:

```ts
type UtilityGenerationPurpose =
  | "sub_chat_title"
  | "commit_message"
  | "branch_name"
  | "workspace_name"
  | "file_rename_suggestion"

type UtilityGenerationRequest = {
  purpose: UtilityGenerationPurpose
  prompt: string
  maxTokens: number
  timeoutMs: number
}
```

Existing utility flows should call this abstraction instead of each owning their own provider chain. The first implementation can migrate `generateSubChatName` first, then `generateCommitMessage`.

### Storage
Persist local model settings in SQLite or an existing settings store:

- enabled state
- selected catalog model id
- installed model path
- installed model sha256
- download status metadata
- custom GGUF path, if user selected one

Secrets are not expected for embedded local models. Download URLs and license metadata are not secrets.

## Risks / Trade-offs
- App packaging and notarization can fail if sidecar binaries are not signed or included correctly.
  - Mitigation: Start with macOS arm64 only and validate release packaging before adding platforms.
- Model licensing can be ambiguous.
  - Mitigation: Catalog entries must include license metadata and require explicit user action before download.
- Local inference can use too much memory or CPU.
  - Mitigation: Choose a small default model, expose clear size notes, enforce request timeouts, and let users stop/delete the model.
- Small models may produce poor commit messages.
  - Mitigation: Keep strict output cleaning and deterministic fallbacks; integrate one utility task at a time.
- Model download sources may change.
  - Mitigation: Verify sha256 and fail closed on mismatch. Do not run unverified model files.

## Migration Plan
1. Add OpenSpec approval for the capability. This current change stops at proposal/spec/design/tasks.
2. Implement macOS arm64 sidecar packaging and model catalog download management.
3. Add the main-process local model service and tRPC router.
4. Add Settings UI for `Local Utility Model`.
5. Route `generateSubChatName` through the local utility router.
6. Route `generateCommitMessage` after title generation is verified.
7. Evaluate Windows/Linux support and additional utility purposes separately.

## Open Questions
- Which exact default model should the initial catalog recommend after license and performance checks?
- Should commit-message generation prefer an explicitly configured API provider over the embedded model by default, or should enabling the embedded model always imply local-first routing?
- Should custom GGUF files be copied into app-managed storage or referenced in place?
- What memory ceiling should the app enforce for low-RAM machines?
