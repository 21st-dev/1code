# Change: Add external skill collections to the registry

## Why
Some useful skill sources are collections or full workflow packs, not single verified packages. The Skills registry needs a way to surface these sources without pretending they are safe one-click installs.

## What Changes
- Add browse-only external collection entries to the bundled skill registry manifest.
- Show external collections in Settings > Skills with source links, runtime hints, and install guidance.
- Keep external collections read-only and non-installable from the registry action buttons.

## Impact
- Affected specs: `skill-registry`
- Affected code: `resources/skill-registry/manifest.json`, `src/main/lib/skills/registry.ts`, `src/main/lib/trpc/routers/skills.ts`, `src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`, `src/renderer/lib/i18n/dictionaries.ts`
