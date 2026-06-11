# Tasks

This change is proposal-only in the current version. Do not implement these tasks until the proposal is reviewed and approved.

## 1. Runtime Packaging
- [ ] 1.1 Select and document the initial llama.cpp sidecar version, license, and supported platform scope.
- [ ] 1.2 Add a download/build script for the sidecar binary with checksum verification.
- [ ] 1.3 Package the macOS arm64 sidecar through Electron build resources.
- [ ] 1.4 Verify packaged app startup and macOS signing/notarization behavior with the sidecar included.

## 2. Model Catalog and Storage
- [ ] 2.1 Add a small versioned local model catalog with one recommended default model.
- [ ] 2.2 Display model size, source, and license before download.
- [ ] 2.3 Download model files only after explicit user action.
- [ ] 2.4 Verify model sha256 before marking a model installed.
- [ ] 2.5 Store installed model metadata in app-managed local state.
- [ ] 2.6 Support model deletion and cleanup of partial downloads.
- [ ] 2.7 Add an advanced custom GGUF path after the recommended model path works.

## 3. Main Process Service
- [ ] 3.1 Add `src/main/lib/local-model/` service modules for catalog, downloads, verification, sidecar lifecycle, and generation.
- [ ] 3.2 Bind the sidecar only to `127.0.0.1` on a dynamic local port.
- [ ] 3.3 Add request timeouts, max-token limits, idle shutdown, and app-quit cleanup.
- [ ] 3.4 Add a tRPC router for local model status, download, delete, start, stop, and generate operations.
- [ ] 3.5 Keep raw sidecar ports and model paths out of renderer-owned state where practical.

## 4. Settings UI
- [ ] 4.1 Add a `Local Utility Model` section under Models settings.
- [ ] 4.2 Show recommended setup as the default path, not a broad model marketplace.
- [ ] 4.3 Show download progress, installed status, runtime status, and delete/stop controls.
- [ ] 4.4 Add bilingual copy while keeping specialist terms like `Model`, `GGUF`, `API`, and `Ollama` readable.

## 5. Utility Routing
- [ ] 5.1 Add a shared utility-generation abstraction for bounded helper tasks.
- [ ] 5.2 Route sub-chat title generation through embedded model, Ollama, configured API provider, then fallback.
- [ ] 5.3 Route commit-message generation after title generation is stable.
- [ ] 5.4 Add branch name, workspace name, and file rename suggestion purposes only after the first two flows are verified.
- [ ] 5.5 Keep embedded utility generation out of main Claude/Codex agent chat execution.

## 6. Safety and Documentation
- [ ] 6.1 Document that the embedded model is for utility text, not autonomous code changes.
- [ ] 6.2 Document model download source, license, storage location, and deletion behavior.
- [ ] 6.3 Preserve local-only cloud guard behavior and avoid official upstream hosted calls.
- [ ] 6.4 Keep API fallback disclosure for cases where diff context leaves the machine.

## 7. Validation
- [ ] 7.1 Run `openspec validate add-embedded-utility-model --strict --no-interactive`.
- [ ] 7.2 Run `bun run ts:check` after implementation.
- [ ] 7.3 Run `bun run build` after implementation.
- [ ] 7.4 Smoke test app startup without a model installed.
- [ ] 7.5 Smoke test explicit model download, verified install, local title generation, stop/delete, and fallback behavior.
