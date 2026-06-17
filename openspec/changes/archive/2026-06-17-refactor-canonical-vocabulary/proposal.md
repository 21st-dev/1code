## Why

The fork uses **Project / Workspace / Chat / Agent / Sub-chat / Quick-chat /
Conversation** interchangeably — in UI copy *and* in code — which is the root of
the "混乱 / 迷惑" the user reported. Concrete drift, verified:

- `settings.keyboard.actions.newWorkspace` has the value **"New chat"** (zh:
  "新建会话") — the key and the label disagree.
- `handleNewAgent` (sidebar) is named **Agent**, renders the label
  `sidebar.newChat` = **"New chat"**, and actually starts a **Quick chat**
  (`setNewChatTarget({ type: "quick" })`) — a three-way name/label/behavior mismatch.
- The same "no repo / get started" moment is phrased 5+ ways: `"Welcome to Agents"`,
  `"No project open"`, `"No projects found"`, `"No projects"`, `"Attach folder"`.

The canonical terms are now **ratified** in `docs/ideas/canonical-vocabulary.md`
(Project / Workspace / Chat / Quick chat / Agent / Run), with a §4 entry grammar, a
§5 empty-state language, and a §7 code-vs-UI scope boundary. With the words fixed,
this change is the **behavior-preserving** pass that makes the UI say them
consistently. No DB migration; no logic change.

## What Changes

**Part ③ — align create-action / entry-point labels to the §4 grammar:**
- Correct mislabeled create actions to the canonical term for what they actually do
  (e.g. `settings.keyboard.actions.newWorkspace` → "New Workspace"; the sidebar
  "new" action that starts a Quick chat → labeled **"New Quick chat"**, and its
  misleading handler `handleNewAgent` renamed accordingly).
- Sweep user-facing create labels so each maps 1:1 (New Project / New Workspace /
  New Chat / New Quick chat / New Agent), with **"Agent" never on a
  workspace/chat-create button**.

**Part ④ — unify empty-state / onboarding entry language (§5):**
- Collapse the 5+ "no project / get started / attach" phrasings into one entry
  grammar: **Open a Project** · **Start a Quick chat** · **Connect a provider** ·
  **Attach a Project**. One verb per concept.

**Guard:**
- Add a bounded i18n guard so retired user-facing synonyms (e.g. "sub-chat" /
  "Sub-chat" / "subchat" as a user-facing noun) cannot reappear in i18n values, and
  the previously-misaligned keys cannot regress (value-vs-canonical check on the
  small named set).

This is **UI vocabulary only**, applied to both the `en` and `zh-CN` dictionaries.

## Capabilities

### New Capabilities
- `canonical-entity-vocabulary`: the UI MUST refer to each entity by its single
  canonical term (Project / Workspace / Chat / Quick chat / Agent / Run), create
  actions MUST follow the §4 entry grammar, entry/empty-state copy MUST follow the
  §5 language, and these MUST NOT re-drift (i18n guard). The code/data layer
  (DB tables, schema-aligned identifiers, the `job`/`local-job-api` contract) is
  explicitly out of this capability's scope.

### Modified Capabilities
- `workspace-navigation`: update existing navigation-entry wording so the current
  spec uses **Open a Project**, **New Workspace**, and **New Quick chat** rather
  than the pre-vocabulary "open repository" / "new conversation" / "新建会话"
  terms.
- `ui-localization`: update the quick-chat/sidebar localization requirement so
  future strings use **Open a Project**, **Attach a Project**, **New Workspace**,
  and **New Quick chat**.
- `general-assistant-chat`: update quick-chat file-tooling fallback and upgrade
  wording from "attach a folder" to **Attach a Project** while preserving the same
  runtime and persistence behavior.

## Impact

- **Code (renderer):** `src/renderer/lib/i18n/dictionaries.ts` (en + zh value
  corrections — the bulk), plus a small named set of misleading **handlers/labels**
  (e.g. `handleNewAgent` in `agents-sidebar.tsx`) and the components that render the
  affected empty states.
- **Guard:** a bounded i18n check (in `scripts/check-architecture-guards.mjs` or a
  sibling) for retired synonyms + the named key/value alignments.
- **STRICT non-scope (per §7):** DB table names (`projects`/`chats`/`sub_chats`/
  `agent_jobs`), the ~1,338 `subChatId` / `SubChat` code identifiers, and the
  `job` / `local-job-api` v1 contract are **unchanged** ("Run" is UI-only). i18n
  **key identifiers** stay stable; only **values** change.
- **User-facing behavior:** none beyond corrected labels/copy. No routing, no data,
  no flow change.
- **Docs:** mark `canonical-vocabulary.md` §4/§5 as implemented when this lands.
