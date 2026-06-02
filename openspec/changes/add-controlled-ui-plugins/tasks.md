## 1. OpenSpec
- [x] 1.1 Review current `runtime-plugins` spec and active plugin changes for conflicts.
- [x] 1.2 Add proposal, design, tasks, and spec delta for controlled UI plugin contributions.
- [x] 1.3 Run `openspec validate add-controlled-ui-plugins --strict --no-interactive`.
- [ ] 1.4 Obtain explicit approval before implementation.

## 2. Shared Contribution Model
- [ ] 2.1 Add controlled UI contribution schema and TypeScript types.
- [ ] 2.2 Add validation helpers with bounded string/count limits and unknown-field handling.
- [ ] 2.3 Add eligibility/gate helpers for reviewed fingerprint, safe mode, runtime ownership, and schema validity.
- [ ] 2.4 Add fingerprint-bound controlled UI permission grant helpers.
- [ ] 2.5 Add unit tests for valid/invalid manifests, stale grants, and gate decisions.

## 3. Main Process Discovery and API
- [ ] 3.1 Scan optional `.locus-plugin/ui.json` manifests without executing plugin code.
- [ ] 3.2 Include contribution manifest fingerprints in plugin review documents.
- [ ] 3.3 Add contribution diagnostics to Doctor/Debug output.
- [ ] 3.4 Expose controlled UI contributions through the plugins tRPC router.
- [ ] 3.5 Add a gated action invocation mutation for allowlisted controlled actions only.
- [ ] 3.6 Recompute current plugin fingerprint and controlled UI gate inside action invocation.
- [ ] 3.7 Add per-plugin controlled UI state storage if settings fields are implemented.

## 4. Renderer UI
- [ ] 4.1 Add Settings > Plugins controlled UI contribution panel.
- [ ] 4.2 Render declarative settings sections using Locus-owned components.
- [ ] 4.3 Render controlled command buttons with blocked/safe-mode/review states.
- [ ] 4.4 Add a first workbench panel host or mark workbench contributions as planned if not yet wired.
- [ ] 4.5 Add English and Simplified Chinese copy.
- [ ] 4.6 Review UI after smoke and fix clarity/layout issues.

## 5. Tests and Verification
- [ ] 5.1 Add shared schema/gate/grant tests.
- [ ] 5.2 Add main-process scanner, stale-grant, and review-fingerprint tests.
- [ ] 5.3 Add router/action source guards for no plugin JS, no DOM patching, no iframe/webview plugin pages, no shell, and no automatic send.
- [ ] 5.4 Add renderer/i18n source-guard tests.
- [ ] 5.5 Run targeted controlled UI plugin tests.
- [ ] 5.6 Run full `bun run test`.
- [ ] 5.7 Run `bun run ts:check`.
- [ ] 5.8 Run `openspec validate add-controlled-ui-plugins --strict --no-interactive`.
- [ ] 5.9 Run `git diff --check`.
- [ ] 5.10 Run desktop Settings > Plugins smoke with a clean QA userData path.
- [ ] 5.11 Record screenshot and video evidence.
