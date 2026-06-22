## Context

Codex desktop/chat has two adapter sources today: `codex-app-server` (default)
and `codex-acp-temporary-compat` (rollback, env-gated). `app-server` has been the
default since its proof landed; ACP is the documented "deletion follow-up"
(`codex-runtime-parity`). The `acp` prefix is overloaded: it names (a) the
temporary Codex transport being removed, (b) shared Codex infrastructure the
app-server path depends on, and (c) the unrelated `locus acp` server surface.

## Goals / Non-Goals

- Goals: remove the ACP transport, its env gates, its capability overrides, and
  its bundled binary; leave a single supported Codex desktop adapter; keep all
  documentation and capability truth honest.
- Non-Goals: claiming Codex app-server parity (the current capability state
  matrix is preserved); renaming the retained `acp-*` shared files; touching
  `locus acp`; changing headless `codex exec`.

## Decisions

- **Decision: classify the footprint into three buckets, act per bucket.**
  Delete ACP-only runtime modules; retain `acp-permission.ts`,
  `acp-spawn-probe.ts`, renderer `acp-chat-transport.ts`, shared
  `acp-tool-normalizer.ts`; never touch `locus acp`.
  - Alternative considered: delete by `acp-*` filename glob. Rejected — it would
    remove app-server's permission decisioning, the Codex chat transport used by
    *all* Codex chats, and the hydrator that renders existing chat history.

- **Decision: defer renames to a separate `refactor-codex-acp-naming` change.**
  Renaming the misnamed shared files now would churn capability-evidence pins and
  bloat this diff. Keep this change a pure removal.

- **Decision: removal preserves capability truth, never upgrades or downgrades it.**
  The only manifest edits are deleting the ACP adapter source + overrides and
  rewriting ACP-citing reason strings. `hardToolGuard` keeps its existing
  provider-auth matrix: unknown auth context stays `degraded`, while proven
  `runtime-managed`, `app-managed`, and `provider-profile` contexts stay
  `supported`. `scopeExpansion`, `mcpAuth`, and `mcpConfiguration` stay
  `degraded`; `rollback` stays `unsupported`.

- **Decision: the `@mcpc-tech/acp-ai-provider` dependency removal is conditional.**
  Its `acpTools` export is reachable from the shared `ask-user-question.ts` used by
  the app-server path. Drop the dep only if that import is removable; otherwise
  keep it and note why.

## Risks / Trade-offs

- **Loss of rollback lever** → no env-flag fallback if app-server regresses.
  Mitigation: confirm field stability before merge; the change is git-revertable.
- **Persisted history rendering** → old ACP-shaped tool parts in users' DBs.
  Mitigation: retain `acp-tool-normalizer.ts`; `architecture-ownership` already
  mandates its ACP normalization stay tested (acceptance task 5.3).
- **Stale ownership doc** → `OWNERSHIP_MAP.md` would still name `acp-adapter.ts`.
  Mitigation: task 5.2 updates it to the app-server owner.

## Migration Plan

1. Land scope-guard verification (tasks 1.x) before any deletion.
2. Delete ACP-only modules + tests; rewire selection/router/policy/metadata.
3. Edit capability manifest + runtime status, preserving the existing
   capability state matrix and public status shape.
4. Apply spec deltas + ownership-doc update.
5. Drop the bundled ACP binary dep (and conditionally the ai-provider dep).
6. Verify: ts:check, tests, residue grep, desktop smoke, `locus acp` smoke,
   `openspec validate --strict`.

Rollback: revert the change set; no schema or persisted-data migration is
performed, so existing chats are unaffected by a revert.

## Open Questions

- Can `ask-user-question.ts` drop its `acpTools` import cleanly, or does the
  app-server interaction path still need it? (Gates task 6.2.)
