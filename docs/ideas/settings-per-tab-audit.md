# Settings per-tab content audit

> **What this is.** The "per-page" line after the Settings IA reorg (Phase 3). Each
> Settings tab gets an internal-content audit — one section per tab — looking for:
> dead controls, missing controls (backend capability with no UI), duplicate/misplaced
> controls, and UX smells. Each finding has evidence + a recommended action + who
> decides. The user ratifies per tab; Codex implements. This mirrors the
> `settings-reconciliation-ledger.md` method, applied tab-by-tab.
>
> Order: the tRPC-backed, Phase-3-independent tabs first (Models → Plugins → Skills →
> MCP → Command Guide → Projects → Custom Agents). Preferences/Appearance/Keyboard/Beta
> are deferred until Phase 3's placement reorg lands.

---

## Models (`agents-models-tab.tsx`, 2,168 lines)

**Render map (top → bottom):** Models list (hide/show per model) · Anthropic Accounts ·
Codex Account (subscription) · *Advanced routing* collapsible [Provider Profiles +
Helper APIs ×3] · *API Keys* collapsible [Codex API Key + Override Model].

### 🔴 A. Two coexisting provider-config systems, both UI-exposed (headline)

- **Evidence:** "Provider Profiles" (new, `providerProfiles.*`, under *Advanced
  routing*) and "Override Model" (legacy `claudeProviderConfig`, under *API Keys*)
  both configure a custom Claude endpoint (model + baseUrl + token + authMode). The
  runtime honors **profiles first, then falls back to the legacy config**
  (`agent-sdk-provider-startup.ts:183-206`: tries `getLegacyClaudeProviderProfileId`
  → else `getActiveClaudeProviderConfig`). So both paths are live; the UI exposes
  both in *different* collapsibles and never explains the precedence.
- **Why it's the "混乱":** a user can set a custom Claude provider in two places that
  silently override each other. This is the AGENTS.md "no old/new duplicate business
  path" tension, concretely located — and it is the same issue as review-finding ②
  (provider contract), now scoped to one tab.
