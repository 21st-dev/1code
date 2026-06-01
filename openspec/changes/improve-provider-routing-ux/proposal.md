# Change: Improve provider routing UX

## Why
The cc-switch reference shows provider routing as a fast, scannable management surface, while Locus currently places provider profile creation and diagnostics inside a narrow Settings column that wastes desktop width and truncates key fields.

## What Changes
- Adapt cc-switch-inspired provider preset chips, provider rows, runtime badges, and diagnostics hierarchy to Locus Settings > Models.
- Widen the Models settings content area so provider/runtime controls use available desktop width without shifting the main column into a cramped center strip.
- Keep the slice UI-only: no provider storage, secret handling, runtime binding, gateway, or external config writes change.
- Add focused tests and real smoke evidence for the adapted UI.

## Impact
- Affected specs: provider-routing-ux, ui-localization
- Affected code: `src/renderer/features/settings/settings-content.tsx`, `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`, `src/renderer/lib/i18n/dictionaries.ts`, UI/static tests
