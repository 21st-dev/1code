# Change: Refactor command settings ownership

## Why
Settings currently splits command ownership across two tabs: Commands shows a
read-only Command Guide, while local command create/edit/delete actions live
inside the Skills tab. This makes the tab named Commands unable to manage
commands and duplicates the local command list.

## What Changes
- Make Settings > Commands the canonical surface for local command files.
- Keep runtime CLI detection, plugin command summaries, and the official command
  index in Commands as read-only reference/diagnostic sections.
- Remove the Commands sub-view and command CRUD from Settings > Skills.
- Rename the page-level Command Guide copy to Commands while preserving
  reference-only labels for official/runtime/plugin sections.
- Add an architecture guard preventing Skills from depending on command CRUD
  procedures.

## Impact
- Affected specs: command-guide, settings-information-architecture
- Affected code:
  - `src/renderer/components/dialogs/settings-tabs/agents-command-guide-tab.tsx`
  - `src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - targeted tests/guards under `tests/`
