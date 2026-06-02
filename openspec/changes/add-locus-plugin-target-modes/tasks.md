## 1. OpenSpec

- [x] 1.1 Validate current `runtime-plugins` spec and active change conflicts.
- [x] 1.2 Add target-mode proposal, design, tasks, and spec delta.
- [x] 1.3 Run `openspec validate add-locus-plugin-target-modes --strict --no-interactive`.
- [x] 1.4 Commit the OpenSpec slice separately.

## 2. Metadata Model

- [x] 2.1 Add shared/plugin-library target-mode types for `manifest-only`, `controlled-ui`, and `developer-trusted-code`.
- [x] 2.2 Classify existing Claude and Codex discovered packages as `manifest-only`.
- [x] 2.3 Add trust/review/update guidance fields without exposing secrets or reading plugin code beyond existing metadata/component scans.
- [x] 2.4 Add tests for plugin target-mode classification and source handling.
- [x] 2.5 Commit the metadata slice separately.

## 3. Settings UI

- [x] 3.1 Add compact target-mode, runtime, trust, and execution-status badges to plugin list/detail.
- [x] 3.2 Add a detail section explaining what Locus will and will not do for the selected target mode.
- [x] 3.3 Add update-handling copy for plugin updates, Codex++ reference updates, Codex Desktop updates, and Codex CLI/runtime updates.
- [x] 3.4 Keep Codex plugin controls read-only and avoid fake enable/update buttons.
- [x] 3.5 Add English and Chinese localization strings.
- [x] 3.6 Add UI source tests for copy, labels, and no fake Codex execution controls.
- [x] 3.7 Commit the UI slice separately.

## 4. Diagnostics And Safe Mode Planning

- [x] 4.1 Add non-executing diagnostics metadata for invalid/missing plugin roots and permission/scope changes.
- [x] 4.2 Add planned safe-mode wording that makes clear no arbitrary code is executed in this change.
- [x] 4.3 Add tests for diagnostic labels and safe-mode copy.
- [x] 4.4 Commit the diagnostics slice separately.

## 5. Verification

- [x] 5.1 Run targeted tests for plugin metadata/UI and i18n.
- [x] 5.2 Run `bun run test`.
- [x] 5.3 Run `bun run ts:check`.
- [x] 5.4 Run `git diff --check`.
- [x] 5.5 Start the local app/dev server path used by this repo.
- [x] 5.6 Use browser/desktop verification to inspect Settings > Plugins.
- [x] 5.7 Capture screenshot and recording/video evidence of the plugin UI.
- [x] 5.8 Review UI/UX issues after the real smoke and fix any found issues in a separate commit.
- [x] 5.9 Commit verification/UX follow-up separately if fixes are needed.
