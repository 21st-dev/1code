# Change: Add App Agents

## Why
The current Custom Agents screen edits Claude-specific `.claude/agents` files, which makes the app-level Agent concept depend on one runtime and leaves Codex requests without the same reusable profiles.

## What Changes
- Add App Agents as local, app-managed agent profiles stored in SQLite.
- Replace the visible Agents settings surface with App Agents management.
- Make `@agent` suggestions come from App Agents.
- Inject selected App Agent instructions into both supported chat paths using the active chat runtime/model.

## Impact
- Affected specs: app-agents, agent-context-recommendations
- Affected code: database schema/migrations, tRPC routers, settings UI, mention providers, Claude/Codex chat prompt preparation
