## 1. Contracts
- [ ] 1.1 Add shared runtime marketplace/listing/diagnostic types separate from `PluginStoreCatalogEntry`.
- [ ] 1.2 Define status normalization for Codex and Claude installed/enabled/available/unavailable/degraded states.
- [ ] 1.3 Keep Locus pinned store candidate types scoped to Locus-native store flows.

## 2. Runtime Adapters
- [ ] 2.1 Add a bounded Codex marketplace adapter for `codex plugin marketplace list`.
- [ ] 2.2 Add a bounded Codex plugin listing adapter for `codex plugin list`.
- [ ] 2.3 Add a bounded Claude marketplace adapter for `claude plugin marketplace list`.
- [ ] 2.4 Add a Claude plugin listing adapter for `claude plugin list --json` and `claude plugin list --available --json`.
- [ ] 2.5 Preserve filesystem scanners as fallback/component enrichment with explicit diagnostics when CLI state is unavailable or conflicts.

## 3. API
- [ ] 3.1 Add tRPC queries for runtime marketplace summaries and runtime plugin listings.
- [ ] 3.2 Add Doctor/Debug output for runtime CLI availability, command errors, parse errors, stale fallback state, and source conflicts.
- [ ] 3.3 Ensure runtime marketplace queries do not install, update, remove, enable, disable, or execute plugins.

## 4. UI
- [ ] 4.1 Separate Codex, Claude Code, and Locus-native plugin scopes in Settings > Plugins.
- [ ] 4.2 Rename or relabel the current `Store` view as `Locus Store` or `Pinned Candidates`.
- [ ] 4.3 Add a runtime `Marketplaces` view that shows source/root/status and available plugin counts.
- [ ] 4.4 Show installed/available plugin status, version, source/path, runtime, and component summary per runtime.
- [ ] 4.5 Keep runtime write actions disabled or guidance-only in this slice.

## 5. Verification
- [ ] 5.1 Add unit fixtures for Codex marketplace/list table parsing.
- [ ] 5.2 Add unit fixtures for Claude marketplace/list JSON and empty states.
- [ ] 5.3 Add Doctor tests for CLI missing, timeout, parse failure, and filesystem fallback mismatch.
- [ ] 5.4 Add UI tests for runtime tabs, Locus store labeling, empty states, and no cross-runtime install controls.
- [ ] 5.5 Run `bun run test`, `bun run ts:check`, `openspec validate add-runtime-plugin-marketplace-center --strict --no-interactive`, and `git diff --check`.
