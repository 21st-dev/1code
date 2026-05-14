# Change: Add bilingual UI localization

## Why
The app currently hardcodes English UI copy across renderer components. Users who prefer Chinese need a first-class Simplified Chinese interface, while developer-tool terms should stay precise and recognizable.

## What Changes
- Add a renderer localization layer for English and Simplified Chinese UI strings.
- Add a persisted language preference with options for system default, English, and Simplified Chinese.
- Keep professional and product terms in English when translation would reduce clarity, including Claude Code, Codex, MCP, API Key, Base URL, Token, Model, Agent, Plan, Worktree, Branch, Commit, PR, Diff, and Terminal.
- Migrate user-facing strings in staged UI areas instead of rewriting the whole app at once.
- Preserve user-generated content, model output, file paths, commands, raw tool output, and external error messages without translation.

## Impact
- Affected specs: `ui-localization`
- Affected code:
  - `src/renderer/App.tsx`
  - `src/renderer/lib/atoms/index.ts`
  - `src/renderer/lib/i18n/*`
  - `src/renderer/features/onboarding/*`
  - `src/renderer/features/settings/*`
  - `src/renderer/components/dialogs/settings-tabs/*`
  - `src/renderer/features/sidebar/*`
  - Later staged renderer areas: chat input, agent status/tool UI, changes/diff, terminal, file viewer, automations, inbox
- Validation:
  - OpenSpec validation when the CLI is available
  - `bun run ts:check`
  - `bun run build`
  - Local Electron smoke test switching between English and Simplified Chinese
