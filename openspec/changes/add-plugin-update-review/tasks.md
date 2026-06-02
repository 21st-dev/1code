## 1. OpenSpec

- [x] 1.1 Review current `runtime-plugins` spec and active changes for conflicts.
- [x] 1.2 Add proposal, design, tasks, and spec delta for plugin update review metadata.
- [x] 1.3 Run `openspec validate add-plugin-update-review --strict --no-interactive`.
- [x] 1.4 Commit the OpenSpec slice separately.

## 2. Review Metadata Model

- [x] 2.1 Add shared update-review types and deterministic fingerprint/diff helpers.
- [x] 2.2 Add local review-state storage in app userData with atomic JSON writes.
- [x] 2.3 Extract optional source pins from Codex cache version directories and `plugin.lock.json` source refs when available.
- [x] 2.4 Add tests for hash stability, bounded diffs, source-pin extraction, and local review acknowledgement.
- [x] 2.5 Commit the metadata/storage slice separately.

## 3. Plugin API Integration

- [x] 3.1 Add review metadata to plugin list tRPC output.
- [x] 3.2 Add a local-only mutation to mark the current fingerprint as reviewed.
- [x] 3.3 Bind plugin MCP approval to redacted current MCP configuration fingerprints and treat legacy approvals as stale.
- [x] 3.4 Ensure refresh does not download, install, update, enable, or execute plugins.
- [x] 3.5 Add router/source tests for read-only review behavior and MCP approval revalidation.
- [x] 3.6 Commit the API slice separately.

## 4. Settings UI

- [x] 4.1 Add compact review status, manifest hash, optional source pin, and last reviewed timestamp to plugin detail.
- [x] 4.2 Add a bounded change summary panel for manifest/update changes.
- [x] 4.3 Add an advisory "Mark reviewed" button that does not affect execution, enablement, or MCP approval.
- [x] 4.4 Add English and Chinese localization strings.
- [x] 4.5 Add UI source tests for wording and no fake install/update controls.
- [x] 4.6 Commit the UI slice separately.

## 5. Verification

- [x] 5.1 Run targeted tests for plugin update review and i18n.
- [x] 5.2 Run `bun run test`.
- [x] 5.3 Run `bun run ts:check`.
- [x] 5.4 Run `git diff --check`.
- [x] 5.5 Start the local app/dev server.
- [x] 5.6 Use desktop verification to inspect Settings > Plugins update review UI.
- [x] 5.7 Capture screenshot and recording/video evidence.
- [x] 5.8 Review UI/UX issues after the real smoke and fix any found issues in a separate commit.
