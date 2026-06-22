## Status: Deferred — parked

Do not start implementation. See `proposal.md` -> Status for the trigger
conditions that must all be true before this change is reopened.

## 1. Import And Projection

- [ ] 1.1 Add "Import as Locus Agent" for runtime-native discovered agents.
- [ ] 1.2 Add "Duplicate to Locus Agent" for plugin-provided agents.
- [ ] 1.3 Add projection records for prompt-context availability.
- [ ] 1.4 Add Claude native materialization only for Locus-managed isolated
      runtime homes after compatibility, discovery, and drift checks are
      implemented.
- [ ] 1.5 Add Codex native projection only after a stable native primitive and
      smoke evidence exist.
- [ ] 1.6 Defer writes to user-managed `~/.claude/agents` or project
      `.claude/agents` directories to a separate approved change with conflict
      preview, ownership markers, rollback, and manual smoke evidence.

## 2. Verification

- [ ] 2.1 Add unit tests for import, duplicate, provenance, drift, conflict, and
      write-refusal behavior.
- [ ] 2.2 Add runtime-specific smoke or equivalent integration proof for any
      native materialization status this change reports.
- [ ] 2.3 Run `openspec validate add-agent-native-projection-writes --strict
      --no-interactive`.
- [ ] 2.4 Run `openspec validate --all --strict --no-interactive`.
