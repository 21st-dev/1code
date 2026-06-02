## 1. OpenSpec
- [x] 1.1 Review current `runtime-plugins` spec and active plugin changes for conflicts.
- [x] 1.2 Add proposal, design, tasks, and spec delta for developer trusted plugins.
- [x] 1.3 Run `openspec validate add-developer-trusted-plugins --strict --no-interactive`.
- [x] 1.4 Obtain explicit approval before implementation.

## 2. Shared Trust Model
- [x] 2.1 Add developer plugin manifest schema, bounded validation, and TypeScript types.
- [x] 2.2 Add developer trusted-code target-mode helpers and diagnostics.
- [x] 2.3 Add developer trust gate helpers for safe mode, Developer Plugin Mode, reviewed fingerprint, runtime/source ownership, and per-plugin trust acknowledgement.
- [x] 2.4 Add review document fields for developer manifest, canonical entry path, entry content hash, and bounded bundle metadata.
- [x] 2.5 Add unit tests for valid manifests, invalid manifests, path escape, stale trust, and gate decisions.

## 3. Main Process Discovery and State
- [ ] 3.1 Add local developer source registry state without touching remote marketplace sources.
- [ ] 3.2 Discover developer plugin directories and parse `.locus-plugin/developer.json` without executing code.
- [ ] 3.3 Include developer manifest facts in plugin review scans and change diffs.
- [ ] 3.4 Add mutations to enable Developer Plugin Mode and trust/revoke a current plugin fingerprint.
- [ ] 3.5 Recompute gates, realpaths, and executable content hashes in main process before every trust, load, and invocation action.
- [ ] 3.6 Add Doctor/Debug facts for developer source, trust, gate, and load state.

## 4. Trusted Runtime Loader
- [ ] 4.1 Add a minimal developer plugin loader that imports only contained local entrypoints after all gates pass.
- [ ] 4.2 Provide a narrow Locus developer plugin API object instead of broad app internals.
- [ ] 4.3 Block loading before import when plugin safe mode is enabled.
- [ ] 4.4 Add an out-of-band forced safe-mode or startup recovery path for broken developer plugins.
- [ ] 4.5 Record bounded load status/errors without exposing plugin source code or secrets.
- [ ] 4.6 Add source-guard tests that no developer plugin loads from remote URLs, Codex cache, or marketplace packages.

## 5. Renderer UI
- [ ] 5.1 Add Settings > Plugins developer mode controls near safe mode.
- [ ] 5.2 Add a developer trust panel for local developer plugins only.
- [ ] 5.3 Show full-trust warnings and current fingerprint trust state.
- [ ] 5.4 Add English and Simplified Chinese copy.
- [ ] 5.5 Review UI after smoke and fix clarity/layout issues.

## 6. Tests and Verification
- [ ] 6.1 Add shared manifest/gate/trust tests.
- [ ] 6.2 Add main-process source registry, scanner, loader, stale-trust, executable-content-hash, and safe-mode tests.
- [ ] 6.3 Add router/source guards for no renderer-trusted gates, no remote load, no Codex cache execution, no automatic MCP/provider/terminal mutation.
- [ ] 6.4 Add renderer/i18n source-guard tests for warning copy and forbidden labels.
- [ ] 6.5 Run targeted developer plugin tests.
- [ ] 6.6 Run full `bun run test`.
- [ ] 6.7 Run `bun run ts:check`.
- [ ] 6.8 Run `openspec validate add-developer-trusted-plugins --strict --no-interactive`.
- [ ] 6.9 Run `git diff --check`.
- [ ] 6.10 Run desktop Settings > Plugins smoke with a clean QA userData path, forced safe-mode recovery, and a temporary local developer plugin.
- [ ] 6.11 Record screenshot and video evidence.
