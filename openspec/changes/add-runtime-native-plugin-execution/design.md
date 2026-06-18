## Context

Plugin execution crosses runtime startup, plugin inventory, review gates, activation
identity, safe mode, MCP approval, recovery, and renderer disclosure. The risky
failure mode is a runtime that auto-loads all globally installed plugins while Locus
displays review, safe-mode, or MCP-approval controls that do not actually filter the
managed run.

## Goals / Non-Goals

**Goals:**
- Let Claude Code and Codex load plugins through their own native loaders where
  proven.
- Require Locus-controlled per-run filtering before any runtime is marked native
  loadable.
- Bind runtime-native activation to a reviewed activation identity that can detect
  package drift between review and load.
- Keep review, enablement, safe mode, MCP approval, diagnostics, and UI disclosure
  aligned with the actual managed run.
- Fail closed when plugin staging or native loading fails.
- Keep Plugins inside Settings for this change while fixing audited trust issues.

**Non-Goals:**
- No Locus-native runtime for Claude/Codex marketplace plugin code.
- No "runtime auto-loaded it globally, so Locus calls it supported" path.
- No "mark reviewed directly executes the plugin" behavior.
- No standalone Plugins/Extensions navigation change.
- No Codex native execution claim until app-server has a proven per-run control
  primitive.

## Decisions

- **Controlled runtime-native activation.** A runtime can be marked native-loadable
  only if Locus can prove the managed run receives a filtered plugin set. Native
  loading without Locus control is a blocker, not success.
- **Review is state input, not direct execution.** Marking a plugin reviewed stores
  review state only. Effective activation status is recomputed from review,
  activation identity, enablement, safe mode, MCP approval, runtime support, and
  recovery state.
- **Activation identity detects drift; it is not a safety proof.** Runtime-native
  activation uses a reviewed identity made from bounded manifest/component
  declarations plus runtime-reported package identity, version, source pin, and
  package hash where available. If the runtime cannot provide a stable pin/hash or
  equivalent immutable package identity, the plugin is identity-incomplete and native
  activation is blocked or requires an explicit high-risk acknowledgement. The UI
  must not label this as verified or safe.
- **Native MCP still needs MCP approval.** A plugin's native loader path does not
  bypass MCP approval. If the runtime cannot load non-MCP components while holding
  back unapproved MCP servers, the MCP-bearing plugin is blocked before approval or
  surfaced as partial.
- **Claude filtered config.** Locus-managed Claude runs must stage approved plugins
  and write filtered settings/activation state. Directly symlinking the raw user
  `~/.claude/settings.json` is not sufficient once plugin activation is in scope,
  because `enabledPlugins` can re-enable unreviewed plugins.
- **Codex proof gate.** Phase 1 must prove whether app-server supports a per-run
  allowlist, isolated config root, plugin lifecycle method, startup flag, or
  equivalent filter. If app-server only consumes global Codex plugin state, Codex
  native plugin execution is blocked.
- **MCP-only is partial.** MCP-only injection can remain as labeled partial behavior
  but does not satisfy full runtime-native plugin execution.
- **Settings tab cleanup is scoped.** This change fixes Plugins-tab trust and
  execution truth issues, but leaves the broader navigation/product-surface decision
  deferred.

## Ownership

- **Shared policy owner:** `src/main/lib/plugins/runtime-native-activation.ts`
  should own runtime-agnostic activation decisions: review state, enablement, safe
  mode, MCP approval state, recovery state, approved component matrix, blocked
  reasons, and capability-manifest input.
- **Claude adapter owner:** Claude-specific config staging remains under
  `src/main/lib/claude/`.
- **Codex adapter owner:** Codex app-server plugin lifecycle and control probing
  remain under `src/main/lib/codex/`.
- **Route boundary:** tRPC routes may validate inputs and call the owners above, but
  must not duplicate review/safe-mode/MCP/plugin-loadability decisions.
- **Renderer boundary:** Settings > Plugins renders the activation matrix and invokes
  approved actions; it must not infer executable state from cache scans alone.

## Risks / Trade-offs

- **Global runtime config bypasses Locus gates.** Mitigation: require per-run filter
  proof; block native execution claims when only global auto-load exists.
- **Claude settings bypasses plugin-dir filtering.** Mitigation: write filtered
  settings/activation state instead of symlinking raw settings for plugin activation.
- **Native loader exposes unapproved MCP servers.** Mitigation: keep MCP-bearing
  plugins blocked or partial until MCP components can be approved and filtered.
- **Manifest review misses code drift.** Mitigation: require runtime-native activation
  identity and treat missing stable identity as blocked or explicitly acknowledged
  high risk.
- **Codex app-server does not expose plugin controls.** Mitigation: keep Codex
  unsupported or MCP-only in the manifest and open a follow-up; do not mark this
  change complete for Codex native execution.
- **Plugin staging/load failure affects runtime startup.** Mitigation: fail closed
  for the plugin/component, keep non-plugin runtime behavior available, and report
  bounded Doctor/Debug diagnostics.

## Migration Plan

1. Build the proof matrix for Claude SDK and Codex app-server, including stable
   activation identity fields and negative tests for unreviewed, drifted, disabled,
   unapproved MCP, failed-load, and safe-mode-blocked plugins.
2. Implement shared activation policy/recovery decisions.
3. Implement Claude filtered config and settings staging for proven components.
4. Implement Codex native plugin activation only if a per-run control point is
   proven or added.
5. Update the capability manifest and Settings > Plugins to reflect proven state.
6. Fold in scoped Plugins-tab trust fixes while keeping Plugins in Settings.
7. Validate with strict OpenSpec, type/lint/test checks, and manual managed-run
   proofs.
