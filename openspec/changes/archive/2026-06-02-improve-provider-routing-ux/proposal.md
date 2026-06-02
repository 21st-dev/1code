# Change: Improve provider routing UX

## Why
The cc-switch reference shows provider routing as a fast, scannable management surface, while Locus currently places provider profile creation and diagnostics inside a narrow Settings column that wastes desktop width and truncates key fields.

## What Changes
- Adapt cc-switch-inspired provider preset chips, provider rows, runtime badges, and diagnostics hierarchy to Locus Settings > Models.
- Widen the Models settings content area so provider/runtime controls use available desktop width without shifting the main column into a cramped center strip.
- Require token re-entry when editing a saved provider profile's endpoint, protocol, or auth mode so UI edits cannot silently reuse an old token against a new destination.
- Keep runtime binding, gateway behavior, diagnostics execution, and external config writes unchanged.
- Add focused tests and real smoke evidence for the adapted UI.

## Impact
- Affected specs: provider-routing-ux, ui-localization
- Affected code: `src/renderer/features/settings/settings-content.tsx`, `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`, `src/renderer/lib/i18n/dictionaries.ts`, `src/main/lib/provider-profiles/storage.ts`, UI/static and storage security tests