- **Action (PRODUCT CALL):** decide the canonical custom-provider path. Recommended:
  Provider Profiles is the future → migrate the legacy single config into a profile
  (`getLegacyClaudeProviderProfileId` already hints this migration exists) and
  **retire "Override Model"**; until then, at minimum co-locate the two and state the
  precedence. This is your call (it's the ② decision).

### 🟡 B. Codex config split across two sections

- **Evidence:** "Codex Account" (subscription connect/logout) sits in the Accounts
  section; "Codex API Key" sits in the separate *API Keys* collapsible. They are two
  auth modes of the same provider, in two places.
- **Action (design):** co-locate Codex subscription + API key under one "Codex"
  block (recommended), or cross-link them.

### 🟡 C. "Override Model" is misfiled under "API Keys"

- **Evidence:** it's a full provider override (model + baseUrl + authMode + token),
  not just a key, yet lives under the *API Keys* collapsible while the comparable
  "Provider Profiles" lives under *Advanced routing*.
- **Action:** fold into the §A decision — the two custom-provider editors belong in
  one place ("Custom providers"), separate from per-key entry.

### 🟢 D. UX smells (lower priority)

- Provider/credential config spans **5 mechanisms** in one tab (Accounts · Provider
  Profiles · Override Model · Helper APIs ×3 · Codex ×2). The collapsibles help, but
  the grouping is uneven. After §A/§B, a cleaner top grouping is "Accounts / Custom
  providers / Helper-task models / API keys".
- The Models list (hide/show via `hiddenModelsAtom`) and search are fine — no finding.

### 🔴 E. Destructive action with no confirmation

- **Evidence:** `handleRemoveCodexApiKey` (line 1709) calls the delete mutation
  directly — no confirm. Yet account-remove (275), profile-delete (649), and
  Codex-logout (1625) all confirm. Inconsistent; one click wipes a saved key.
- **Action:** add a confirmation to remove-Codex-API-key (and audit `handleReset`
  for the same).

### 🟡 F/G/H. Consistency + control smells (code-visible)

- **F — native `window.confirm`:** all confirmations use the raw browser popup,
  not the app's styled dialog components (`ConfirmArchiveDialog`, AlertDialog).
  Functional but unpolished for a desktop app. → route through the app's dialog.
- **G — raw `<select>`:** protocol + auth use bare `<select>` (2×) instead of the
  styled `Select` component used elsewhere (0× in this tab). Visual inconsistency.
- **H — headers as raw JSON text box:** error-prone (mitigated: it validates and
  toasts `invalidHeaders`). Low priority; could become key/value rows later.

### Not found
- No outright **dead** control (the legacy override is a live fallback, not dead).
- No **missing** control surfaced here (the code-theme/usage-budget orphans live in
  other tabs, per the reconciliation ledger).

### Visual pass (ran the dev app, screenshotted Models top)

Overall: clean spacing, model list with provider icons + search reads well, no
layout breakage. Concrete inconsistencies seen:
- 🟡 **V1 — parallel account cards, different actions.** Anthropic card ("Local
  Claude Code") uses a `···` kebab menu; Codex card ("Codex 订阅") uses a bare
  inline "退出登录" text button. Same pattern, two affordances. → unify.
- 🟡 **V2 — section-header asymmetry.** "Anthropic 账号" header has a "+ 添加"
  button; "Codex 账号" header has none. → align.
- 🟢 **V3 — weak status pill.** "已启用" is a low-contrast gray pill; the
  connected/active signal could read stronger.
- 📌 **Confirms §A visually:** Provider Profiles ("提供方配置") shows **0** — empty —
  while the legacy Override Model likely holds the real config. Dual-path is real.

Not captured (pointer events blocked by the sandbox; could not scroll/expand):
the Provider Profiles form internals, Helper APIs (×3), and the legacy Override
Model editor. Their issues are already covered by §A/§C/§F/§G from the code audit;
a follow-up screenshot pass can confirm their visuals.

### Decisions to ratify (Models)
1. **Provider-config direction** (§A) — Provider Profiles canonical + retire/migrate
   the legacy Override Model? Or keep both with stated precedence? *[product call;
   this is review-finding ②]* → **DECIDED: keep Provider Profiles, retire Override
   Model.** Drafted as `refactor-models-provider-config` (Codex implementing).
2. **Co-locate Codex** (§B) and **the two custom-provider editors** (§C)? *[recommend yes]* → folded into the same change.

---

## Plugins (`agents-plugins-tab.tsx`, 5,103 lines)

The heaviest tab. Code review (visual pass pending). Structurally it is a full
plugin **manager**, not a settings panel: 18 sub-components, ~28 backend
capabilities, and 4 sub-views (`viewMode`: installed / store / sources /
marketplaces) plus developer mode, doctor/diagnostics, controlled-UI, developer
trust, update review, and per-plugin MCP management.

### 🔴 A. Overloaded — this is an app inside a settings tab (headline)

- **Evidence:** 5,103 lines / 18 components / 4 internal views + its own search,
  runtime filter, and grouping. It manages installing, browsing a store, runtime
  marketplaces, developer-local sources, trust, and MCP servers.
- **Why it matters:** it's the strongest case that some "Agent Capabilities" tabs
  are **product surfaces, not settings**. As a single settings tab it's the biggest
  source of "混乱". This is the concrete instance of the deferred IA question ("should
  these 5 tabs live in Settings?").
- **Action (product/IA call):** consider promoting Plugins to its own management
  surface (out of the Settings dialog), or at least split the file and treat the
  store/marketplace as a distinct view. *[your call]*

### 🟡 B. MCP overlap with the MCP tab, no bridge + dead `setActiveTab`

- **Evidence:** manages plugin-provided MCP servers (`getAllMcpConfig`,
  `startMcpOAuth`, approve/revoke-all plugin MCP) — overlapping the dedicated MCP
  tab. `setActiveTab` is created (line 3844) but **never called** → no cross-link AND
  dead code.
- **Action:** bridge to the MCP tab (or clarify which owns MCP auth); remove the
  unused `setActiveTab`.

### 🟡 C. Inconsistent confirmation rigor — incl. a security action with none

- **Evidence:** the runtime-marketplace write action uses a strong **type-the-target-name**
  confirmation; but **revoke developer-plugin trust** (`handleRevokeDeveloperTrust`,
  4603 — a security action) and **remove developer source** (4577) fire on a single
  click with **no confirmation**.
- **Action:** add confirmations to the destructive/security actions; right-size the
  heavy type-to-confirm so rigor is proportional to risk.

### 🟡 D. Codex plugins are listed but render "unsupported"

- **Evidence:** the runtime filter + grouping include `codex`, and there's a whole
  `unsupported-runtime` / `unsupported-target-mode` / `unsupported-surface` /
  `unsupported-action` vocabulary — codex plugins/actions surface as "unsupported for
  your runtime" (the claude-privileged duopoly = review-finding ②, here too).
- **Action:** decide — hide unsupported-runtime entries, or clearly explain why they
  can't be used; don't show dead "unsupported" rows. *[ties to ② product call]*

### Decisions to ratify (Plugins)
1. **Is Plugins a settings tab or a product surface?** (§A) — promote it out of
   Settings / split it, or keep as-is? *[product/IA call — the concrete ② / Phase-3
   "do these belong in Settings" question]*
2. **Confirm the destructive/security actions** (§C) and **bridge/clarify MCP** (§B)
   + drop the dead `setActiveTab`? *[recommend yes]*
3. **Codex "unsupported" entries** (§D) — hide vs explain? *[ties to ②]*
