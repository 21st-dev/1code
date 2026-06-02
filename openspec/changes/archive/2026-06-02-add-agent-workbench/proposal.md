# Change: Add local Agent Workbench

## Why
Locus already supports local chats, worktrees, sub-chats, diffs, terminal, and GitHub workflow helpers, but these capabilities are scattered across the active chat view. Users need a Codex-like local workbench that answers what is running, what needs review, what has a pull request, and where to continue work without turning Locus into a hosted cloud product.

## What Changes
- Add a local Agent Workbench surface that lists project chats/worktrees as task cards with status, branch, diff, PR, and latest sub-chat context.
- Add a main-process aggregate query that derives workbench state from existing local SQLite chat/sub-chat records, git status/diff helpers, streaming metadata, and GitHub workflow helpers.
- Add workbench filters for all tasks, running tasks, tasks needing review, pull requests, blocked tasks, and clean tasks.
- Add task actions to open the chat, focus review/diff, continue in the latest sub-chat, and open or create a pull request through existing confirmed workflows.
- Keep the first implementation local-only, read-mostly, and schema-light; add persistent run/review metadata only after the derived MVP proves insufficient.

## Impact
- Affected specs: `agent-workbench` (new)
- Affected code:
  - `src/main/lib/trpc/routers/agent-workbench.ts`
  - `src/main/lib/trpc/routers/index.ts`
  - `src/renderer/features/agents/workbench/**`
  - existing agents shell/navigation components for adding the workbench entry point
  - existing diff, chat, and GitHub workflow hooks/actions reused where practical
- Validation:
  - `openspec validate add-agent-workbench --strict --no-interactive`
  - targeted Bun tests for workbench status derivation and filtering
  - `bun run ts:check`
  - `bun run build`
  - real Electron/browser smoke with click and visual inspection of the workbench filters and task actions

## Non-Goals
- Do not add hosted cloud sync, remote sandbox, mobile relay, or remote SSH.
- Do not introduce background automations or scheduled jobs in the MVP.
- Do not replace Claude/Codex runtime execution or rewrite the active chat component.
- Do not persist provider secrets, GitHub tokens, or command output in new renderer-owned state.
- Do not create a broad multi-agent scheduler until the task visibility and review workflow are verified.
