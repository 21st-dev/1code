# Canonical Entity Vocabulary

> **Status: RATIFIED 2026-06-18.** Forks A/B/C decided (see §3). The canonical
> terms are: **Project · Workspace · Chat · Quick chat · Agent · Run.** This is now
> the authoritative naming source for the combined ③+④ rename change.

> **Why this exists.** The rigorous review (③+④) found the app uses
> **Project / Workspace / Chat / Agent / Sub-chat / Quick-chat / Conversation**
> interchangeably — not just in UI copy but in code: the action named
> `newWorkspace` is labeled "New chat"; the handler `handleNewAgent` renders a
> button labeled "New chat"; the same DB layer is called "chat", "agent", and
> "workspace" in different places. This is the root of the "混乱 / 迷惑" feeling.
>
> **You can't fix the UI before fixing the words.** This table is the gate: once
> you ratify a canonical term per entity, the ③+④ change becomes a mechanical
> rename + empty-state-language pass for Codex. Until then, any UI move just
> reshuffles ambiguous labels.
>
> **Method.** Terms are anchored to the **data model** (`schema/index.ts`), not to
> current UI strings — the schema is the only non-drifted source of truth.

---

## 1. Ground truth — the actual data model

```
projects                 (local folder / git repo)
  └── chats              (ONE git worktree + branch + PR, bound to a project)
        └── sub_chats    (a single conversation thread: session, mode, messages)
```

- `projects`: `path`, git remote, icon. A local repo folder.
- `chats`: `projectId` (**nullable**), `worktreePath`, `branch`, `baseBranch`,
  `prUrl`, `prNumber`. **This is the unit of git isolation** — one worktree/branch
  per row, with PR tracking. It holds many conversations.
- `sub_chats`: `chatId` (not null), `sessionId`, `mode` (plan/agent), `messages`.
  **This is what the user actually talks in.** Shown as tabs within a chat.
- **Quick chat** is not a separate table: it's a `chats` row with **no project /
  no worktree** (`chats-crud.ts`: "folderless quick chat - no worktree"). Tools are
  restricted (`permission-policy.ts` blocks project/fs/shell/terminal in quick
  chat). It can later **attach a project** (`chat-project-attach.ts`) to graduate
  into a full project-bound workspace.

**The core mismatch:** the layer DB-named `chats` is conceptually a *workspace*
(worktree), and the layer named `sub_chats` is the actual *chat*. UI copy has it
backwards/mixed.

---

## 2. Proposed canonical terms (my recommendation — ratify or override)

