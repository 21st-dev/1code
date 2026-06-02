## 1. Contracts
- [x] 1.1 Add shared runtime marketplace/listing/diagnostic types separate from `PluginStoreCatalogEntry`.
- [x] 1.2 Define status normalization for Codex and Claude installed/enabled/available/unavailable/degraded states.
- [x] 1.3 Keep Locus pinned store candidate types scoped to Locus-native store flows.

## 2. Runtime Adapters
- [x] 2.1 Add a bounded Codex marketplace adapter for `codex plugin marketplace list`.
- [x] 2.2 Add a bounded Codex plugin listing adapter for `codex plugin list`.
- [x] 2.3 Add a bounded Claude marketplace adapter for `claude plugin marketplace list`.
- [x] 2.4 Add a Claude plugin listing adapter for `claude plugin list --json` and `claude plugin list --available --json`.
- [x] 2.5 Preserve filesystem scanners as fallback/component enrichment with explicit diagnostics when CLI state is unavailable or conflicts.

## 3. API
- [x] 3.1 Add tRPC queries for runtime marketplace summaries and runtime plugin listings.
- [x] 3.2 Add Doctor/Debug output for runtime CLI availability, command errors, parse errors, stale fallback state, and source conflicts.
- [x] 3.3 Ensure runtime marketplace queries do not install, update, remove, enable, disable, or execute plugins.

## 4. UI
- [x] 4.1 Separate Codex, Claude Code, and Locus-native plugin scopes in Settings > Plugins.
- [x] 4.2 Rename or relabel the current `Store` view as `Locus Store` or `Pinned Candidates`.
- [x] 4.3 Add a runtime `Marketplaces` view that shows source/root/status and available plugin counts.
- [x] 4.4 Show installed/available plugin status, version, source/path, runtime, and component summary per runtime.
- [x] 4.5 Keep runtime write actions disabled or guidance-only in this slice.

## 5. Verification
- [x] 5.1 Add unit fixtures for Codex marketplace/list table parsing.
- [x] 5.2 Add unit fixtures for Claude marketplace/list JSON and empty states.
- [x] 5.3 Add Doctor tests for CLI missing, timeout, parse failure, and filesystem fallback mismatch.
- [x] 5.4 Add UI tests for runtime tabs, Locus store labeling, empty states, and no cross-runtime install controls.
- [x] 5.5 Run `bun run test`, `bun run ts:check`, `openspec validate add-runtime-plugin-marketplace-center --strict --no-interactive`, and `git diff --check`.
- [x] 5.6 Run a local UI smoke with recorded evidence for the runtime marketplace view.
