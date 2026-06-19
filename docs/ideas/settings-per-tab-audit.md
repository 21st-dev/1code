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

## Models (`agents-models-tab.tsx`)

**Status:** Resolved by `refactor-models-provider-config`.

**Render map (top → bottom):** Models list (hide/show per model) · Anthropic Accounts ·
Codex Account (subscription + Codex API key) · *Advanced routing* collapsible
[Provider Profiles + Helper APIs ×3].

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
- **Resolution:** Provider Profiles is canonical. The Override Model editor was
  removed; onboarding now creates/selects Provider Profiles; persisted
  `custom-provider` sources normalize before send and fail closed if no safe target
  exists.

### 🟡 B. Codex config split across two sections

- **Evidence:** "Codex Account" (subscription connect/logout) sits in the Accounts
  section; "Codex API Key" sits in the separate *API Keys* collapsible. They are two
  auth modes of the same provider, in two places.
- **Action (design):** co-locate Codex subscription + API key under one "Codex"
  block (recommended), or cross-link them.
- **Resolution:** Codex subscription and Codex API key now live in one Codex block.

### 🟡 C. "Override Model" is misfiled under "API Keys"

- **Evidence:** it's a full provider override (model + baseUrl + authMode + token),
  not just a key, yet lives under the *API Keys* collapsible while the comparable
  "Provider Profiles" lives under *Advanced routing*.
- **Action:** fold into the §A decision — the two custom-provider editors belong in
  one place ("Custom providers"), separate from per-key entry.
- **Resolution:** removed with §A.

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
- **Resolution:** Codex API key removal and helper resets now use app
  `AlertDialog` confirmation.

### 🟡 F/G/H. Consistency + control smells (code-visible)

- **F — native `window.confirm`:** all confirmations use the raw browser popup,
  not the app's styled dialog components (`ConfirmArchiveDialog`, AlertDialog).
  Functional but unpolished for a desktop app. → route through the app's dialog.
- **G — raw `<select>`:** protocol + auth use bare `<select>` (2×) instead of the
  styled `Select` component used elsewhere (0× in this tab). Visual inconsistency.
- **H — headers as raw JSON text box:** error-prone (mitigated: it validates and
  toasts `invalidHeaders`). Low priority; could become key/value rows later.
- **Resolution:** F and G are fixed; H remains a low-priority follow-up.

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
- **Action (product/IA call):** keep Plugins in Settings while runtime execution is
  being made truthful; promoting Plugins to its own management surface is deferred
  until plugin execution works. The execution-truth and in-tab trust fixes are folded
  into `add-runtime-native-plugin-execution`.

### 🟡 B. MCP overlap with the MCP tab, no bridge + dead `setActiveTab`

- **Evidence:** manages plugin-provided MCP servers (`getAllMcpConfig`,
  `startMcpOAuth`, approve/revoke-all plugin MCP) — overlapping the dedicated MCP
  tab. `setActiveTab` is created (line 3844) but **never called** → no cross-link AND
  dead code.
- **Action:** bridge to the MCP tab (or clarify which owns MCP auth); remove the
  unused `setActiveTab`. Folded into `add-runtime-native-plugin-execution`.

### 🟡 C. Inconsistent confirmation rigor — incl. a security action with none

- **Evidence:** the runtime-marketplace write action uses a strong **type-the-target-name**
  confirmation; but **revoke developer-plugin trust** (`handleRevokeDeveloperTrust`,
  4603 — a security action) and **remove developer source** (4577) fire on a single
  click with **no confirmation**.
- **Action:** add confirmations to the destructive/security actions; right-size the
  heavy type-to-confirm so rigor is proportional to risk. Folded into
  `add-runtime-native-plugin-execution`.

### 🟡 D. Codex plugins are listed but render "unsupported"

- **Evidence:** the runtime filter + grouping include `codex`, and there's a whole
  `unsupported-runtime` / `unsupported-target-mode` / `unsupported-surface` /
  `unsupported-action` vocabulary — codex plugins/actions surface as "unsupported for
  your runtime" (the claude-privileged duopoly = review-finding ②, here too).
- **Action:** hide unsupported-runtime entries or clearly explain why they can't be
  used from the Phase-1 activation matrix; don't show dead "unsupported" rows. Folded
  into `add-runtime-native-plugin-execution`.

### Decisions to ratify (Plugins)
1. **Is Plugins a settings tab or a product surface?** (§A) → **DECIDED: keep Plugins
   in Settings for now; defer a standalone extension/product surface until execution
   works.**
