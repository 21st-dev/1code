# Settings Reconciliation Ledger

> **What this is.** A top-to-bottom audit of the Settings surface — the
> "从头到尾的对账" that has never happened since the fork. Settings accreted as
> features were added/changed across the app, but the settings page itself was
> never reconciled against current behavior. This ledger records *what each
> setting is, where it lives, whether it still does anything, and a suggested
> action* — so decisions come from evidence, not guesswork.
>
> **Scope (per decision 2026-06-18): inventory only.** This document changes no
> code. It is the artifact to review, then hand to Codex for the actual edits as
> a separate, later decision. Fork leftovers are **circled, not deleted** —
> flagged for a product call.
>
> **Method.** For each persisted setting (`atomWithStorage` in
> `src/renderer/lib/atoms/index.ts`), we resolved: its storage key, which
> Settings tab (if any) exposes a control for it, and how many non-UI files
> actually read it. "Dead" = persisted to localStorage but read by zero
> functional consumers. "Orphan" = real runtime behavior with **no** settings
> control. "Misplaced" = lives under the wrong tab. Status was derived by
> grepping readers across `src/renderer`.

---

## 1. Information architecture (as shipped)

Source: `src/renderer/features/settings/settings-sidebar.tsx` (the nav) +
`settings-content.tsx` (the switcher). Current visible tabs are grouped as
follows (+ hidden Debug, unlockable from About):

| Group | Tabs |
|---|---|
| **General** | Preferences · Appearance · Keyboard · About |
| **Workspace** | Projects · Models |
| **Agent Capabilities** | Commands · Skills · Agents (App Agents today) · MCP · Plugins |
| **Advanced** | Debug only after unlock |

### IA smells (organization debt)

1. **Kanban toggle lives in the Keyboard tab.** `betaKanbanEnabledAtom`'s only
   settings reference is in `agents-keyboard-tab.tsx`. Wrong home; also the flag
   is named `beta*` but its comment says "graduated from beta" (default ON).
2. **A whole capability (local models / Ollama) is buried in Beta.** Offline mode
   + Ollama model selection (`showOfflineModeFeaturesAtom`, `selectedOllamaModelAtom`,
   `autoOfflineModeAtom`) live under "Beta", not under Models/Workspace.
3. **`ctrlTabTargetAtom` is exposed in TWO tabs** — both Keyboard and Preferences.
4. **Preferences is the junk drawer**: extended thinking, 3 notification toggles,
   default agent mode, preferred editor, auto-advance, ctrl-tab target, language.
   No dedicated **Notifications** home despite 3 notification settings.
5. **Beta tab now holds only 2 real toggles** (Rollback/history + Offline mode) and
   doubles as the secret devtools unlock.
6. **The old Custom Agents settings component was dead; the live settings
   surface is App Agents today and should converge into Agent Builder** (see §4).

---

> **Update — resolved by change `refactor-settings-ia`:** IA smells 1-5 above
> were fixed. Local models / Ollama moved to **Models**, Rollback moved to
> **Preferences**, Kanban moved to **Appearance** with the storage key preserved
> as `preferences:beta-kanban-enabled`, Ctrl+Tab now has only the **Keyboard**
> control, notifications are grouped in **Preferences**, code-block theme pickers
> are surfaced in **Appearance**, and the Beta tab was deleted. The hidden Debug
> unlock moved from the Beta nav item to 5 clicks on the About version number.

> **Update — resolved by change `remove-dead-settings-state` (Phase 1):** the
> 🔴 dead rows below were deleted — `useNativeFrameAtom`,
> `betaGitFeaturesEnabledAtom`, `betaUpdatesEnabledAtom`, `simulateOfflineAtom`,
> and the dead model-profile chain (`activeConfigAtom` + `modelProfilesAtom` +
> `activeProfileIdAtom`, plus `networkOnlineAtom` and the `ModelProfile` /
> `getOfflineProfile` / `OFFLINE_PROFILE` helpers). The 🟠 `enableTasksAtom` orphan
> was inlined to its default (`true`) and removed. A guard
> (`assertNoDeadSettingsState`) now blocks re-drift. Still standing: the 🟡
> misplaced, 🔵 fork-leftover, and the code-theme / usage-budget orphans (later
> slices).

## 2. Persisted settings ledger (`atoms/index.ts`, ~44 atoms)

Legend — 🔴 dead · 🟠 orphan (behavior, no UI) · 🟡 misplaced/IA · 🔵 fork
leftover · 🟢 live & ok · ⚪ app-state (not a user setting)

