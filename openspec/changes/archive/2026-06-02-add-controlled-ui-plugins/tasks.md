## 1. OpenSpec
- [x] 1.1 Review current `runtime-plugins` spec and active plugin changes for conflicts.
- [x] 1.2 Add proposal, design, tasks, and spec delta for controlled UI plugin contributions.
- [x] 1.3 Run `openspec validate add-controlled-ui-plugins --strict --no-interactive`.
- [x] 1.4 Obtain explicit approval before implementation.

## 2. Shared Contribution Model
- [x] 2.1 Add controlled UI contribution schema and TypeScript types.
- [x] 2.2 Add validation helpers with bounded string/count limits and unknown-field handling.
- [x] 2.3 Add eligibility/gate helpers for reviewed fingerprint, safe mode, runtime ownership, and schema validity.
- [x] 2.4 Add fingerprint-bound controlled UI permission grant helpers.
- [x] 2.5 Add unit tests for valid/invalid manifests, stale grants, and gate decisions.

## 3. Main Process Discovery and API
- [x] 3.1 Scan optional `.locus-plugin/ui.json` manifests without executing plugin code.
- [x] 3.2 Include contribution manifest fingerprints in plugin review documents.
- [x] 3.3 Add contribution diagnostics to Doctor/Debug output.
- [x] 3.4 Expose controlled UI contributions through the plugins tRPC router.
- [x] 3.5 Add a gated action invocation mutation for allowlisted controlled actions only.
- [x] 3.6 Recompute current plugin fingerprint and controlled UI gate inside action invocation.
- [x] 3.7 Add per-plugin controlled UI state storage if settings fields are implemented.

## 4. Renderer UI
- [x] 4.1 Add Settings > Plugins controlled UI contribution panel.
- [x] 4.2 Render declarative settings sections using Locus-owned components.
- [x] 4.3 Render controlled command buttons with blocked/safe-mode/review states.
- [x] 4.4 Add a first workbench panel host or mark workbench contributions as planned if not yet wired.
- [x] 4.5 Add English and Simplified Chinese copy.
- [x] 4.6 Review UI after smoke and fix clarity/layout issues.

## 5. Tests and Verification
- [x] 5.1 Add shared schema/gate/grant tests.
- [x] 5.2 Add main-process scanner, stale-grant, and review-fingerprint tests.
- [x] 5.3 Add router/action source guards for no plugin JS, no DOM patching, no iframe/webview plugin pages, no shell, and no automatic send.
- [x] 5.4 Add renderer/i18n source-guard tests.
- [x] 5.5 Run targeted controlled UI plugin tests.
- [x] 5.6 Run full `bun run test`.
- [x] 5.7 Run `bun run ts:check`.
- [x] 5.8 Run `openspec validate add-controlled-ui-plugins --strict --no-interactive`.
- [x] 5.9 Run `git diff --check`.
- [x] 5.10 Run desktop Settings > Plugins smoke with a clean QA userData path.
- [x] 5.11 Record screenshot and video evidence.
