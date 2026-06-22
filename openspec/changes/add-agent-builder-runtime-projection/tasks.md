## 1. Product And Spec Alignment

First implementation slice: complete sections 1-4 before starting import,
projection writes, or runtime-native execution work. Section 5 is a later gate,
not permission to ship the full direction in one pass. Section 6 verification
applies to every implementation slice.

- [x] 1.1 Ratify the product labels: Locus Agent / Agent, Claude native agents,
      Codex native agents, plugin-provided agents, and prompt-only mode.
- [x] 1.2 Update audit docs so they no longer describe `trpc.agents` as a second
      SQLite agents table.
- [x] 1.3 Update `docs/OWNERSHIP_MAP.md` with the Agent Builder aggregation owner
      before implementing long-lived services.

## 2. Canonical Locus Agent Cleanup

- [ ] 2.1 Rename user-facing App Agent copy to the approved Agent Builder labels
      while preserving storage keys and DB table names unless explicitly approved.
- [ ] 2.2 Prove whether `agent-dialog.tsx` and `trpc.agents` UI CRUD are dead,
      hidden, or still reachable.
- [ ] 2.3 Remove or hide the Custom Agents UI path after proving no active
      product entrypoint depends on it.
- [ ] 2.4 Add i18n or architecture guards preventing "Custom Agents" from
      returning as a product-facing label.

## 3. Runtime-Neutral Prompt Application

- [ ] 3.1 Ensure `@[agent:name]` resolves only to canonical Locus Agents.
- [ ] 3.2 Keep Claude prompt-context application covered by tests.
- [ ] 3.3 Add Codex prompt-context application or explicitly gate Codex with a
      runtime capability reason before provider work starts.
- [ ] 3.4 Add missing-agent tests for every runtime path that accepts `@agent`
      mentions.

## 4. Agent Builder Read Model

- [ ] 4.1 Add a main-process read model that aggregates Locus Agents,
      runtime-native discovered agents, and plugin-provided agents with source,
      owner, mutability, and sanitized diagnostics.
- [ ] 4.2 Render one Agent Builder surface from that read model.
- [ ] 4.3 Show runtime support rows per agent without inferring capability truth
      in renderer code.
- [ ] 4.4 Preserve read-only behavior for plugin-provided and runtime-owned
      listings unless the user imports or duplicates them.

## 5. Import And Projection

Do not start this section until sections 1-4 are implemented and reviewed.

- [ ] 5.1 Add "Import as Locus Agent" for runtime-native discovered agents.
- [ ] 5.2 Add "Duplicate to Locus Agent" for plugin-provided agents.
- [ ] 5.3 Add projection records for prompt-context availability.
- [ ] 5.4 Add Claude native materialization only for Locus-managed isolated
      runtime homes after compatibility, discovery, and drift checks are
      implemented.
- [ ] 5.5 Add Codex native projection only after a stable native primitive and
      smoke evidence exist.
- [ ] 5.6 Defer writes to user-managed `~/.claude/agents` or project
      `.claude/agents` directories to a separate approved change with conflict
      preview, ownership markers, rollback, and manual smoke evidence.

## 6. Verification

- [ ] 6.1 Add unit tests for source badges, mutability, projection status, and
      non-secret diagnostics.
- [ ] 6.2 Add runtime prompt tests for Claude and Codex paths.
- [ ] 6.3 Add architecture guards against duplicate Agent business paths.
- [ ] 6.4 Run `openspec validate add-agent-builder-runtime-projection --strict
      --no-interactive`.
