---
name: agent-code-architecture
description: Repository guide for 1Code architecture, boundaries, and extension points.
---

Use this skill when reasoning about the architecture of the 1Code desktop app.

Architecture map:
- `src/main/` is the Electron main process. It owns native APIs, credential handling, filesystem access, provider startup, and tRPC routers.
- `src/preload/` is the context-isolated bridge. Keep this thin.
- `src/renderer/` is the React UI. It should not receive plaintext provider secrets.
- `src/main/lib/trpc/routers/` is the main API surface used by the renderer.
- `src/main/lib/db/schema/` is the Drizzle SQLite schema source of truth.
- `src/main/lib/claude/` and `src/main/lib/trpc/routers/claude.ts` handle Claude SDK runtime behavior.
- `src/main/lib/trpc/routers/codex.ts` handles Codex runtime behavior.
- `src/renderer/features/agents/` is the primary local chat UI.
- `src/renderer/components/dialogs/settings-tabs/` contains settings surfaces for models, MCP, skills, agents, plugins, and related configuration.

Local-first boundaries:
- Local mode should support local repos, API key/custom provider setup, Codex setup, and local agent use.
- Hosted-only features such as cloud sandboxes, sync, background agents, and subscription-backed features can remain gated.
- Do not collapse startup, MCP warmup, and provider-auth failures into one diagnosis.

Change guidance:
- For new product capabilities, architecture shifts, schema changes, or security-sensitive changes, use OpenSpec before implementation.
- For small config/content additions or bug fixes restoring intended behavior, OpenSpec is not required.
- Keep changes scoped to the relevant layer and avoid broad refactors.
