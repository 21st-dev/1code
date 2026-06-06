## Context
Current desktop runtime behavior is split across several owners:

- `src/main/lib/desktop-agent-jobs.ts` verifies enough project/chat/sub-chat context to create desktop jobs.
- `src/main/lib/trpc/routers/claude.ts` builds Claude SDK env, MCP config, provider binding, permission behavior, stream chunks, and job completion behavior.
- `src/main/lib/trpc/routers/codex.ts` builds Codex ACP provider config, MCP status, provider binding, permission handling, stream chunks, and diagnostics.
- `src/main/lib/agent-guard/decision.ts` owns guarded-run allow/deny decisions.
- `src/shared/agent-jobs.ts` already contains rich event categories, but desktop streams only persist a limited lifecycle/status trace.
- `src/renderer/features/agents/lib/runtime-event-state.ts` owns renderer AskUserQuestion and guard UI state.

The next runtime work would touch runtime, provider, guard, capability, chat, and renderer runtime-event state logic. Per the ownership map, this needs an approved owner model before product code changes.

## Goals
- Make desktop runtime startup run through one preflight result before provider, MCP, attachment, or adapter work starts.
- Make plan, agent, and guarded semantics explicit through one `PermissionPolicy` mapping.
- Give Claude and Codex desktop adapters the same outer `DesktopRunRequest`, `RunEvent`, and trace contract.
- Keep routes focused on input validation, authorization/status wrapping, and transport envelopes.
- Persist ordered, redacted semantic events that Workbench can replay and filter.
- Allow runtime-specific internals where they are real: Claude SDK callbacks, Codex ACP/app-server approval flows, and headless `codex exec` stay different behind the shared shell.

## Non-Goals
- No broad UI redesign.
- No Codex app-server production implementation.
- No Claude Dynamic Workflows implementation.
- No Local Job API v2 decision; this change only prevents desktop rich trace from being lost internally.
- No renderer-side credential resolution or renderer-only trace.

## Decisions
- Decision: introduce `src/main/lib/agent-runtime/preflight.ts` as the reusable desktop run preflight owner.
  - It returns verified `projectId`, `chatId`, `subChatId`, canonical `cwd`, runtime ID, mode, provider profile metadata, MCP readiness, attachment readiness, and local-only blockers.
  - It returns renderer-safe blocking diagnostics before provider work starts.
- Decision: introduce `src/main/lib/agent-runtime/permission-policy.ts` as the shared policy owner.
  - It maps Locus plan, agent, and guarded modes to runtime-specific native controls or Locus guard enforcement.
  - It records whether Claude native permission bypass is allowed, denied, or allowed only because Locus guarded policy is installed first.
- Decision: introduce desktop runtime contracts under `src/main/lib/agent-runtime/`.
  - `desktop-run-request.ts` owns `DesktopRunRequest`, `DesktopRunContext`, `DesktopRunResult`, and cancellation/session metadata.
  - `runtime-events.ts` owns ordered, redacted `RunEvent` categories that map to persisted `agent_job_events`.
- Decision: routes may keep current tRPC shapes during migration, but they must delegate durable runtime business rules to the new owners.
  - A temporary helper can remain only with a migration flag or gate, a deletion condition, and tests proving which path is active.
- Decision: Workbench reads semantic job events where available and may keep raw payload inspection as a debug fallback.

## Runtime Boundary
Target shape after approval:

```text
tRPC route / transport envelope
  -> desktop run preflight
  -> permission policy
  -> provider binding / MCP readiness / attachment readiness
  -> desktop runtime adapter
  -> normalized RunEvent stream
  -> persisted trace and renderer chunks
```

Claude and Codex adapter internals do not need to be identical. They only need to accept verified context and policy, emit normalized events, and fail closed when the requested capability cannot be enforced.

## Migration Plan
1. Extract preflight from desktop job context validation without changing runtime behavior.
2. Make Claude and Codex routes consume verified context before provider/MCP/runtime startup.
3. Add `PermissionPolicy` and route existing plan/agent/guarded behavior through it.
4. Define `DesktopRunRequest` and adapter interfaces, then wrap current Claude and Codex ACP paths behind the interface.
5. Map current desktop stream chunks to persisted semantic `RunEvent`/job events with redaction.
6. Update Workbench timeline to consume semantic events and keep raw payload debug viewing as fallback.
7. Delete or gate replaced route-local helpers in the same changes that introduce the new owners.

## Security and Local-First Boundaries
- Preflight must canonicalize `cwd` to a registered local project or approved workspace before provider, MCP, or runtime work starts.
- Renderer input must never carry raw provider secrets, OAuth tokens, custom env, or authorization headers into a runtime request.
- Runtime events, diagnostics, and persisted trace must be redacted before leaving the main process owner.
- MCP needs-auth and provider-profile blockers must stop runs before provider work starts when readiness is required.
- Plan mode and guarded scope contracts must fail closed when the selected runtime cannot enforce the policy before side effects.

## Risks / Trade-offs
- Route extraction can create duplicate paths.
  - Mitigation: require deletion or explicit migration gates with tests for every replaced helper.
- Unifying the outer request can hide real runtime differences.
  - Mitigation: keep adapter source and capability evidence visible in diagnostics and manifests.
- Persisting richer trace can leak secrets if redaction is late.
  - Mitigation: redaction happens before event persistence and before renderer emission.
- Workbench timeline can overpromise if raw runtime payloads are incomplete.
  - Mitigation: only semantic events with verified categories drive timeline status; raw payloads remain debug-only.

## Open Questions
- Should plan mode be fully read-only, or should it allow writes only to explicit Locus-owned artifact paths?
- If Claude Agent mode continues to use native permission bypass, what exact Locus policy evidence is required before that is acceptable?
- Which desktop event categories must be persisted in the first implementation slice versus left as debug-only?
- Should rich desktop trace later expand Local Job API v1, or stay internal until a separate v2 proposal?
