## Context

The previous `add-locus-plugin-target-modes` change makes runtime plugin packages visible while keeping all discovered packages `manifest-only`. This follow-up adds a local review memory so Locus can say when a package manifest changed, whether a store/source pin is visible, and which manifest fields changed.

## Goals / Non-Goals

Goals:

- Compute deterministic fingerprints from manifest-like metadata and declared component paths.
- Persist local review state in app user data without storing plugin source code.
- Surface review states as advisory metadata: `new`, `unchanged`, `changed`, and `reviewed`.
- Extract optional source pins from stable metadata such as Codex cache version directories and `plugin.lock.json` refs.
- Keep Codex plugin controls read-only and keep all update behavior local.

Non-Goals:

- Do not download remote plugin updates.
- Do not install or replace plugin packages.
- Do not enable new plugin capabilities automatically.
- Do not execute arbitrary plugin JavaScript.
- Do not claim that manifest hashes, lock refs, or pins prove safety.
- Do not build a full permission-diff engine for arbitrary plugin code.

## Decisions

- Decision: Use app userData JSON state, not SQLite, for this review cache.
  - Why: Review state is local advisory metadata with a simple key/value shape, closer to skill registry state than relational app data.
  - Path: `plugin-review-state.json` under the Locus user data directory.

- Decision: Hash a bounded manifest review document, not the entire plugin directory.
  - Why: This slice reviews declared metadata and capability-like declarations. Hashing all files would imply package integrity guarantees Locus does not yet enforce.
  - Included: runtime, source, marketplace, name, version, target mode, component paths, tags, category, homepage, and discovered component counts/MCP names where available.

- Decision: Treat source pins as advisory.
  - Why: A lock `ref`, cache version directory, or source commit can help review changes, but it does not sandbox code or prove trust.
  - UI wording must say "review metadata", "source pin", or "advisory", not "verified safe".

- Decision: Record review acknowledgement as local metadata only.
  - Why: Marking a fingerprint reviewed helps future diffing, but it does not enable plugin execution or MCP approval.

- Decision: Bind plugin MCP approval to a redacted MCP configuration fingerprint.
  - Why: A string-only approval such as `pluginSource:serverName` would survive command, URL, or environment/header key changes. The approval identifier must include a fingerprint derived from approval-relevant metadata, while raw secret values are omitted or represented only as presence flags.
  - Included: plugin source, server name, command, URL with query values redacted, args with sensitive values redacted, cwd, transport/auth fields, env/header key sets, value-presence flags, and OAuth field names.
  - Excluded: raw env values, raw header values, OAuth token values, and arbitrary plugin source files.

## Update Handling

Plugin refresh:

- Re-scan local manifest metadata.
- Compute the current manifest hash.
- Compare it with stored last seen and last reviewed fingerprints.
- Produce a bounded diff for fields such as version, target mode, component counts, MCP names, and source pin.

Plugin MCP approval:

- Build a redacted MCP approval document for each Claude plugin MCP server.
- Store and compare approvals by a fingerprint-bound identifier.
- Treat legacy string-only approvals as stale, so changed plugin MCP declarations return to pending approval.

Review acknowledgement:

- Store the current fingerprint as reviewed with a timestamp.
- Do not change plugin enablement, MCP approval, or execution status.

Codex++ / Codex plugin store updates:

- If a cache version directory, lock file ref, or package version changes, report it as update-review metadata.
- Continue to treat Codex++ as reference input only.

## Risks / Trade-Offs

- Risk: Users may mistake hashes or pins for trust.
  - Mitigation: UI labels say advisory review metadata and keep execution status visible.

- Risk: Full directory hashing could become expensive and overclaim integrity.
  - Mitigation: Hash only bounded manifest review documents.

- Risk: Local review state may become stale if packages are deleted and reinstalled.
  - Mitigation: Use runtime/source/path identity and show `new` or `changed` after refresh.

## Migration Plan

1. Add OpenSpec delta.
2. Add shared update-review types and deterministic hash/diff helpers.
3. Add main-process local review-state storage and tRPC review acknowledgement mutation.
4. Add Settings > Plugins review panel and local-only review button.
5. Add tests and real UI smoke evidence.