2. **Confirm the destructive/security actions** (§C) and **bridge/clarify MCP** (§B)
   + drop the dead `setActiveTab`? → **DECIDED: yes; folded into
   `add-runtime-native-plugin-execution`.**
3. **Codex "unsupported" entries** (§D) → **DECIDED: hide dead rows or explain the
   blocked/native-loadable state from the activation matrix; folded into
   `add-runtime-native-plugin-execution`.**

---

## MCP (`agents-mcp-tab.tsx`, 1,589 lines)

**The healthiest tab audited.** Symmetric for **both** runtimes (CLAUDE CODE + CODEX
sections): add / remove / refresh / OAuth, status-aware (connected / pending /
needs-auth / failed), search. Delete **is** confirmed (`deletingServer` → dialog,
line 1581) — unlike Plugins. Config import goes through a **redacted preview**
(`McpImportPreviewPanel` + `RedactedFieldChips`) before applying — good secret
hygiene. No dead controls, no missing confirms, no debt markers.

### 🟡 A. Per-runtime capability asymmetry

- **Evidence:** Claude has `updateMcpServer` (edit in place); Codex has **no**
  `updateMcpServer`. Codex has `logoutMcpServer`; Claude has none. So a Codex server
  can't be edited (only remove + re-add), and only Codex offers MCP logout.
- Likely real backend reality (`~/.claude.json` editable vs `~/.codex/config.toml`;
  Codex OAuth exposes logout). **Action:** confirm intentional and **disclose in the
  UI** (why a Codex server has no edit; why logout is Codex-only) — or fill the gap.

### 🟡 B. Cross-tab MCP overlap with Plugins

- **Evidence:** both this tab and the Plugins tab read the same `getAllMcpConfig`;
  Plugins also approves/revokes *plugin-provided* MCP servers. So a plugin's MCP
  server appears in **both** tabs, managed two ways.
- **Action:** one clear ownership story / bridge. *Already owned* by the
  `add-runtime-native-plugin-execution` "Plugin MCP ownership is clear" requirement —
  coordinate, don't double-solve.

### 📌 C. MCP registry/store layer — decided and partially landed

- **Resolved direction:** the MCP tab is the right home for the cross-vendor
  registry/store layer. `add-mcp-registry-install` adds official-registry browse,
  detail, redacted install preview, setup classification, Claude install through
  Runtime MCP Config, inactive `Installed / Needs setup`, `Installed / Unverified`,
  `Ready to verify`, `Failed check`, and explicit Check.
- **Safety bar:** browse / preview / install stay management-time inert: they do not
  run registry server commands, package managers, Docker, MCP server processes, or
  MCP tools. Explicit Check is connect/list-only until a safe side-effect-free tool
  classifier exists.
- **Still proof-gated:** do **not** claim `Verified on Claude` until a real Claude
  run proves discovery, connection, tool listing, and a tool call. Codex registry
  install / `Verified on Codex` remain deferred until Codex can write the full
  registry field set and produce real app-server runtime proof.

### Decisions to ratify (MCP)
1. **Asymmetry (A)** — disclose in UI, or fill the Codex-edit / Claude-logout gaps? *[recommend disclose]*
2. **Cross-tab overlap (B)** — coordinate with the plugin-execution change (already owns it). *[recommend no duplicate work]*
3. **MCP store / registry browse (C)** — **DECIDED: build it here.** Current
   state is browse + redacted preview + Claude install/check, with Verified and
   Codex still gated by real runtime proof.

---

## Skills (`agents-skills-tab.tsx`, 1,712 lines) + Commands

This tab manages **both** skills and slash commands (`SkillsViewMode = "skills" |
"commands"`) plus a runtime-aware **registry/store** (claude + codex) with
install / update / rollback / browse-only collections. Backend surface:
`skills.{list, registryList, registryCollections, registryInstall,
registryRollback, create, update, delete}` + `commands.delete`.

**Positives (not findings).** Read-only protection for plugin & registry items is
correct (`isReadOnly`, line 160; delete hidden when read-only, 705) — you can't
edit/delete a plugin-owned or registry-owned skill from here. Delete (recursive
`fs.rm` of the skill dir) routes through the app `AlertDialog`. The registry has
hash-based drift detection (`installedHash`/`contentHash` → `modified`).

### 🔴 A. The Skills store ships at the OLD acceptance bar — "installed" = files written, no "verified" (headline)

- **Evidence:** `RegistrySkillStatus = not-installed | installed | update-available
  | modified` (`skills/registry.ts:24`). There is no "verified-usable" state;
  `registryInstall` writes files and the entry goes green immediately.
