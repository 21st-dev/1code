# Change: Add controlled UI plugin contributions

## Why

Locus can now discover runtime plugins, pin/review manifest metadata, block plugin runtime paths through safe mode, and show Doctor/Debug facts. The next step is Phase 4: let reviewed plugins contribute limited UI surfaces without adopting Codex++-style DOM patching or trusted local JavaScript execution.

## What Changes

- Add a Locus-native controlled UI contribution manifest that plugins can declare as static JSON.
- Support the first controlled surfaces:
  - Settings sections rendered inside Settings > Plugins.
  - Workbench panels rendered by Locus-owned components.
  - Command buttons that prepare bounded Locus actions, such as inserting a chat draft, without sending or executing automatically.
- Gate all controlled UI contributions through current fingerprint review, safe mode, runtime ownership, and main-process validation.
- Add a controlled UI gate separate from MCP gates, with explicit render/action blocked reasons.
- Bind controlled action grants to the current reviewed fingerprint so changed contribution metadata invalidates old grants.
- Keep renderer behavior declarative: no plugin JavaScript, no raw HTML, no DOM patching, no Node APIs, no provider secrets, no raw SQLite, and no shell execution.
- Add Doctor/Debug visibility for controlled UI contributions so users can see which surfaces changed and why a contribution is blocked.

## Non-Goals

- Do not implement developer-trusted local code.
- Do not execute arbitrary plugin JavaScript, TypeScript, JSX, or native modules.
- Do not add remote marketplace install/update flows.
- Do not make Codex cache packages executable or controllable.
- Do not allow contributed buttons to send chats, run terminals, edit files, approve MCP, or enable plugins automatically.
- Do not add iframe/webview plugin pages, plugin CSS injection, or plugin-authored event handlers.

## Impact

- Affected specs:
  - `runtime-plugins`
- Affected code:
  - `src/shared` controlled UI contribution schema and gates
  - `src/main/lib/plugins` contribution discovery and review documents
  - `src/main/lib/trpc/routers/plugins.ts` contribution API
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - Future renderer workbench panel host
  - `src/renderer/lib/i18n/dictionaries.ts`
  - Plugin governance tests and UI source guards
