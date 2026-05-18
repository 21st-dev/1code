## Context
The renderer uses a small local i18n layer: `I18nProvider`, `useI18n`, and typed dictionaries. The previous bilingual change archived successfully, but it preserved an incremental migration boundary and left secondary settings pages plus peripheral chat panels for later.

## Goals
- Finish user-visible app-authored UI copy across common product surfaces.
- Preserve the existing typed dictionary and fallback behavior.
- Keep specialist coding-agent terms readable: Agent, Plan, Codex, MCP, API Key, Model, Worktree, Commit, PR, Branch, Diff, Terminal, JSON, HTTP, SSH, GGUF.
- Keep raw or user/generated text unchanged.

## Non-Goals
- Do not translate AI messages, user messages, logs, file paths, commands, diffs, code, model IDs, or raw provider errors.
- Do not introduce a new i18n dependency or route-level locale system.
- Do not redesign the UI or change product behavior while migrating copy.
- Do not translate low-level base component `sr-only` labels unless they are part of a product surface.

## Decisions
- Add new translation keys to the existing `dictionaries.ts` instead of creating per-feature dictionary files in this pass.
- Migrate by feature area in small patches so regressions are easier to review.
- Use audit results as a guide, then manually classify each hit as migrate or intentional exclusion.

## Risks
- Large TSX migrations can accidentally move hooks into conditional paths.
  - Mitigation: only add `useI18n` at component top level and avoid changing component control flow.
- Some English hits are technical terms that should remain English.
  - Mitigation: keep the explicit exclusion record and do not chase the scan count to zero blindly.
