## Context

The ③+④ slice of the reconciliation. The vocabulary is already ratified
(`docs/ideas/canonical-vocabulary.md`), so this is an execution design, not a
naming debate. The work is almost entirely i18n-value edits plus a handful of
misleading handler renames; the hard part is doing it *only* in the UI layer
(§7 boundary) and labeling each action by what it **actually does**, not by its
current (often wrong) name.

## Goals / Non-Goals

**Goals:**
- Make every user-facing string use the one canonical term for its entity.
- Map every create action 1:1 to the §4 grammar; rename the few handlers whose
  names assert the wrong entity.
- Unify the empty-state/entry copy to the §5 language.
- Add a bounded guard so retired synonyms can't silently return.

**Non-Goals:**
- No DB-table, schema-identifier, or `job`/`local-job-api` renames (§7). "Run" is
  UI-only.
- No behavior/routing/flow change. No new screens. Not the workbench rename (①), the
  provider-contract work (②), or the Settings IA reorg (Phase 3).

## Decisions

- **Single source of truth = `canonical-vocabulary.md`.** Every label decision
  traces to §2/§4/§5. If a string's correct term is ambiguous, resolve it from the
  entity it operates on (the data model), not its current copy.
- **Label by behavior, not by current name.** Several actions are mislabeled (e.g.
  `handleNewAgent` starts a Quick chat). The task must read what each create action
  does (`setNewChatTarget`, which table it writes) and label from that — then rename
  the handler to match. This is the one place that needs care, not find/replace.
- **en and zh-CN change in lockstep.** `dictionaries.ts` holds parallel `en` and
  `zh-CN` maps; every corrected value is updated in both, or the guard/翻译 drifts.
- **Bounded i18n guard, not a semantic linter.** A full "no synonym ever" linter is
  infeasible. Scope the guard to: (a) no retired Chat-entity label substring
  ("sub-chat"/"subchat"/"子对话") in known user-facing entity-label values; (b) a small
  allow-list of previously-broken key→canonical-value assertions (e.g.
  `*.newWorkspace` value must not be "New chat"). Legitimate domain text such as
  GitHub review threads, provider conversation history, and generic prose is not a
  vocabulary violation unless it is naming the `sub_chats` entity.
- **Keep i18n keys stable.** Only values change; renaming keys is churn and risks
  missing references. Rename a key only when it is actively misleading *and* trivially
  safe.

## Risks / Trade-offs

- **Mislabeling by reusing a wrong current label** → Mitigation: the "label by
  behavior" task gate; cross-check each create action against the data model table.
- **zh-CN left behind** → Mitigation: a task to update both maps together; the guard
  scans both.
- **Over-reaching into code identifiers** (tempting because UI says "Chat" but code
  says `subChat`) → Mitigation: §7 boundary is explicit and in the spec; the guard
  only inspects i18n values for known Chat-entity labels/settings/toasts + the
  named handler set, never the `subChat*` code surface.
- **Guard false-positives on legitimate text** (e.g. GitHub review thread or
  provider conversation history) → Mitigation: keep the banned-substring list tight
  and apply it only to known Chat-entity labels/settings/toasts, plus named
  key-value assertions.

## Migration Plan

1. Inventory every affected i18n key + the misleading handlers (task), label by
   behavior, then apply en+zh value edits + handler renames.
2. Add the bounded guard; confirm it passes clean and fails on a reintroduced
   English or Chinese Chat-entity synonym or named key/value mismatch.
3. Verify: `bun run check` (lint + guard + ts:check + tests). Manual smoke that the
   sidebar/empty-state/onboarding copy reads consistently.
4. Rollback: pure revert; no data/persistence change.

## Open Questions

- None. The top-level folderless starter is **New Quick chat**. "New Chat" is
  reserved for a new `sub_chats` conversation tab inside an existing Workspace.
