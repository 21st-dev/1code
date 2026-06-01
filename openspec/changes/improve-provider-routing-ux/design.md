## Context
`cc-switch` is a reference implementation for provider management UX, not a runtime dependency. The useful patterns are visual and workflow-level: obvious preset choice, active-provider status, compact provider rows, diagnostic health badges, and action buttons that stay available without exposing configuration internals.

## Goals
- Make provider profile setup and diagnostics scannable at desktop settings sizes.
- Preserve Locus local-first and renderer-safe provider boundaries.
- Improve bilingual labels for routing status, diagnostics, targets, and auth state.
- Keep the implementation contained to renderer layout/copy and tests.

## Non-Goals
- No embedded cc-switch code, database, Tauri service, proxy runtime, or config model.
- No changes to provider profile storage, gateway token handling, diagnostics execution, or runtime launch arguments.
- No new external config import/apply/restore behavior.

## Decisions
- Use a wider content container only for the Models tab instead of changing all Settings tabs.
- Replace the provider preset native select with accessible preset chips while preserving the same preset data and `applyPreset` behavior.
- Render saved provider profiles as compact rows with initials, protocol/status badges, model/base URL metadata, runtime target chips, diagnostic checks, and icon actions.
- Keep token and header values out of the provider row; show only safe auth state such as `Saved token` or `No token`.
