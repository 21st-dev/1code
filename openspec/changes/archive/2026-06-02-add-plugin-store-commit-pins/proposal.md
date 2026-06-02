# Change: Add plugin store commit pins

## Why
Locus can already show local plugin source pins and local update review diffs, but it does not yet model a plugin store entry as a reviewed immutable source. Users need plugin marketplace governance that says exactly which commit or content hash is being reviewed before install or update.

## What Changes
- Add a Locus plugin store catalog model with immutable reviewed commit pins and optional content hashes.
- Add marketplace review previews that compare installed plugin metadata with a pinned candidate before any install or update write.
- Require explicit user approval before installing or replacing a plugin package from the store.
- Record store review decisions, pinned source metadata, package hashes, and bounded diffs in local plugin review state.
- Keep store packages in manifest-only or controlled-UI mode unless a separate developer-trusted local source flow is used.
- Add Doctor/Debug, Settings UI, i18n, tests, and smoke evidence for store pin and update-review behavior.

## Impact
- Affected specs: `runtime-plugins`
- Affected code:
  - `src/shared/plugin-update-review.ts`
  - `src/shared/plugin-doctor.ts`
  - `src/main/lib/plugins/*`
  - `src/main/lib/trpc/routers/plugins.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - `tests/plugin-*.test.ts`
