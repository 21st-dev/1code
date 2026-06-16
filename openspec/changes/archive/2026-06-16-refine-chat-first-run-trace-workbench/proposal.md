# Change: Refine chat-first run trace workbench

## Why
Locus already has a chat-first desktop surface and a unified `DetailsSidebar`
widget registry, but the current product language still makes the separate
Agent Workbench page look like a competing primary workspace. Runtime trace,
usage, error, and capability inspection are also split between chat messages,
job logs, and payload viewers, so users can see activity but cannot always turn
it into a compact, actionable trace.

## What Changes
- Keep Chat as the default operating surface for interactive desktop work.
- Make the existing unified `DetailsSidebar` the canonical right-side inspector
  for current-chat details.
- Add trace, usage, and error inspector widgets to the unified sidebar using
  existing run/job/message data.
- Treat capability inspection as a dependent slice that requires canonical
  capability/provider-binding trace evidence before full UI exposure.
- Extract one shared `WorkbenchTraceRow` presenter over existing job events and
  use it from both the current-chat trace widget and the job/history trace view.
- Reposition the existing Agent Workbench page as a Runs/History job trace
  surface for headless/API/daemon jobs and historical audit, not as a second
  primary workspace beside Chat.
- Converge legacy independent right sidebars into the unified inspector model,
  keeping expanded Plan/Diff/Terminal views as renderers rather than separate
  product owners.

## Impact
- Affected specs: `agent-workbench`, `usage-panel`,
  `agent-runtime-capabilities`
- Affected code:
  - `src/renderer/features/details-sidebar/`
  - `src/renderer/features/agents/main/active-chat.tsx`
  - `src/renderer/features/agents/workbench/agent-workbench.tsx`
  - `src/renderer/features/agents/ui/agent-message-usage.tsx`
  - `src/shared/agent-jobs.ts`
  - `src/main/lib/agent-runtime/*`
- Non-goals:
  - Do not add a new top-level Chat/Trace toggle for normal interactive chats.
  - Do not create a second renderer-owned runtime event model.
  - Do not rebuild Plan, Todo, Diff, MCP, or Terminal inspectors from scratch.
  - Do not claim full capability inspection until provider/runtime capability
    evidence is available through canonical events or manifests.
