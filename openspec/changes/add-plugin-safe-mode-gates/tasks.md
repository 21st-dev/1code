## 1. OpenSpec
- [x] 1.1 Add proposal, design, tasks, and runtime-plugins spec delta.
- [x] 1.2 Validate the change with strict OpenSpec checks.

## 2. Shared Gate Model
- [ ] 2.1 Add shared safe-mode and review-gate types.
- [ ] 2.2 Add deterministic gate helpers for safe mode, review status, runtime, and MCP presence.
- [ ] 2.3 Add unit tests for gate decisions.

## 3. Main Process Enforcement
- [ ] 3.1 Persist and read local plugin safe-mode state.
- [ ] 3.2 Return plugin safety gates from the plugins list API.
- [ ] 3.3 Gate Claude plugin enablement on reviewed current fingerprints.
- [ ] 3.4 Gate plugin MCP inclusion on safe mode and reviewed current fingerprints.
- [ ] 3.5 Skip the Locus-managed Claude plugin directory symlink when safe mode is enabled.
- [ ] 3.6 Add targeted tests for enablement, safe mode, and MCP gate behavior.

## 4. UI / UX
- [ ] 4.1 Add visible safe-mode controls in Settings > Plugins.
- [ ] 4.2 Show per-plugin gate state and blocked reasons.
- [ ] 4.3 Disable or explain enable/MCP actions when gates block capability.
- [ ] 4.4 Localize all new copy in English and Simplified Chinese.
- [ ] 4.5 Add UI source-guard tests.

## 5. Verification
- [ ] 5.1 Run targeted plugin and i18n tests.
- [ ] 5.2 Run full `bun run test`.
- [ ] 5.3 Run `bun run ts:check`.
- [ ] 5.4 Run `openspec validate add-plugin-safe-mode-gates --strict --no-interactive`.
- [ ] 5.5 Run `git diff --check`.
- [ ] 5.6 Start the dev app with a clean QA userData path and verify Settings > Plugins.
- [ ] 5.7 Record a real UI smoke video and screenshot.
- [ ] 5.8 Review UI/UX after smoke and fix issues found.
