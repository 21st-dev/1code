## Context
Custom agent files under `.claude/agents` are useful for Claude Code compatibility, but they are not an application-level abstraction. App Agents should be local profiles the app can apply regardless of which chat runtime handles the request.

## Goals
- Keep App Agents runtime-neutral.
- Store profiles locally in the app database.
- Make the existing `@agent` mention flow use App Agents.
- Avoid adding another model selector. App Agents follow the current chat model.

## Non-Goals
- Do not remove Claude file-agent support from the backend in this change.
- Do not implement hard runtime permission enforcement for tool policies yet.
- Do not add cloud sync or hosted agent storage.

## Design
Add an `app_agents` SQLite table with `name`, `description`, `prompt`, optional `tools`, optional `disallowed_tools`, and timestamps. Names are normalized to kebab-case and unique.

The Settings > Agents tab becomes App Agents. Users can create, edit, delete, and search local profiles. Tool selection is stored as guidance metadata and rendered as part of the injected prompt context.

At send time, `@[agent:name]` mentions are resolved against `app_agents`. The mention token is removed from the user-facing prompt text sent to the model, and the selected profile instructions are prepended as "App Agent Context". The same helper is used by both chat paths so App Agents are not tied to runtime-specific config.
