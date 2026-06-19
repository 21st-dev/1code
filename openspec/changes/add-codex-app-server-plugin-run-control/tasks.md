## 1. Proof

- [ ] 1.1 Identify the Codex app-server primitive that can control plugins per run
  or thread.
- [ ] 1.2 With an isolated `CODEX_HOME` and a seeded plugin, prove a reviewed and
  allowed plugin component appears in the managed run.
- [ ] 1.3 With the same seeded plugin globally installed/enabled, prove an unreviewed
  or explicitly denied plugin component is absent from that managed run.
- [ ] 1.4 Prove safe mode exposes zero Codex plugin components while preserving
  non-plugin Codex behavior.
- [ ] 1.5 Prove plugin MCP declarations remain approval-gated or are filtered before
  any active tool connection exists.

## 2. Implementation

- [ ] 2.1 Wire the proven primitive into the Codex app-server adapter through the
  shared runtime-native activation policy owner.
- [ ] 2.2 Keep plugin review, enablement, safe mode, identity drift, MCP approval, and
  recovery gates as inputs to the single activation decision.
- [ ] 2.3 Update Settings > Plugins to show Codex component status from the proven
  per-run control result rather than cache presence.
- [ ] 2.4 Keep non-plugin Codex startup available when a plugin is blocked or fails to
  stage/load.

## 3. Validation

- [ ] 3.1 Focused Codex app-server unit tests pass.
- [ ] 3.2 Seeded app-server proof script passes for allowed, denied, safe-mode, and
  MCP-bearing cases.
- [ ] 3.3 `bun run ts:check` passes.
- [ ] 3.4 `openspec validate add-codex-app-server-plugin-run-control --strict
  --no-interactive` passes.
