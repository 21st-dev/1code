## Context
The current plugin update-review slice stores local manifest fingerprints and advisory `sourcePins` such as Codex cache versions and lock-file source refs. This helps users notice change, but it is not yet a store governance model:

- No store catalog schema exists.
- No install/update preview flow exists.
- No approved store commit pin is recorded separately from advisory package metadata.
- No rollback/backup workflow is defined for replacing local packages.

Phase 6 adds store commit pinning and marketplace review flow while preserving the trust boundaries from earlier phases.

## Goals
- Represent plugin store entries as immutable reviewed source pins.
- Prefer full commit SHAs and package content hashes over mutable branch names or `latest`.
- Show a bounded install/update preview before writing plugin files.
- Record local approval for the exact store candidate and package hash.
- Detect store candidate changes, permission changes, MCP changes, controlled UI changes, target-mode changes, and source-pin changes.
- Keep remote store packages out of `developer-trusted-code`.
- Provide backup/rollback metadata for local package replacement.

## Non-Goals
- Do not install `latest`.
- Do not auto-update plugins.
- Do not execute store plugin code during preview, install, update, or review.
- Do not allow store packages to become developer trusted plugins.
- Do not claim commit pins or content hashes prove code is safe.
- Do not silently activate plugin MCP servers or controlled UI actions after update.
- Do not fetch or display raw secrets.

## Store Catalog Model
A store catalog entry should include:

```json
{
  "schemaVersion": 1,
  "id": "example.plugin",
  "runtime": "claude",
  "name": "Example Plugin",
  "version": "1.2.3",
  "source": {
    "type": "git",
    "repo": "owner/repo",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "path": "plugins/example"
  },
  "package": {
    "sha256": "hex...",
    "sizeBytes": 12345
  },
  "targetMode": "manifest-only",
  "declaredPermissions": [],
  "declaredMcpServers": []
}
```

Rules:

- Commit pins must be full immutable commit SHAs when the source type is git.
- Mutable refs such as `main`, `latest`, tags without resolved commits, or branch names are rejected for approved install/update.
- Package hashes are strongly preferred and should be required for write actions when available.
- Store entries may declare `manifest-only` or `controlled-ui`; `developer-trusted-code` is rejected for remote store entries.

## Review Flow
Install/update flow:

1. User opens store entry or update candidate.
2. Locus fetches or reads bounded store metadata and package metadata.
3. Locus computes a candidate review document without executing plugin code.
4. Locus compares candidate against the installed plugin review document when available.
5. Settings > Plugins shows source pin, package hash, target mode, permissions, MCP, controlled UI, and bounded diffs.
6. User approves the exact pinned candidate.
7. Locus backs up the previous local package metadata and writes or replaces plugin files.
8. Locus records the installed candidate source pin, content hash, approval timestamp, and backup metadata.
9. New MCP servers and controlled UI actions remain separately gated after installation.

Preview and approval are distinct. A preview never writes files.

## Update Semantics
Store updates should be reported as:

- `not-installed`
- `installed-current`
- `update-available`
- `pin-changed`
- `package-hash-changed`
- `review-required`
- `blocked-invalid-pin`

Any change to command counts, skills, agents, MCP declaration, controlled UI declaration, target mode, permission metadata, package hash, or source pin requires review before replacement.

## Storage
Store governance can extend local plugin review state unless a larger registry DB is needed:

```text
plugin-review-state.json
storeCatalogs[]
storeCandidates[storeEntryId]
storeApprovals[storeEntryId + commit + packageHash]
installedStorePackages[pluginReviewKey]
backupRecords[]
```

Stored data should include bounded metadata, hashes, paths, timestamps, and review decisions. Do not store package source text or secret values in review state.

## UI
Settings > Plugins should extend the existing review/source panels:

- Store pin row: repo, commit, path, package hash, candidate status.
- Candidate diff panel: concise changes against installed or last reviewed package.
- Review action: approve pinned install/update.
- Backup/rollback metadata: previous package path and timestamp when available.
- Warning copy: commit pinning helps review repeatability, not safety proof.

Avoid:

```text
verified safe
trusted marketplace
install latest
auto-update
developer trusted from store
```

## Doctor / Debug
Doctor should report:

- Invalid or mutable pins.
- Missing package hash for write actions.
- Candidate differs from installed package.
- Store approval is stale because commit or package hash changed.
- Store package is trying to request developer-trusted-code.
- Backup metadata exists for replaced packages.

## Security Considerations
- Store metadata is untrusted input. Validate schema and bounds before display or write.
- Renderer must not pass trusted candidate metadata; main process recomputes candidate state before approval or write.
- Store package extraction must prevent path traversal and symlink escape.
- Write actions must use atomic replace or backup-first semantics.
- Store approval does not approve MCP activation, controlled UI actions, or developer trusted code.
- Store commit pins help reproducibility, not runtime safety.

## Rollout
1. Add store catalog and candidate review schema.
2. Add source-pin types and review document fields.
3. Add preview-only store candidate APIs.
4. Add approval and backup metadata.
5. Add install/update write actions gated on exact approved candidate.
6. Add Settings UI, Doctor/Debug, tests, smoke, screenshot, and recording.