- **Why it matters:** this is the exact false-confidence model you just **rejected**
  for MCP. `add-mcp-registry-install` is being held to "Installed/Unverified vs
  Verified on Claude/Codex" + runtime-local proof — while the **already-shipped**
  Skills store does one-click install with zero verification. Two stores, two bars.
- **Action (PRODUCT CALL):** reconcile the bar. Either (a) Skills registry adopts
  the Installed/Unverified→Verified model to match `add-mcp-registry-install`, or
  (b) accept that skills are genuinely lower-risk (they are markdown prompt text,
  not a launched process/server) and **document why** the MCP bar is higher.
  *Recommended:* (b) is defensible — but still surface "did the runtime actually
  pick this up" rather than only "files written," and align the vocabulary.

### 🔴 B. Codex registry install writes to GLOBAL `~/.codex/skills` — invisible to the isolated managed run (confirmed)

- **Evidence:** Codex registry skills install to `~/.codex/skills`
  (`skills/registry.ts` `getSkillsRoot("codex")`). But every Codex app-server
  managed run now uses an **isolated** `CODEX_HOME` at
  `{userData}/codex-sessions/{ownerId}` (`app-server-adapter.ts:368` default path →
  `prepareCodexAppServerIsolatedPluginHome`), which copies **only** `auth.json` +
  `installation_id` and symlinks **only** staged plugins
  (`app-server-plugin-home.ts:60,156`). It never includes `~/.codex/skills`.
- **Why it matters:** a Codex registry skill shows **"installed"** yet is **not
  present** in the run that's supposed to use it — the literal "装了不能用"
  failure, in shipped code. The plugin-isolation feature (prevent global leakage)
  incidentally hides legitimately-installed Codex skills. The plain `list` query
  doesn't even scan `~/.codex/skills` (`skills.ts:136` scans only `~/.claude/skills`).
- **Action (VERIFY + DECIDE):** confirm whether Codex loads skills from
  `CODEX_HOME/skills` at all; if so, either **stage `~/.codex/skills` into the
  isolated home** (like plugins) or **block/relabel the Codex skill target** until
  it's proven. Same isolation-coherence question the plugin proof raised — now it
  applies to skills, which were never proof-gated.

### 🟡 C. Mixed confirmation rigor — the file-clobbering path uses the weak popup

- **Evidence:** delete uses the styled `AlertDialog` (good), but **force-overwrite
  of an existing user skill** / "replace local changes" (`window.confirm`, line 307)
  and **force-install-to-both-runtimes** (`window.confirm`, 1396) use the native
  browser popup. The path that can **destroy local skill edits** is on the weaker
  confirm; `AlertDialog` is imported (19-26) but not used there.
- **Action:** route the overwrite confirms through `AlertDialog` too (same as Models
  §F); rigor should track "this clobbers your local edits."

### 🟡 D. Skills tab also does full Commands CRUD — overlaps the separate Command Guide tab

- **Evidence:** `SkillsViewMode = "skills" | "commands"`; this tab creates/edits/
  deletes slash commands (`.claude/commands/`, `commands.delete`). There is **also**
  a separate `agents-command-guide-tab.tsx` in the same settings dialog.
- **Action (IA CALL):** clarify ownership — is Command Guide a read-only reference
  while Skills>commands is the editor? Two command surfaces in Settings is a "混乱"
  candidate for the Phase-3 IA reorg. Decide whether commands live in Skills, in
  Command Guide, or one merged surface.

### 🟢 E. Cross-tab: Skills already HAS the store MCP wants

- **Note:** the runtime-aware registry (claude+codex), install/rollback, browse-only
  collections, and hash drift detection here are the **working precedent** for
  `add-mcp-registry-install`. Recommend that change reuse these patterns — and that
  the §A reconciliation flow **both ways** (MCP store learns the registry plumbing;
  Skills store learns the verified-vs-installed bar).

### Decisions to ratify (Skills)
1. **Acceptance-bar reconciliation (§A)** — make the Skills registry match
   Installed/Unverified→Verified, or document why skills get a lighter bar?
   *[product call — ties directly to `add-mcp-registry-install`]*
2. **Codex skill isolation coherence (§B)** — verify `~/.codex/skills` is consumed
   by the isolated run; stage it or relabel/block the Codex target if not.
   *[must-verify; confirmed gap in code]*
3. **Overwrite confirms → app `AlertDialog` (§C)?** *[recommend yes]*
4. **Commands ownership vs Command Guide (§D)?** *[IA call — Phase 3]*
