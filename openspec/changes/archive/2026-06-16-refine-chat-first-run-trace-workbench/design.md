# Design: Chat-first run trace workbench

## Context
The current renderer already has three important pieces:

- Chat is the default interactive surface.
- `features/details-sidebar` defines a widget registry for a unified right
  inspector with existing `info`, `todo`, `plan`, `terminal`, `diff`, and `mcp`
  widgets.
- `AgentWorkbench` already reads `agentJobs.logs` and labels job event types,
  but its page-level placement can be read as a separate workspace replacing
  chat.

The next slice should productize existing trace data. It should not invent a new
durable event system or duplicate the existing Details sidebar.

## Goals
- Preserve Chat as the long-lived user workspace for interactive desktop runs.
- Let users inspect current-run trace, usage, and error state from the existing
  Details sidebar.
- Let users inspect headless/API/daemon and historical jobs through a job-bound
  Runs/History trace surface.
- Use one shared presenter for semantic trace rows across both surfaces.
- Keep raw payloads secondary to product-facing trace rows.
- Make legacy independent right sidebar ownership converge on DetailsSidebar.

## Non-Goals
- No new default three-column dashboard replacing chat.
- No top-level Chat/Trace segmented control for normal interactive chats.
- No new durable event schema unless a later capability-specific proposal
  requires it.
- No broad rewrite of `active-chat.tsx`.
- No full capability inspector until canonical capability/provider-binding
  evidence exists.

## Decisions

### Decision: Chat remains the primary workbench surface
Interactive desktop jobs stay in Chat. The user sends prompts, reviews tool
cards, answers questions, approves work, and continues the run there. The
Details sidebar is the inspector for the selected chat/sub-chat/run.

Alternative considered: add a peer `[Chat][Trace]` toggle to every chat. This
was rejected for the first slice because interactive chats already contain the
conversation and tool cards; a full parallel timeline would duplicate the
middle column instead of improving inspection.

### Decision: DetailsSidebar is the canonical inspector owner
The existing widget registry is the extension point for new inspector content.
Add `trace`, `usage`, and `error` widgets there. Existing Plan, Todo, Diff, MCP,
Terminal, and workspace info widgets remain.

Expanded Plan/Diff/Terminal surfaces may continue to exist as larger renderers,
but their product entry points should be owned by DetailsSidebar widgets.

### Decision: One shared WorkbenchTraceRow presenter
Both the current-chat trace widget and the Runs/History job trace view must use
the same event-to-row mapping. Start from the existing job event label map in
`AgentWorkbench` and move the semantic mapping into a shared renderer presenter
module.

The presenter consumes already-redacted job events and returns a view model such
as:

```ts
type WorkbenchTraceRow =
  | { kind: "runtime"; title: string; status: "ready" | "degraded" | "failed" }
  | { kind: "provider"; title: string; model?: string; profileId?: string }
  | { kind: "mcp"; title: string; status: "ready" | "needs-auth" | "unknown" }
  | { kind: "tool"; title: string; status: "started" | "completed" | "failed" }
  | { kind: "file-change"; path: string; status: "proposed" | "applied" }
  | { kind: "approval"; title: string; status: "pending" | "allowed" | "denied" }
  | { kind: "usage"; title: string; tokens?: number; costUsd?: number }
  | { kind: "error"; code: string; title: string; nextAction?: string }
  | { kind: "final"; status: "succeeded" | "failed" | "canceled" | "interrupted" }
```

The presenter is a renderer view-model layer over existing job events. It is
not a persistence model and must not become a second runtime truth table.

### Decision: Capability widget is dependency-gated
Trace, usage, and error can ship from existing job events, message metadata,
and documented error semantics. Capability inspection must remain behind a
dependency until provider binding, adapter source, capability state, degraded
reason, and remediation hints are available from canonical runtime manifests or
sanitized trace events.

### Decision: AgentWorkbench becomes Runs/History trace
The existing page should be renamed or reframed in product language as
Runs/History or Job Trace. It remains useful for jobs without a chat transcript
and for historical audit. It should not be presented as the default workspace
for interactive desktop chat.

### Decision: Legacy unified flag is not a product mode
`unifiedSidebarEnabledAtom=false` may remain temporarily during migration only
as a development or rollback fallback. Once DetailsSidebar owns the inspector
entry points, the legacy separate-sidebar-only path must either be removed or
kept behind an explicit temporary migration gate with a deletion follow-up.

## Risks / Trade-offs
- `active-chat.tsx` already has many right-side panel states. Migrate one entry
  point at a time instead of rewiring every sidebar at once.
- Usage aggregation is not just moving a hover card; the right sidebar needs
  run-level aggregation and honest unavailable states.
- Trace rows for interactive chat should stay compact. A full log should remain
  available through the job trace view or raw payload disclosure.
- Capability inspection can mislead users if the renderer infers support from
  names or labels. Keep it dependency-gated until canonical evidence exists.

## Migration Plan
1. Extract and test the shared trace presenter without changing UI behavior.
2. Add DetailsSidebar trace, usage, and error widgets behind the existing
   unified sidebar path.
3. Reuse the shared presenter in AgentWorkbench job logs and adjust product
   copy to Runs/History or Job Trace language.
4. Migrate independent right-sidebar entry points into DetailsSidebar-owned
   widget actions one by one.
5. Decide and document the fate of `unifiedSidebarEnabledAtom=false` before the
   change is marked complete.

Implementation note: this change adds the DetailsSidebar trace, usage, and
error widgets, routes the remaining Plan/Diff/Terminal product entry points
through DetailsSidebar-owned widget actions, and keeps
`unifiedSidebarEnabledAtom=false` as a temporary rollback gate. The expanded
Plan/Diff/Terminal renderers remain available behind those widget actions
instead of becoming separate product owners.

## Open Questions
- Should the Runs/History surface keep the internal component name
  `AgentWorkbench`, or should only visible copy change in this slice?
- Which current job event payloads are sufficient for the first compact chat
  trace widget, and which should remain raw-debug-only until later?