| Atom | Storage key | Tab | Non-UI readers | Status | Suggested action (for later) |
|---|---|---|---|---|---|
| `useNativeFrameAtom` | `preferences:windows-use-native-frame` | — | 0 | ✅ removed | Phase 1 — deleted (nothing read it) |
| `betaGitFeaturesEnabledAtom` | `preferences:beta-git-features-enabled` | — | 0 | ✅ removed | Phase 1 — deleted (controlled nothing) |
| `betaUpdatesEnabledAtom` | `preferences:beta-updates-enabled` | — | 0 | ✅ removed | Phase 1 — deleted (never wired) |
| `simulateOfflineAtom` | (offline debug) | — | 0 | ✅ removed | Phase 1 — deleted |
| `activeProfileIdAtom` | (model profiles) | — | 0 | ✅ removed | Phase 1 — deleted with the dead profile chain |
| `modelProfilesAtom` | `agents:model-profiles` | — | 0 ext. (only same-file derived) | ✅ removed | Phase 1 — deleted (fed only the dead `activeConfigAtom`) |
| `enableTasksAtom` | (enable tasks) | — | 1 (`ipc-chat-transport.ts`) | ✅ removed | Phase 1 — inlined to `true`, atom deleted |
| `vscodeCodeThemeLightAtom` | (code theme) | appearance | 1 (`use-code-theme.ts`) | 🟢 live | surfaced in Appearance by `refactor-settings-ia` |
| `vscodeCodeThemeDarkAtom` | (code theme) | appearance | 1 (`use-code-theme.ts`) | 🟢 live | surfaced in Appearance by `refactor-settings-ia` |
| `usageBudgetAtom` | (usage budget) | — | 1 (`usage-popover.tsx`) | 🟠 orphan | budget consumed by usage UI but no setting to set it |
| `kanbanViewEnabledAtom` | `preferences:beta-kanban-enabled` | appearance | 3 | 🟢 live | renamed symbol; storage key preserved by `refactor-settings-ia` |
| `selectedOllamaModelAtom` | (offline) | models | 5 | 🟢 live | local models section in Models |
| `autoOfflineModeAtom` | (offline) | models | 1 | 🟢 live | local models section in Models |
| `showOfflineModeFeaturesAtom` | (offline) | models | 5 | 🟢 live | local models section in Models |
| `ctrlTabTargetAtom` | (quick switch) | keyboard | 1 | 🟢 live | duplicate Preferences control removed |
| `selectedTeamIdAtom` | (team) | — | 3 (chat surface) | ✅ removed | Phase 2 — inert team scaffolding deleted |
| `billingMethodAtom` | (billing) | — | 5 (onboarding) | ✅ renamed | Phase 2 → `onboardingProviderModeAtom` (misnamed, not payment; key/values kept) |
| `customClaudeConfigAtom` | (legacy config) | — | 1 (`App.tsx`) | 🟢 kept | live legacy provider-config migration in `App.tsx` — not residue |
| `helperApisSetupPromptPendingAtom` | (prompt state) | — | 3 | 🟢 kept | real, wired helper-API setup prompt — not residue |
| `helperApisSetupPromptDismissedAtom` | (prompt state) | — | 1 | 🟢 kept | same |
| `anthropicOnboardingCompletedAtom` | `onboarding:anthropic-completed` | — | 5 | ⚪ app-state | onboarding flag, not a user setting (ok) |
| `apiKeyOnboardingCompletedAtom` | `onboarding:...` | — | 4 | ⚪ app-state | ok |
| `codexOnboardingCompletedAtom` | `onboarding:...` | models | 7 | ⚪ app-state | ok |
| `repoOnboardingSkippedAtom` | `onboarding:...` | — | 3 | ⚪ app-state | ok |
| `sessionInfoAtom` | (session) | — | 7 | ⚪ app-state | runtime state, not a setting |
| `extendedThinkingEnabledAtom` | (extended thinking) | preferences | 3 | 🟢 live | ok |
| `defaultAgentModeAtom` | (default mode) | preferences | 3 | 🟢 live | ok |
| `preferredEditorAtom` | (editor) | preferences | 9 | 🟢 live | ok |
| `autoAdvanceTargetAtom` | (auto advance) | preferences | 1 | 🟢 live | ok |
| `appLanguagePreferenceAtom` | (language) | preferences | 1 (`i18n`) | 🟢 live | ok (in Preferences) |
| `soundNotificationsEnabledAtom` | (notifications) | preferences | 1 | 🟢 live | grouped under Notifications |
| `desktopNotificationsEnabledAtom` | (notifications) | preferences | 1 | 🟢 live | grouped under Notifications |
| `notifyWhenFocusedAtom` | (notifications) | preferences | 1 | 🟢 live | grouped under Notifications |
| `historyEnabledAtom` | (rollback) | preferences | 1 | 🟢 live | moved out of Beta |
| `selectedFullThemeIdAtom` | (theme) | appearance | 1 | 🟢 live | ok |
| `systemLightThemeIdAtom` | (theme) | appearance | 1 | 🟢 live | ok |
| `systemDarkThemeIdAtom` | (theme) | appearance | 1 | 🟢 live | ok |
| `importedThemesAtom` | (theme) | appearance | 1 | 🟢 live | ok |
| `showWorkspaceIconAtom` | (appearance) | appearance | 2 | 🟢 live | ok |
| `alwaysExpandTodoListAtom` | (appearance) | appearance | 1 | 🟢 live | ok |
| `customHotkeysAtom` | (hotkeys) | keyboard | 4 | 🟢 live | ok |
| `hiddenModelsAtom` | (models) | models | 2 | 🟢 live | ok |

