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
`settings-content.tsx` (the switcher). 12 visible tabs in 4 groups (+ hidden
Debug):

| Group | Tabs |
|---|---|
| **General** | Preferences · Appearance · Keyboard · About |
| **Workspace** | Projects · Models |
| **Agent Capabilities** | Commands · Skills · Custom Agents · MCP · Plugins |
| **Advanced** | Beta (+ Debug, unlocked via 5 clicks on Beta) |

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
6. **Two "Custom Agents" tab implementations exist; one is dead** (see §4).

---

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
| `vscodeCodeThemeLightAtom` | (code theme) | — | 1 (`use-code-theme.ts`) | 🟠 orphan | code theme has no settings entry — surface under Appearance or remove |
| `vscodeCodeThemeDarkAtom` | (code theme) | — | 1 (`use-code-theme.ts`) | 🟠 orphan | same |
| `usageBudgetAtom` | (usage budget) | — | 1 (`usage-popover.tsx`) | 🟠 orphan | budget consumed by usage UI but no setting to set it |
| `betaKanbanEnabledAtom` | `preferences:beta-kanban-enabled` | keyboard | 3 | 🟡 misplaced | "graduated from beta" yet beta-named & in Keyboard tab — rename + move (Appearance/Workspace) or retire flag |
| `selectedOllamaModelAtom` | (offline) | beta | 5 | 🟡 misplaced | live, but local-models capability buried in Beta |
| `autoOfflineModeAtom` | (offline) | beta | 1 | 🟡 misplaced | same — move to Models/Workspace |
| `showOfflineModeFeaturesAtom` | (offline) | beta | 5 | 🟡 misplaced | gate for offline; reconsider home |
| `ctrlTabTargetAtom` | (quick switch) | keyboard, **preferences** | 1 | 🟡 dup | exposed in two tabs — pick one |
| `selectedTeamIdAtom` | (team) | — | 3 (chat surface) | 🔵 fork | "team" concept from web SaaS — see §3 |
| `billingMethodAtom` | (billing) | — | 5 (onboarding) | 🔵 fork | "billing" from web SaaS — see §3 |
| `customClaudeConfigAtom` | (legacy config) | — | 1 (`App.tsx`) | 🔵 fork/legacy | feeds legacy profile path; tied to modelProfiles |
| `helperApisSetupPromptPendingAtom` | (prompt state) | — | 3 | 🔵 fork | helper-APIs onboarding prompt — likely web leftover |
| `helperApisSetupPromptDismissedAtom` | (prompt state) | — | 1 | 🔵 fork | same |
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
| `soundNotificationsEnabledAtom` | (notifications) | preferences | 1 | 🟢 live | candidate for a Notifications group |
| `desktopNotificationsEnabledAtom` | (notifications) | preferences | 1 | 🟢 live | same |
| `notifyWhenFocusedAtom` | (notifications) | preferences | 1 | 🟢 live | same |
| `historyEnabledAtom` | (rollback) | beta | 1 | 🟢 live | "Rollback" — consider graduating out of Beta |
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
`OFFLINE_PROFILE` helpers, not table rows). **Remaining:** ~3 orphan (code-theme
×2, usage-budget — these have live readers, so they need a UI decision, not
deletion) · ~5 misplaced/dup · ~5 fork-leftover · rest live/app-state — out of ~44,
in *one* file. Per-tab internal state (MCP servers, skills, plugins, etc.) is not
counted here and is backed by tRPC/DB (see §5).

---

## 3. Fork leftovers — circled, NOT removed (product call pending)

These come from the upstream web SaaS and are questionable in a local-first
desktop tool. Listed for a product-identity decision (keep teams/billing or not):

- **`selectedTeamIdAtom`** — "team" concept, read in the chat surface
  (`active-chat.tsx`, `agents-content.tsx`, `agents-subchats-sidebar.tsx`).
- **`billingMethodAtom`** — "billing method", read across all onboarding pages.
- **`helperApisSetupPrompt{Pending,Dismissed}Atom`** — helper-APIs onboarding prompt.
- **`customClaudeConfigAtom`** — legacy config feeding the (vestigial) model-profile path.
- Onboarding flow itself (`billing-method-page.tsx`, helper-API prompts) carries
  SaaS assumptions worth reviewing alongside the above.

> Open question for the product owner: *does this app ever have teams/billing?*
> If firmly local-first solo → these are ghosts to remove. If maybe later → keep,
> but mark explicitly.

---

## 4. Dead / duplicated components

> **Resolved by `remove-dead-settings-state`:** the dead tab file below was
> deleted and its barrel export removed.

- **`agents-custom-agents-tab.tsx` → `AgentsCustomAgentsTab` (1,058 lines): DEAD.**
  Exported from `settings-tabs/index.ts` but **never rendered**. The wired
  "Custom Agents" tab is `AgentsAppAgentsTab` (`agents-app-agents-tab.tsx`, 872
  lines). Two implementations of the same tab; only the App Agents one is live.
  → Confirm and remove the dead 1,058-line file.

---

## 5. tRPC/DB-backed tabs (live by nature — IA review only)

These tabs' content is not localStorage atoms but DB/file/runtime state, so they
are "live" by construction. They are in scope only for the IA pass (grouping,
naming, overlap), not the dead/orphan analysis:

- **Models** (`agents-models-tab.tsx`, 2,168) · **Plugins** (5,103) ·
  **Skills** (1,712) · **MCP** (1,589) · **Command Guide** (1,063) ·
  **Custom Agents / App Agents** (872) · **Projects/Worktree** (949).

These five "Agent Capabilities" tabs are the bulk of Settings' weight and the
strongest candidate for the "too much / too deep" concern — worth asking whether
some belong outside Settings entirely (e.g., a dedicated management surface).

---

## 6. Open decisions (owner's call, gate the Codex handoff)

1. **Aggressiveness when this graduates to edits** — current decision is
   *inventory only*. Next gate: (a) remove dead atoms + fix orphan wiring
   (invisible to users), then separately (b) restructure tabs (user-visible IA).
2. **Teams/billing identity** (§3) — keep or remove the SaaS leftovers.
3. **Dead Custom Agents tab** (§4) — confirm removal of the 1,058-line file.
4. **Where do the 5 "Agent Capabilities" tabs belong** — stay in Settings, or
   split into a dedicated management surface?
