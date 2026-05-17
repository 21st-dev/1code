# Change: Add embedded utility model

## Why
Agent Code for Me already has small AI-assisted utility flows such as sub-chat naming and commit-message generation, but those flows currently depend on external APIs, Ollama, or deterministic fallbacks. A first-class embedded utility model would let the app handle low-risk helper text locally without requiring users to install Ollama or send small project context to a provider.

This proposal is planning-only for the current version. It defines the future implementation boundary and does not implement the runtime yet.

## What Changes
- Add an optional `Local Utility Model` capability for short helper-generation tasks.
- Bundle a per-platform local inference sidecar, starting with a llama.cpp-compatible runtime for macOS arm64.
- Store model files outside the app bundle in app-managed user data, with explicit user-triggered download, hash verification, and deletion.
- Provide a simple model-selection experience: one recommended default, a small preset list if needed, and an advanced custom GGUF path.
- Route supported utility tasks through the embedded model when enabled, with fallbacks to Ollama, configured API providers, and existing deterministic rules.
- Keep the embedded model out of main agent/chat execution. It is for utility text only, not autonomous code changes or full coding-agent reasoning.

## Impact
- Affected specs: `embedded-utility-model` (new)
- Affected code:
  - `resources/local-models/catalog.json`
  - `scripts/download-llama-sidecar.mjs`
  - `src/main/lib/local-model/**`
  - `src/main/lib/trpc/routers/local-model.ts`
  - `src/main/lib/trpc/routers/chats.ts`
  - `src/main/lib/trpc/routers/local-api-provider-config.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - `electron-builder.yml` / `package.json` build resources
- Validation:
  - `openspec validate add-embedded-utility-model --strict --no-interactive`
  - Future implementation must additionally run TypeScript/build checks and a local Electron smoke test.

## Non-Goals
- Do not ship a large model inside the default app installer.
- Do not replace Claude, Codex, custom providers, or Ollama for main agent chats.
- Do not add a broad model marketplace in the MVP.
- Do not implement Windows/Linux sidecar packaging in the first implementation slice.
- Do not automatically download model files without explicit user action.
