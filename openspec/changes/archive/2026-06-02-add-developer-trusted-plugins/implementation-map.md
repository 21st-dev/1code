# Implementation Map

This map defines the small-commit order for Phase 5 once the OpenSpec approval gate is cleared.

## Commit 1: Shared Developer Manifest And Gate
Files:

- `src/shared/plugin-developer-trusted.ts`
- `src/shared/plugin-target-modes.ts`
- `src/shared/plugin-safety-gates.ts`
- `tests/plugin-developer-trusted.test.ts`

Scope:

- Parse `.locus-plugin/developer.json` without executing code.
- Validate bounded strings, ids, capabilities, permissions, and local entry references.
- Reject remote URLs and unsupported target modes.
- Build a developer trust gate that includes safe mode, Developer Plugin Mode, reviewed fingerprint, local source ownership, entry containment, and trust acknowledgement.

Verification:

- `bun test tests/plugin-developer-trusted.test.ts tests/plugin-safety-gates.test.ts`

## Commit 2: Review Fingerprint And Executable Hash
Files:

- `src/shared/plugin-update-review.ts`
- `src/main/lib/plugins/review-scan.ts`
- `tests/plugin-update-review.test.ts`
- `tests/plugin-target-modes.test.ts`

Scope:

- Add developer manifest facts to review documents.
- Include canonical entry path and entry content hash in fingerprints.
- Ensure changing only entry file content makes previous trust stale.
- Add realpath containment tests for entry paths and symlink swaps.

Verification:

- `bun test tests/plugin-update-review.test.ts tests/plugin-target-modes.test.ts tests/plugin-developer-trusted.test.ts`

## Commit 3: Developer Source And Trust State
Files:

- `src/main/lib/plugins/update-review-state.ts`
- `src/main/lib/plugins/index.ts`
- `src/main/lib/trpc/routers/plugins.ts`
- `tests/plugin-developer-trusted.test.ts`

Scope:

- Store Developer Plugin Mode, local developer sources, and fingerprint-bound trust acknowledgements.
- Discover local developer plugin directories separately from Claude marketplaces and Codex cache.
- Add mutations for developer mode, source registration/removal, trust, and trust revocation.
- Recompute current plugin, realpaths, hashes, review state, safe mode, and trust status inside every mutation.

Verification:

- `bun test tests/plugin-developer-trusted.test.ts tests/plugin-safe-mode-runtime.test.ts`

## Commit 4: Fail-Closed Loader And Recovery
Files:

- `src/main/lib/plugins/developer-loader.ts`
- `src/main/index.ts`
- `src/main/lib/trpc/routers/plugins.ts`
- `tests/plugin-safe-mode-runtime.test.ts`

Scope:

- Add a minimal same-process loader that imports only contained local entrypoints after all gates pass.
- Provide a narrow API object for ergonomics, while keeping copy and tests clear that this is not a sandbox.
- Add forced safe-mode startup override before any developer plugin import.
- Record bounded load status and errors.

Verification:

- `bun test tests/plugin-safe-mode-runtime.test.ts tests/plugin-developer-trusted.test.ts`

## Commit 5: Doctor / Debug
Files:

- `src/shared/plugin-doctor.ts`
- `src/main/lib/trpc/routers/plugins.ts`
- `tests/plugin-doctor.test.ts`

Scope:

- Report Developer Plugin Mode, source status, trust state, executable hash status, gate state, load state, and load errors.
- Redact source code, provider secrets, OAuth tokens, and MCP secret values.

Verification:

- `bun test tests/plugin-doctor.test.ts tests/plugin-developer-trusted.test.ts`

## Commit 6: Settings UI
Files:

- `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
- `src/renderer/lib/i18n/dictionaries.ts`
- `tests/plugin-target-mode-ui.test.ts`
- `tests/i18n-dictionary.test.ts`

Scope:

- Add Developer Plugin Mode control near plugin safe mode.
- Add developer source and trust panels for local developer plugins only.
- Show blunt full-trust copy and avoid `safe`, `sandboxed`, `verified`, `marketplace trusted`, and `Codex++ compatible`.

Verification:

- `bun test tests/plugin-target-mode-ui.test.ts tests/i18n-dictionary.test.ts`

## Commit 7: Final Verification And Tasks
Files:

- `openspec/changes/add-developer-trusted-plugins/tasks.md`

Scope:

- Run full verification.
- Mark completed tasks only after evidence exists.

Commands:

- `bun run test`
- `bun run ts:check`
- `openspec validate add-developer-trusted-plugins --strict --no-interactive`
- `git diff --check`

Smoke:

- Use a clean QA `LOCUS_USER_DATA_DIR`.
- Register a temporary local developer plugin.
- Confirm unreviewed and untrusted states block loading.
- Mark reviewed, trust current fingerprint, and confirm load status.
- Modify entry content and confirm trust becomes stale.
- Enable forced safe mode and confirm no import before recovery UI.
- Record screenshot and video.
