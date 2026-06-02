## 1. OpenSpec
- [x] 1.1 Review current `runtime-plugins` spec and plugin update-review changes for conflicts.
- [x] 1.2 Add proposal, design, tasks, and spec delta for plugin store commit pins.
- [x] 1.3 Run `openspec validate add-plugin-store-commit-pins --strict --no-interactive`.
- [ ] 1.4 Obtain explicit approval before implementation.

## 2. Shared Store Review Model
- [ ] 2.1 Add store catalog, candidate, source-pin, approval, and backup metadata types.
- [ ] 2.2 Add bounded validation for immutable commit pins, package hashes, target modes, permissions, MCP, and controlled UI metadata.
- [ ] 2.3 Add candidate review document builders and diff helpers.
- [ ] 2.4 Reject mutable refs, missing write-action hashes, path traversal, and remote developer-trusted-code requests.
- [ ] 2.5 Add unit tests for valid candidates, invalid pins, hash changes, target-mode changes, MCP changes, controlled UI changes, and stale approvals.

## 3. Main Process Store APIs
- [ ] 3.1 Add local store catalog registry and read-only candidate preview APIs.
- [ ] 3.2 Compute candidate review fingerprints in main without executing plugin code.
- [ ] 3.3 Add exact-candidate approval storage bound to store entry, commit pin, package hash, and candidate fingerprint.
- [ ] 3.4 Add backup-first install/update write actions gated on current approved candidate.
- [ ] 3.5 Recompute candidate metadata in main before approval and write actions.
- [ ] 3.6 Add Doctor/Debug facts for store pin status, approval freshness, candidate diffs, and backup metadata.

## 4. Renderer UI
- [ ] 4.1 Add store pin and candidate status rows to Settings > Plugins.
- [ ] 4.2 Add install/update review preview with bounded diffs.
- [ ] 4.3 Add explicit approve pinned candidate action and separate install/update action.
- [ ] 4.4 Add warnings that pins are reproducibility metadata, not proof of safety.
- [ ] 4.5 Add English and Simplified Chinese copy.
- [ ] 4.6 Review UI after smoke and fix clarity/layout issues.

## 5. Tests and Verification
- [ ] 5.1 Add shared store catalog/candidate/pin tests.
- [ ] 5.2 Add main-process preview, approval, backup, and stale-candidate tests.
- [ ] 5.3 Add source guards for no `latest`, no remote trusted-code, no renderer-trusted candidate metadata, no plugin execution during preview/install/update, and no MCP auto-activation.
- [ ] 5.4 Add renderer/i18n source-guard tests for pin wording and forbidden trust labels.
- [ ] 5.5 Run targeted store pin tests.
- [ ] 5.6 Run full `bun run test`.
- [ ] 5.7 Run `bun run ts:check`.
- [ ] 5.8 Run `openspec validate add-plugin-store-commit-pins --strict --no-interactive`.
- [ ] 5.9 Run `git diff --check`.
- [ ] 5.10 Run desktop Settings > Plugins smoke with a clean QA userData path and a temporary pinned store candidate.
- [ ] 5.11 Record screenshot and video evidence.
