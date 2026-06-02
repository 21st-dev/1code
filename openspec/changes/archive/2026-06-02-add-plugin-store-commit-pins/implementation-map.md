# Implementation Map

This map defines the small-commit order for Phase 6 after Phase 5 is implemented and verified.

## Commit 1: Shared Store Candidate Model
Files:

- `src/shared/plugin-store-pins.ts`
- `src/shared/plugin-update-review.ts`
- `tests/plugin-store-pins.test.ts`

Scope:

- Add store catalog, candidate, immutable source pin, package hash, approval, and backup metadata types.
- Validate full git commit SHAs and reject `latest`, branch names, unresolved tags, and remote `developer-trusted-code`.
- Add candidate status values such as `not-installed`, `installed-current`, `update-available`, `blocked-invalid-pin`, and `review-required`.

Verification:

- `bun test tests/plugin-store-pins.test.ts tests/plugin-update-review.test.ts`

## Commit 2: Candidate Review And Diff
Files:

- `src/shared/plugin-store-pins.ts`
- `src/shared/plugin-update-review.ts`
- `src/main/lib/plugins/review-scan.ts`
- `tests/plugin-store-pins.test.ts`
- `tests/plugin-update-review.test.ts`

Scope:

- Build candidate review documents without executing plugin code.
- Compare candidate metadata against installed review documents.
- Include target mode, permissions, MCP declarations, controlled UI declarations, source pin, and package hash in bounded diffs.

Verification:

- `bun test tests/plugin-store-pins.test.ts tests/plugin-update-review.test.ts`

## Commit 3: Store Registry And Preview APIs
Files:

- `src/main/lib/plugins/store-pins.ts`
- `src/main/lib/plugins/update-review-state.ts`
- `src/main/lib/trpc/routers/plugins.ts`
- `tests/plugin-store-pins.test.ts`

Scope:

- Add local store catalog registry.
- Add read-only preview APIs for pinned candidates.
- Store candidate preview metadata in local review state when needed.
- Recompute candidate metadata in main process; renderer-provided candidate data is never trusted.

Verification:

- `bun test tests/plugin-store-pins.test.ts tests/plugin-safe-mode-runtime.test.ts`

## Commit 4: Approval And Backup-First Writes
Files:

- `src/main/lib/plugins/store-pins.ts`
- `src/main/lib/plugins/update-review-state.ts`
- `src/main/lib/trpc/routers/plugins.ts`
- `tests/plugin-store-pins.test.ts`

Scope:

- Store exact-candidate approval bound to store entry id, commit pin, package hash, and candidate fingerprint.
- Add backup-first install/update writes gated on current approved candidate.
- Validate extraction paths, symlink containment, and package directory boundaries.
- Keep MCP approvals, controlled UI action grants, and developer trusted-code separate after install/update.

Verification:

- `bun test tests/plugin-store-pins.test.ts tests/plugin-safe-mode-runtime.test.ts`

## Commit 5: Doctor / Debug
Files:

- `src/shared/plugin-doctor.ts`
- `src/main/lib/trpc/routers/plugins.ts`
- `tests/plugin-doctor.test.ts`

Scope:

- Report invalid mutable pins, missing hashes for write actions, stale approvals, candidate diffs, target-mode policy blocks, and backup metadata.
- Avoid `verified safe` and `marketplace trusted` wording.

Verification:

- `bun test tests/plugin-doctor.test.ts tests/plugin-store-pins.test.ts`

## Commit 6: Settings UI
Files:

- `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
- `src/renderer/lib/i18n/dictionaries.ts`
- `tests/plugin-target-mode-ui.test.ts`
- `tests/i18n-dictionary.test.ts`

Scope:

- Extend update review/source panels with store pin rows, candidate status, bounded diff, approval action, and separate install/update action.
- Show that commit pins improve reproducibility and do not prove safety.
- Keep install/update unavailable for mutable pins and remote developer-trusted-code candidates.

Verification:

- `bun test tests/plugin-target-mode-ui.test.ts tests/i18n-dictionary.test.ts`

## Commit 7: Final Verification And Tasks
Files:

- `openspec/changes/add-plugin-store-commit-pins/tasks.md`

Scope:

- Run full verification.
- Mark completed tasks only after evidence exists.

Commands:

- `bun run test`
- `bun run ts:check`
- `openspec validate add-plugin-store-commit-pins --strict --no-interactive`
- `git diff --check`

Smoke:

- Use a clean QA `LOCUS_USER_DATA_DIR`.
- Add a temporary pinned store candidate.
- Confirm mutable `latest` is blocked.
- Preview a pinned candidate and approve exact candidate.
- Change package hash or commit and confirm approval becomes stale.
- Install/update only after approval.
- Confirm MCP and controlled UI remain separately gated.
- Record screenshot and video.
