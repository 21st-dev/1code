## 1. Phase 1 - Research / Proof

- [ ] 1.1 Claude: with a test plugin and isolated Agent SDK config, prove which
  component types activate: commands, skills, agents, hooks, and MCP.
- [ ] 1.2 Claude: prove the controlled path blocks an installed/global-enabled but
  unreviewed plugin by using filtered plugin staging and filtered settings rather
  than raw `~/.claude/settings.json`.
- [ ] 1.3 Claude: prove safe mode exposes zero plugin components while preserving
  non-plugin settings and non-plugin MCP behavior.
- [ ] 1.4 Claude: prove a native-loaded plugin with an unapproved MCP server does not
  create an active tool connection.
- [ ] 1.5 Claude: identify the stable activation identity fields available for a
  native-loaded plugin (manifest/component declarations plus package identity,
  version, source pin, package hash, or equivalent), and prove drift is detected
  before activation.
- [ ] 1.6 Codex: prove whether `codex app-server` honors installed/enabled plugins
  inside a managed thread.
- [ ] 1.7 Codex: prove whether Locus can filter plugins per run through an app-server
  allowlist, isolated config root, startup flag, lifecycle method, or equivalent
  control. If Codex only auto-loads global plugin state, record native execution as
  blocked.
- [ ] 1.8 Codex: identify the stable activation identity fields available for a
  native-loaded plugin (manifest/component declarations plus package identity,
  version, source pin, package hash, or equivalent), and prove drift is detected
  before activation.
- [ ] 1.9 Codex: prove native-loaded MCP servers remain approval-gated; if Codex can
  only load an MCP-bearing package whole, block that package before MCP approval or
  mark non-MCP components partial.
- [ ] 1.10 Produce a per-runtime, per-component activation matrix with
  `native-loadable`, `mcp-only`, `not-loadable`, identity completeness, and blocked
  reasons.
- [ ] 1.11 Version-probe Codex plugin inventory commands; do not require `--json` when
  the bundled Codex build does not support it.

## 2. Phase 2 - Shared Policy Owner

- [x] 2.1 Add `src/main/lib/plugins/runtime-native-activation.ts` as the shared owner
  for activation decisions, activation identity, blocked reasons, recovery posture,
  and capability-matrix inputs.
- [ ] 2.2 Keep route code limited to request validation and owner calls; do not copy
  review/safe-mode/MCP/loadability logic into route handlers.
- [x] 2.3 Add tests for reviewed/enabled, unreviewed, disabled, safe-mode, failed-load,
  drifted identity, identity-incomplete, and MCP-approval combinations.
- [x] 2.4 Ensure marking a plugin reviewed only stores review/activation-identity state
  and triggers recomputation of effective activation status; it does not directly
  mutate enablement, MCP approval, or target mode.

## 3. Phase 3 - Claude Controlled Native Execution

- [ ] 3.1 Replace raw plugin-dir removal with review-gated plugin staging into the
  isolated Claude config directory for component types proven in Phase 1.
- [x] 3.2 Replace raw `settings.json` symlink behavior for plugin activation with a
  filtered settings/activation manifest whose `enabledPlugins` only includes
  reviewed+enabled plugins.
- [x] 3.3 Bind Claude native activation to the reviewed activation identity; block or
  require explicit high-risk acknowledgement when stable identity is missing, and
  block when identity drifts after review.
- [x] 3.4 Ensure safe mode writes an empty plugin activation set and exposes no plugin
  commands, skills, agents, hooks, or MCP servers.
- [x] 3.5 Ensure native-loaded plugin MCP servers are not active tool connections until
  the current redacted MCP configuration fingerprint is approved.
- [ ] 3.6 Ensure plugin staging/load failures block the offending plugin/component,
  preserve non-plugin runtime startup, and surface Doctor/Debug diagnostics.
- [x] 3.7 Preserve non-plugin settings and non-plugin MCP behavior.
- [x] 3.8 `bun run ts:check` passes.

## 4. Phase 4 - Codex Controlled Native Execution

- [x] 4.1 If Phase 1 proves app-server supports per-run filtering, wire Codex plugin
  lifecycle/status and pass only reviewed+enabled plugins to that managed thread.
- [ ] 4.2 If Phase 1 proves app-server has no per-run filtering, stop Codex native
  execution work for this change, keep Codex marked unsupported or explicitly
  MCP-only, and prepare a follow-up proposal. Do not mark Codex native execution
  complete.
- [x] 4.3 Do not show Codex enable/disable/install/uninstall controls unless the
  runtime exposes those actions and Locus can preserve review/safe-mode/MCP gates.
- [x] 4.4 Bind Codex native activation to the reviewed activation identity; block or
  require explicit high-risk acknowledgement when stable identity is missing, and
  block when identity drifts after review.
- [x] 4.5 Ensure Codex plugin staging/load failures fail closed and do not drag down
  non-plugin Codex app-server behavior.
- [x] 4.6 `bun run ts:check` passes.

## 5. Phase 5 - UI Truth And Plugins-Tab Cleanup

- [x] 5.1 Settings > Plugins shows per-plugin installed, enabled, reviewed,
  runtime-loadable, component status, activation identity status, MCP approval state,
  recovery state, and blocked reasons from the activation matrix.
- [x] 5.2 Keep Plugins inside Settings; do not promote it to a standalone extension
  surface in this change.
- [x] 5.3 Clarify plugin-provided MCP ownership by bridging to the MCP tab or making
  ownership explicit, and remove unused/dead `setActiveTab` state.
- [x] 5.4 Add proportional confirmation for destructive or security-sensitive plugin
  actions, including developer trust revocation and developer source removal.
- [x] 5.5 Hide dead unsupported Codex rows or explain blocked/native-loadable state
  directly from the Phase-1 matrix.
- [x] 5.6 Update `agent-runtime-capabilities.ts` from the proof matrix.
- [ ] 5.7 Update `docs/ideas/settings-per-tab-audit.md` to mark execution-truth and
  in-tab trust fixes as folded into this change, while the standalone navigation
  decision remains deferred.

## 6. Validation

- [x] 6.1 `bun run ts:check`.
- [x] 6.2 `bun run lint`.
- [ ] 6.3 Full test suite, including filtered settings, safe mode, review gates,
  activation-identity drift, identity-incomplete behavior, MCP-approval gates,
  review-state recomputation, failed-load recovery, Codex version probe, and Codex
  no-filter blocker behavior.
- [ ] 6.4 Architecture guard.
- [x] 6.5 `openspec validate add-runtime-native-plugin-execution --strict --no-interactive`.
- [ ] 6.6 Manual managed-run proof: reviewed plugin components activate; unreviewed
  globally enabled plugins do not; activation identity drift blocks activation;
  identity-incomplete plugins are blocked or explicitly high-risk acknowledged; safe
  mode disables all plugin components; unapproved plugin MCP servers do not become
  active tool connections; plugin staging/load failure fails closed; Codex either
  proves controlled native loading or is recorded as blocked.