**Tally:** ✅ **7 removed by Phase 1** (`remove-dead-settings-state`) — the 4 dead
atoms + the 2-atom dead profile chain + the `enableTasks` orphan (plus the
non-persisted `networkOnlineAtom` and the `ModelProfile`/`getOfflineProfile`/
`OFFLINE_PROFILE` helpers, not table rows). **Remaining after
`refactor-settings-ia`:** 1 orphan (`usageBudgetAtom` — it has a live reader, so it
needs a UI decision, not deletion) · no standing IA misplaced/duplicate rows from
§1 · rest live/app-state — out of ~44, in *one* file.
The ~5 fork-leftover rows were resolved by **Phase 2** (`refactor-fork-saas-residue`,
§3): team scaffolding removed, `billingMethod` renamed, helper-API/legacy-config
kept. Per-tab internal state (MCP servers, skills, plugins, etc.) is not counted
here and is backed by tRPC/DB (see §5).

---

## 3. Fork leftovers — resolved by Phase 2 (`refactor-fork-saas-residue`)

These came from the upstream web SaaS. Pressure-testing against code showed they
were not uniform "ghosts," so Phase 2 treated each by what it actually was:

- **`selectedTeamIdAtom`** (+ `createTeamDialogOpenAtom`) — **✅ removed.** Inert
  multi-tenant scaffolding: never set, and the team-keyed `getAgentChats` calls
  were already no-ops (the adapter queried `trpc.chats.list` unconditionally). The
  inert `teamId` prop plumbing through `ChatViewInner` / `ChatInputArea` /
  `AgentsFileMention` was removed too. Behavior-preserving.
- **`billingMethodAtom`** — **✅ renamed** to `onboardingProviderModeAtom`
  (`BillingMethod` → `OnboardingProviderMode`, `BillingMethodPage` →
  `OnboardingProviderPage`). It is the onboarding provider/auth selector with **no
  payment logic** — misnamed, not residue. Storage key `"onboarding:billing-method"`
  and values kept → no migration.
- **`helperApisSetupPrompt{Pending,Dismissed}Atom`** — **kept.** A real, wired
  helper-API setup prompt, not residue.
- **`customClaudeConfigAtom`** — **kept.** Live legacy provider-config migration in
  `App.tsx` (the dead model-profile chain it once fed was already removed in Phase 1).

> Product gate (resolved at approval): the current model has **no real teams and no
> billing** — only SaaS-named scaffolding. Phase 2 removes/renames that without
> foreclosing a future real teams/billing feature, which would be built deliberately.

---

## 4. Dead / duplicated components

> **Resolved by `remove-dead-settings-state`:** the dead tab file below was
> deleted and its barrel export removed. The remaining live Settings surface is
> App Agents today; the approved long-term vocabulary is Agent Builder / Locus
> Agents. Sidebar Claude native file-agent CRUD (`agent-dialog.tsx` +
> `trpc.agents`) is a runtime-owned capability, not a second Settings tab or a
> second SQLite agents table.

- **`agents-custom-agents-tab.tsx` → `AgentsCustomAgentsTab` (1,058 lines): DEAD.**
  It was exported from `settings-tabs/index.ts` but **never rendered**. The live
  Settings surface is `AgentsAppAgentsTab` (`agents-app-agents-tab.tsx`, 872
  lines), backed by the `app_agents` table. The similarly named sidebar
  `agent-dialog.tsx` path uses Claude native `.claude/agents` files through
  `trpc.agents`; it is not a Settings tab and is not another SQLite agent table.

---

## 5. tRPC/DB-backed tabs (live by nature — IA review only)

These tabs' content is not localStorage atoms but DB/file/runtime state, so they
are "live" by construction. They are in scope only for the IA pass (grouping,
naming, overlap), not the dead/orphan analysis:

- **Models** (`agents-models-tab.tsx`, 2,168) · **Plugins** (5,103) ·
  **Skills** (1,712) · **MCP** (1,589) · **Command Guide** (1,063) ·
  **Agents / App Agents** (872) · **Projects/Worktree** (949).

These five "Agent Capabilities" tabs are the bulk of Settings' weight and the
strongest candidate for the "too much / too deep" concern — worth asking whether
some belong outside Settings entirely (e.g., a dedicated management surface).

---

## 6. Open decisions (owner's call, gate the Codex handoff)

1. **Aggressiveness when this graduates to edits** — current decision is
   *inventory only*. Next gate: (a) remove dead atoms + fix orphan wiring
   (invisible to users), then separately (b) restructure tabs (user-visible IA).
2. **Teams/billing identity** (§3) — keep or remove the SaaS leftovers.
3. **Agent Builder convergence** (§4) — rename/converge App Agents and any
   runtime-native agent listings under the approved Agent Builder / Locus Agent
   vocabulary.
4. **Where do the 5 "Agent Capabilities" tabs belong** — stay in Settings, or
   split into a dedicated management surface?
