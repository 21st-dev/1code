## 1. Specification and ownership
- [x] 1.1 Confirm affected canonical owners from `docs/OWNERSHIP_MAP.md` before
  touching runtime event, capability, guard, provider, MCP, or renderer trace
  state logic.
- [x] 1.2 Confirm there is no conflicting active OpenSpec change for
  `agent-workbench`, `usage-panel`, or `agent-runtime-capabilities`.

## 2. Shared trace presenter
- [x] 2.1 Extract the event label and semantic mapping currently embedded in
  `AgentWorkbench` into a shared renderer presenter module.
- [x] 2.2 Define the `WorkbenchTraceRow` view model over existing sanitized
  `agentJobs.logs` events.
- [x] 2.3 Add targeted tests for tool, guard, MCP auth, usage, error,
  cancellation, completion, and unknown/raw fallback rows.
- [x] 2.4 Ensure raw payload display stays secondary and uses already-redacted
  event payloads.

## 3. DetailsSidebar inspector widgets
- [ ] 3.1 Extend the DetailsSidebar widget registry with `trace`, `usage`, and
  `error` widgets.
- [ ] 3.2 Implement the trace widget as a compact current-run summary and jump
  index, not a duplicate full log beside chat.
- [ ] 3.3 Implement the usage widget as a run/chat aggregate with honest
  unavailable states when provider usage, cost, cache, or context metadata is
  missing.
- [ ] 3.4 Implement the error widget using the product codes and field names from
  `docs/error-semantics.md`.
- [ ] 3.5 Keep the capability widget out of the default registry until canonical
  provider binding and capability evidence are available.

## 4. Runs/History trace surface
- [x] 4.1 Update `AgentWorkbench` to consume the shared `WorkbenchTraceRow`
  presenter instead of keeping its own event-to-row mapping.
- [ ] 4.2 Reframe visible copy and navigation as Runs/History or Job Trace for
  headless/API/daemon jobs and historical audit.
- [ ] 4.3 Keep actions that open linked chats, diff review, and PR flows wired to
  existing safe local behavior.
- [ ] 4.4 Render the selected job's record header (runtime, provider profile or
  binding, status, timing, final error) via the existing `agentJobs.show`
  procedure above the semantic timeline, reusing already-redacted job data.

## 5. Right-sidebar convergence
- [ ] 5.1 Route Plan, Diff, and Terminal product entry points through
  DetailsSidebar widgets before opening expanded renderers.
- [ ] 5.2 Migrate independent right-sidebar controls one at a time using the
  existing hidden-button and expanded-widget patterns.
- [ ] 5.3 Decide whether `unifiedSidebarEnabledAtom=false` is removed or kept as
  an explicit temporary migration fallback with a deletion follow-up.
- [ ] 5.4 Do not rewrite `active-chat.tsx` broadly as part of this convergence.

## 6. Validation
- [ ] 6.1 Run targeted presenter and renderer tests.
- [ ] 6.2 Run `bun run ts:check` if implementation touches TypeScript.
- [ ] 6.3 Run `openspec validate refine-chat-first-run-trace-workbench --strict --no-interactive`.
- [ ] 6.4 Update `docs/DESIGN.md`, `docs/run-event-trace-inventory.md`, or
  `docs/error-semantics.md` in the implementation change if UI semantics,
  trace vocabulary, or error copy changes.