| Concept (DB) | **Canonical term** | One-line definition | Replaces these current labels |
|---|---|---|---|
| `projects` | **Project** | A local repo folder you point the app at. | (already consistent — keep) |
| `chats` | **Workspace** | One isolated git worktree + branch (+PR) under a project; contains one or more Chats. The unit of isolation. | "New chat", "New Agent", "New Workspace", "agent", bare "chat" |
| `sub_chats` | **Chat** | A single conversation thread (session, mode, messages). Shown as a tab inside a Workspace. | "sub-chat", "conversation", "thread", bare "chat" |
| `chats` w/ no project | **Quick chat** | A project-less, tool-restricted Workspace. "Attach a project" graduates it. | "Quick chat" (keep term; clarify it's a project-less Workspace) |
| `app_agents` / custom agents | **Agent** | A reusable persona = prompt + allowed tools (a sub-agent). **Never** used for workspace creation. | "Agent" when it currently means "new workspace" |
| `agent_jobs` | **Run** (a.k.a. Job) | A headless/background execution, shown in the Workbench → "Runs & History". | "job", "run" (already mostly consistent) |

### The resulting sentence (sanity check)
> "In a **Project**, you open a **Workspace** (its own branch/worktree). Inside a
> Workspace you have one or more **Chats** (tabs). A **Quick chat** is a Workspace
> with no project yet. An **Agent** is a persona you can invoke inside a Chat. A
> **Run** is a background execution you audit in the Workbench."

If that sentence reads cleanly to you, the vocabulary holds.

---

## 3. The forks — RATIFIED 2026-06-18

- **Fork A — conversational unit (`sub_chats`) → `Chat`.** ✅ Decided. The app's
  primary noun. The worktree layer must *stop* being called "chat".
- **Fork B — isolation unit (`chats` table) → `Workspace`.** ✅ Decided. Covers
  worktree + branch + PR + its Chats.
- **Fork C — project-less chat → `Quick chat`.** ✅ Decided. Redefined as "a
  Workspace with no project"; graduation action is consistently "Attach a Project".

---

## 4. Entry-point grammar (fixes ③ — the "new X" confusion)

> **Implemented:** `refactor-canonical-vocabulary` aligned create-action labels
> and the actively misleading `handleNewAgent` handler with this grammar.

Once terms are fixed, every create action maps 1:1, no synonyms:

| Action | Creates | Canonical label |
|---|---|---|
| Add a local folder | `projects` row | **New Project** (or "Open Project") |
| Start isolated work in a project | `chats` row + worktree | **New Workspace** |
| New tab in current workspace | `sub_chats` row | **New Chat** |
| Start without a repo | folderless `chats` row | **New Quick chat** |
| Define a persona | `app_agents` row | **New Agent** (Settings → Agents only) |

**Rule:** the word "Agent" never appears on a workspace/chat create button.
`handleNewAgent` → relabel to **New Quick chat** *and* rename the handler.

---

## 5. Empty-state / onboarding language (fixes ④)

> **Implemented:** `refactor-canonical-vocabulary` aligned the no-project,
> project-selection, onboarding, and quick-chat attachment entry copy with this
> grammar, with i18n tests and an architecture guard to prevent re-drift.

Today the same "no repo / get started / connect provider" moment is phrased 5+
ways: "Welcome to Agents" / "Attach folder" / "No project open" / "No projects
found" / "open repo". Unify to **one entry grammar** built on §4 terms:

- No projects yet → **"Open a Project"** (primary) + **"Start a Quick chat"** (secondary).
- No provider connected → **"Connect a provider"** (single phrasing everywhere,
  links to onboarding provider selector — note: that selector is the misnamed
  `billingMethod`, renamed in Phase 2).
- Quick chat with no folder → **"Attach a Project"** (single phrasing; matches §4).

One verb per concept: **Open** a Project, **Start** a Workspace/Quick chat,
**Connect** a provider, **Attach** a project to a quick chat.

---

## 6. Scope note

This document is the **decision artifact** for the combined ③+④ change. It is
not yet a proposal. Forks A/B/C are ratified, so the implementing change is a
mechanical pass: align user-facing labels/copy to canonical terms, rename the few
actively-misleading handlers, collapse the duplicate empty-state copy, and add an
i18n guard so a future synonym can't re-drift. No data migration.

## 7. Scope boundary — what changes vs what stays (read before implementing)

The canonical terms govern **user-facing vocabulary**, not the code/data layer.
Conflating the two would turn a copy fix into a massive, risky rename. Verified
counts below are the reason.

**Changes (in scope):**
- User-facing strings: button labels, headings, empty-state copy, tooltips,
  onboarding text — aligned to §2/§4/§5 terms. (This is mostly i18n **values**.)
- A small, named set of **actively-misleading identifiers** where the name asserts
  the wrong concept — e.g. `handleNewAgent` (renders "New chat", creates a
  chats-row) → rename to a Chat/Workspace-correct handler. Case-by-case, not blanket.
- Consolidate the duplicated empty-state keys (§5) into one entry grammar.

**Does NOT change (out of scope — churn or breakage):**
- **DB table names** stay: `projects` / `chats` / `sub_chats` / `agent_jobs`.
- **Schema-aligned code identifiers** stay: `subChatId` (**1,338 refs / 158 files**),
  `SubChat`, `useAgentSubChatStore`, `newSubChat`, etc. They map to the `sub_chats`
  table; renaming 1,300+ refs to "chat" is pure risk for zero user benefit. The
  word "Chat" appears only in **UI**, while code keeps `subChat*`.
- **The Run/job split:** user-facing term is **"Run"**; the code + API contract stay
  **"job"** — `jobId` (316), `agentJob` (118), `JobStatus`, `agent_jobs`, and the
  **`local-job-api` v1 contract**. Do **not** rename the API surface.
- **i18n key identifiers** may stay stable (e.g. `sidebar.newChat`); only their
  **values** are corrected. Renaming keys is churn; the value is what users see.

> Note: "Workspace" is **already** used ~150× in code/i18n (`deriveWorkspaceStatus`,
> `workspaceName`, `WorkspaceStatus`…), so Fork B is partly adopted already — the
> drift is that the *same* layer is also labeled "chat"/"agent" elsewhere. The job
> is to make it consistent, not to introduce a brand-new word.
