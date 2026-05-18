# Change: Complete UI localization coverage

## Why
The app already has a typed English and Simplified Chinese localization layer, but the first bilingual pass intentionally allowed incremental migration. Several user-visible product surfaces still contain app-authored hardcoded English, which makes the Chinese interface feel unfinished.

## What Changes
- Expand the localization requirement from incremental coverage to common product-surface coverage.
- Migrate remaining app-authored labels, placeholders, tooltips, dialogs, and toast shells in primary renderer surfaces to `useI18n`.
- Keep professional developer-tool terminology readable in English where that is clearer for this audience.
- Keep user-authored content, AI-generated content, commands, file paths, git diffs, raw tool output, model IDs, and debug metadata outside the translation sweep.
- Add a repeatable hardcoded-string audit command and update the follow-up record with intentional exclusions.

## Impact
- Affected specs: `ui-localization`
- Affected code:
  - `src/renderer/lib/i18n/dictionaries.ts`
  - Settings secondary tab components
  - Chat/sidebar peripheral components
  - Shared renderer utility dialogs and toasts
- Validation:
  - `openspec validate complete-ui-localization-coverage --strict --no-interactive`
  - `openspec validate ui-localization --strict --no-interactive`
  - `bun run ts:check`
  - Hardcoded English sweep over `src/renderer`
