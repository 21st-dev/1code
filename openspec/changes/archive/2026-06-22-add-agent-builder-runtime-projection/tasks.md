## 1. Product And Spec Alignment

This archived implementation slice covers product/spec alignment, canonical
Agent cleanup, cross-runtime prompt-context consistency, and the read-only Agent
Builder aggregation model. Import, projection writes, and runtime-native
execution work are parked in `add-agent-native-projection-writes`.

- [x] 1.1 Ratify the product labels: Locus Agent / Agent, Claude native agents,
      Codex native agents, plugin-provided agents, and prompt-only mode.
- [x] 1.2 Update audit docs so they no longer describe `trpc.agents` as a second
      SQLite agents table.
- [x] 1.3 Update `docs/OWNERSHIP_MAP.md` with the Agent Builder aggregation owner
      before implementing long-lived services.

## 2. Canonical Locus Agent Cleanup

- [x] 2.1 Rename user-facing App Agent copy to the approved Agent Builder labels
      while preserving storage keys and DB table names unless explicitly approved.
- [x] 2.2 Prove whether `agent-dialog.tsx` and `trpc.agents` UI CRUD are dead,
      hidden, or still reachable.
- [x] 2.3 Remove or hide the Custom Agents UI path after proving no active
      product entrypoint depends on it.
- [x] 2.4 Add i18n or architecture guards preventing "Custom Agents" from
      returning as a product-facing label.

Proof note: `rg -n "AgentDialog|agent-dialog|trpc\.agents\.(create|update|delete)"`
showed `agent-dialog.tsx` as the only `trpc.agents.create/update` UI path, with no
imports of `AgentDialog`. The dead dialog was deleted; the main-process
`trpc.agents` router stays as the Claude-native file-agent capability for later
read-only aggregation.

## 3. Runtime-Neutral Prompt Application

- [x] 3.1 Ensure `@[agent:name]` resolves only to canonical Locus Agents.
- [x] 3.2 Keep Claude prompt-context application covered by tests.
- [x] 3.3 Add Codex prompt-context application or explicitly gate Codex with a
      runtime capability reason before provider work starts.
- [x] 3.4 Add missing-agent tests for every runtime path that accepts `@agent`
      mentions.

Proof note: Claude remains covered by `tests/claude-agent-sdk-prompt.test.ts`.
Codex app-server prompt prep now goes through `prepareCodexAppServerRuntimePrompt`,
which reuses canonical Locus Agent prompt-context preparation before long-text
assembly; `tests/codex-app-server-attachments.test.ts` covers preserved
missing-agent results, and `tests/codex-app-server-adapter.test.ts` verifies the
prepared prompt reaches `turn/start`.

## 4. Agent Builder Read Model

- [x] 4.1 Add a main-process read model that aggregates Locus Agents,
      runtime-native discovered agents, and plugin-provided agents with source,
      owner, mutability, and sanitized diagnostics.
- [x] 4.2 Render one Agent Builder surface from that read model.
- [x] 4.3 Show runtime support rows per agent without inferring capability truth
      in renderer code.
- [x] 4.4 Preserve read-only behavior for plugin-provided and runtime-owned
      listings unless the user imports or duplicates them.

Proof note: `src/main/lib/agent-builder/read-model.ts` now produces the
Agent Builder aggregation model with source, owner, mutability, runtime support,
and sanitized diagnostics. `trpc.agentBuilder.list` exposes that model to the
settings Agent Builder surface; Locus rows remain editable through
`trpc.appAgents`, while Claude-native and plugin-provided rows render through a
read-only detail view. `tests/agent-builder-read-model.test.ts` covers mutability,
runtime projection status, and non-path diagnostics; `tests/agent-builder-ui.test.ts`
guards the renderer against returning to legacy agent lists.

## 5. Verification

- [x] 5.1 Add unit tests for source badges, mutability, projection status, and
      non-secret diagnostics.
- [x] 5.2 Add runtime prompt tests for Claude and Codex paths.
- [x] 5.3 Add architecture guards against duplicate Agent business paths.
- [x] 5.4 Run `openspec validate add-agent-builder-runtime-projection --strict
      --no-interactive`.

Proof note: current slices were verified with targeted Agent Builder/i18n tests,
Claude/Codex prompt tests from section 3, `bun run ts:check`,
`bun run lint:changed`, `node scripts/check-architecture-guards.mjs`, and
`openspec validate --all --strict --no-interactive`. Import, projection writes,
and runtime-native execution remain gated behind a separate implementation/review
pass.
