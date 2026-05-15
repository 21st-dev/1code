## Context
The renderer is a React desktop app with Jotai persisted preferences and hardcoded English copy in many TSX files. There is no current i18n framework or route-level locale structure.

## Goals
- Provide a small typed i18n layer that fits the existing Electron renderer.
- Support English and Simplified Chinese without changing app navigation or data models.
- Keep terminology consistent for developer-tool concepts.
- Allow incremental migration by feature area.

## Non-Goals
- Do not translate AI-generated messages, user prompts, command output, file content, file paths, git diffs, or raw external errors.
- Do not add route-based locales, server-side rendering, or web marketing-page localization.
- Do not localize release metadata, package metadata, or platform app names in this change.
- Do not introduce machine translation at runtime.

## Decisions
- Implement a lightweight local dictionary rather than adding a large i18n dependency.
- Store language preference in localStorage through `atomWithStorage`, matching existing preferences.
- Use `system` as the default preference and resolve it to `zh-CN` only when the runtime locale starts with `zh`; otherwise use `en`.
- Use typed translation keys so missing keys are caught during TypeScript checks.
- Keep technical terms stable in English unless the Chinese form is already standard and clearer.

## Terminology Policy
Keep these terms in English in Chinese UI: Claude Code, Codex, MCP, API Key, Base URL, Token, Model, Agent, Plan, Worktree, Branch, Commit, PR, Diff, Terminal, GitHub, VS Code, JetBrains.

Translate common interface words naturally: Settings, Preferences, Account, Appearance, Continue, Search, Archive, Restore, Delete, Cancel, Save, Loading, No results, Select folder.

## Migration Plan
1. Add i18n infrastructure and language preference.
2. Migrate onboarding and core settings UI.
3. Migrate sidebar and primary workspace actions.
4. Migrate chat input, agent status, and tool display wrappers.
5. Migrate changes/diff, terminal, file viewer, automations, and inbox.
6. Sweep remaining hardcoded strings and classify them as translated, intentionally technical, or external/user content.

## Risks / Trade-offs
- Incremental migration means some screens may temporarily be mixed-language.
  Mitigation: Start with entry points and high-frequency UI; track remaining areas in tasks.
- Dynamic strings can become awkward if translated through ad hoc interpolation.
  Mitigation: Add small formatting helpers for common count/action strings.
- Chinese labels can be longer than English.
  Mitigation: Verify compact controls and sidebars in both languages before marking tasks complete.

## Open Questions
- Should the app default to `system`, or should Chinese be opt-in until the translation is broader?
- Should we expose language settings only in Preferences, or also on onboarding screens before settings are reachable?
