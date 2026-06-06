## 1. Proposal and Approval
- [x] 1.1 Review current runtime core, desktop job, workbench, scope contract, and provider diagnostic specs.
- [x] 1.2 Create this OpenSpec proposal, design, and spec deltas.
- [x] 1.3 Validate this OpenSpec change strictly.
- [x] 1.4 Get approval before implementing product code.

## 2. Ownership and Preflight
- [x] 2.1 Update `docs/OWNERSHIP_MAP.md` with canonical owners for runtime preflight, permission policy, desktop run request, runtime events, and trace redaction.
- [x] 2.2 Extract reusable desktop run preflight from `desktop-agent-jobs.ts` context validation.
- [x] 2.3 Make Claude and Codex routes use verified preflight context before provider, MCP, attachment, or runtime startup.
- [ ] 2.4 Add blockers for unregistered cwd/project/subChat mismatch, provider profile readiness, MCP needs-auth, unsupported attachments, and local-only mode before provider work starts.
- [x] 2.5 Add focused preflight tests.

## 3. Permission Policy
- [x] 3.1 Define `PermissionPolicy` for plan, agent, and guarded desktop runs.
- [x] 3.2 Route Claude and Codex plan/agent/guarded behavior through the shared policy owner.
- [x] 3.3 Decide and document Claude native permission/bypass strategy.
- [x] 3.4 Remove or strictly limit Claude route-local plan `.md` write exceptions.
- [x] 3.5 Add permission policy tests for Claude and Codex.

## 4. Desktop Runtime Contract
- [x] 4.1 Define desktop-capable `DesktopRunRequest`, `DesktopRunContext`, `DesktopRunResult`, and cancellation/session metadata types.
- [x] 4.2 Define ordered, renderer-safe `RunEvent` categories and redaction context.
- [ ] 4.3 Add desktop runtime adapter interface/factory.
- [ ] 4.4 Wrap the current Claude desktop path behind the adapter interface without regressing current renderer behavior.
- [ ] 4.5 Wrap the current Codex ACP desktop path as a `temporary-compat` adapter without claiming app-server support.
- [ ] 4.6 Delete replaced route-local helpers or guard temporary dual paths with migration gates, deletion conditions, and tests.

## 5. Trace and Workbench
- [ ] 5.1 Map Claude desktop stream chunks to persisted semantic run/job events.
- [ ] 5.2 Map Codex desktop stream chunks to the same semantic run/job events.
- [ ] 5.3 Redact events before persistence and renderer emission.
- [ ] 5.4 Update Workbench logs to show semantic timeline categories with raw payload as debug fallback.
- [ ] 5.5 Add tests for event ordering, redaction, terminal events, cancellation, and Workbench-readable trace.

## 6. Verification
- [ ] 6.1 Run `openspec validate add-runtime-control-layer --strict --no-interactive`.
- [ ] 6.2 Run `bun run architecture:check`.
- [ ] 6.3 Run focused preflight, permission policy, adapter boundary, redaction, and desktop job event tests.
- [ ] 6.4 Run `bun run ts:check`.
- [ ] 6.5 Run `bun run build`.
- [ ] 6.6 Record desktop smoke evidence for Claude plan/guard and Codex temporary-compat plan/guard using verified preflight and semantic trace.
