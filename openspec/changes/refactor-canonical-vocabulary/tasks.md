## 1. Inventory (label by behavior, not by current name)

- [ ] 1.1 Inventory every user-facing i18n key (en + zh-CN) referring to an entity
  (chat / sub-chat / workspace / agent / conversation / quick chat / project / run /
  job) or a create action; record each key's current value and the entity it
  actually concerns, distinguishing legitimate domain text (for example GitHub
  review thread or provider conversation history) from labels for the `sub_chats`
  Chat entity.
- [ ] 1.2 For each **create action**, determine what it creates by reading behavior
  (which `setNewChatTarget`/table write), not its label — especially the sidebar
  `handleNewAgent` (starts a Quick chat) and `settings.keyboard.actions.newWorkspace`
  (value "New chat"). Produce a key → canonical-label map per §4.
- [ ] 1.3 Inventory the scattered empty-state / onboarding strings ("Welcome to
  Agents", "No project open", "No projects found", "No projects", "Attach folder")
  and map each to the §5 entry grammar.
- [ ] 1.4 List the small set of **misleading handlers/identifiers** to rename (e.g.
  `handleNewAgent`), confirming none are part of the §7 protected surface
  (`subChat*`, `job`/`local-job-api`, DB tables).
- [ ] 1.5 Confirm the existing `workspace-navigation`, `ui-localization`, and
  `general-assistant-chat` specs are updated through MODIFIED deltas so archived
  specs do not retain the old "new conversation" / "新建会话" / "attach folder"
  terms.

## 2. Part ③ — create-action / label alignment

- [ ] 2.1 Correct create-action labels to the canonical term for what they create
  (e.g. `settings.keyboard.actions.newWorkspace` → "New Workspace"; the Quick-chat
  starter → "New Quick chat"), updating **both** en and zh-CN values.
- [ ] 2.2 Rename the misleading handlers to match behavior (e.g. `handleNewAgent` →
  `handleNewQuickChat`) and update call sites; no behavior change.
- [ ] 2.3 Sweep remaining user-facing create/label strings so "Agent" never appears
  on a workspace/chat-create control and the worktree layer reads "Workspace".

## 3. Part ④ — unified entry / empty-state language

- [ ] 3.1 Replace the multiple empty-state phrasings with the §5 grammar (Open a
  Project / Start a Quick chat / Connect a provider / Attach a Project), one verb per
  concept, in both en and zh-CN; update the rendering components if a key is removed.
- [ ] 3.2 Align "Attach folder" → "Attach a Project" (quick-chat graduation) per §4/§5.

## 4. Guard against re-drift

- [ ] 4.1 Add a bounded i18n guard (in `scripts/check-architecture-guards.mjs` or a
  sibling check wired into `bun run check`): fail if a known Chat-entity label value
  contains a retired entity synonym ("sub-chat"/"subchat"/"子对话"), or if a named key
  regresses to a mismatched value (e.g. `*.newWorkspace` = "New chat"). Scan en +
  zh-CN, without banning legitimate GitHub review-thread or provider conversation
  wording.
- [ ] 4.2 Confirm the guard passes on the cleaned dictionaries and fails on a
  deliberately reintroduced English or Chinese Chat-entity synonym / mismatch.

## 5. Validation

- [ ] 5.1 `bun run ts:check`.
- [ ] 5.2 Run the full test suite.
- [ ] 5.3 `bun run lint` (changed-line biome) green.
- [ ] 5.4 Run the architecture guard incl. the new i18n assertion.
- [ ] 5.5 `openspec validate refactor-canonical-vocabulary --strict --no-interactive`.
- [ ] 5.6 Confirm the §7 boundary held: no `subChatId`/`SubChat` rename, no `job`/
  `local-job-api` change, DB tables untouched; only i18n values + named handlers moved.
- [ ] 5.7 Manual smoke: sidebar create actions, empty states, and onboarding copy all
  read in one consistent vocabulary (en + zh-CN).
- [ ] 5.8 Mark `docs/ideas/canonical-vocabulary.md` §4/§5 implemented.
