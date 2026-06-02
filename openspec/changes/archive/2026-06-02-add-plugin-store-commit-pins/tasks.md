## 1. OpenSpec
- [x] 1.1 Review current `runtime-plugins` spec and plugin update-review changes for conflicts.
- [x] 1.2 Add proposal, design, tasks, and spec delta for plugin store commit pins.
- [x] 1.3 Run `openspec validate add-plugin-store-commit-pins --strict --no-interactive`.
- [x] 1.4 Obtain explicit approval before implementation.

## 2. Shared Store Review Model
- [x] 2.1 Add store catalog, candidate, source-pin, approval, and backup metadata types.
- [x] 2.2 Add bounded validation for immutable commit pins, package hashes, target modes, permissions, MCP, and controlled UI metadata.
- [x] 2.3 Add candidate review document builders and diff helpers.
- [x] 2.4 Reject mutable refs, missing write-action hashes, path traversal, and remote developer-trusted-code requests.
- [x] 2.5 Add unit tests for valid candidates, invalid pins, hash changes, target-mode changes, MCP changes, controlled UI changes, and stale approvals.

## 3. Main Process Store APIs
- [x] 3.1 Add local store catalog registry and read-only candidate preview APIs.
- [x] 3.2 Compute candidate review fingerprints in main without executing plugin code.
- [x] 3.3 Add exact-candidate approval storage bound to store entry, commit pin, package hash, and candidate fingerprint.
- [x] 3.4 Add backup-first install/update write actions gated on current approved candidate.
- [x] 3.5 Recompute candidate metadata in main before approval and write actions.
- [x] 3.6 Add Doctor/Debug facts for store pin status, approval freshness, candidate diffs, and backup metadata.

## 4. Renderer UI
- [x] 4.1 Add store pin and candidate status rows to Settings > Plugins.
- [x] 4.2 Add install/update review preview with bounded diffs.
- [x] 4.3 Add explicit approve pinned candidate action and separate install/update action.
- [x] 4.4 Add warnings that pins are reproducibility metadata, not proof of safety.
- [x] 4.5 Add English and Simplified Chinese copy.
- [x] 4.6 Review UI after smoke and fix clarity/layout issues.

## 5. Tests and Verification
- [x] 5.1 Add shared store catalog/candidate/pin tests.
- [x] 5.2 Add main-process preview, approval, backup, and stale-candidate tests.
- [x] 5.3 Add source guards for no `latest`, no remote trusted-code, no renderer-trusted candidate metadata, no plugin execution during preview/install/update, and no MCP auto-activation.
- [x] 5.4 Add renderer/i18n source-guard tests for pin wording and forbidden trust labels.
- [x] 5.5 Run targeted store pin tests.
- [x] 5.6 Run full `bun run test`.
- [x] 5.7 Run `bun run ts:check`.
- [x] 5.8 Run `openspec validate add-plugin-store-commit-pins --strict --no-interactive`.
- [x] 5.9 Run `git diff --check`.
- [x] 5.10 Run desktop Settings > Plugins smoke with a clean QA userData path and a temporary pinned store candidate.
- [x] 5.11 Record screenshot and video evidence.
