# Change: Add Locus Plugin Target Modes

## Why

Locus already shows runtime-scoped Claude Code and Codex plugin packages, but the UI and backend do not yet explain whether a package is metadata-only, controlled by Locus, or trusted local code. Codex++ is useful as a reference for manifest governance, safe mode, diagnostics, and reviewed commit pins, but its app patching and local-code execution model is not suitable as Locus's default plugin trust model.

## What Changes

- Add Locus-native plugin target modes:
  - `manifest-only`: read and display plugin metadata, components, MCP declarations, source, trust, and update posture without executing plugin code.
  - `controlled-ui`: future Locus-owned extension points for settings pages, workbench panels, and commands backed by explicit Locus APIs.
  - `developer-trusted-code`: future opt-in developer mode for local fully trusted code, clearly labeled as equivalent to running local code.
- Add update handling rules for plugin updates, reference-repo updates, Codex Desktop updates, and Codex CLI/runtime updates.
- Extend Settings > Plugins so users can see target mode, trust posture, read-only status, and update/review guidance without implying Codex++ compatibility.
- Add diagnostics and safe-mode planning requirements for plugin startup recovery and permission changes.
- Keep plugin execution, native loading, app patching, Codex++ compatibility, and third-party marketplace install flows out of this change unless a later OpenSpec explicitly approves them.

## Impact

- Affected specs:
  - `runtime-plugins`
- Affected code:
  - `src/main/lib/plugins/index.ts`
  - `src/main/lib/trpc/routers/plugins.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - focused tests under `tests/`
- Verification:
  - OpenSpec strict validation
  - targeted Bun tests for plugin metadata/target-mode classification
  - `bun run test`
  - `bun run ts:check`
  - desktop UI smoke for Settings > Plugins
  - screenshot/video evidence for the final plugin UI state
