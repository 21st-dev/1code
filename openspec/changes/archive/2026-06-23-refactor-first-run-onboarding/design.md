## Context

Current first-run behavior is a route chain in `App.tsx`:

1. no `onboardingProviderMode` -> provider/auth selector
2. Claude subscription selected and incomplete -> Claude Code onboarding
3. Codex selected and incomplete -> Codex onboarding
4. API key or custom model selected and incomplete -> API key/custom provider page
5. provider setup complete but no valid project and repo onboarding not deferred
   -> repository selection
6. otherwise -> main app shell

That chain served the old product, but the product now has stronger boundaries:

- Provider Profiles are the canonical custom Claude/API key path.
- Codex API keys are app-managed in main-process secure storage.
- Claude Code local credentials are imported/refreshed through the Claude
  credential owner.
- Codex runtime status must distinguish runtime, login, provider, MCP, and policy
  blockers.
- Project selection can be deferred so Quick chat is available without a project.

The redesigned onboarding should expose these existing owners instead of becoming
a second provider/runtime setup system.

## Goals

- Make first-run setup understandable in one place.
- Show existing setup, missing setup, and repairable blockers without hidden
  redirects or bounce-back loops.
- Start external auth/login flows only after an explicit user action.
- Preserve current credential and provider ownership boundaries.
- Keep the first implementation small enough to review and smoke test.

## Non-Goals

- Do not build the full runtime environment center.
- Do not add MCP registry setup, runtime config backup/restore, provider usage,
  or preset sharing to onboarding.
- Do not introduce a second provider model, credential store, runtime status
  table, or durable onboarding state machine.
- Do not write to `~/.claude`, `~/.codex`, MCP config, skill folders, or external
  runtime config files as part of this redesign.

## UX Model

The first screen becomes a setup surface, not a marketing page:

- Desktop layout: narrow status rail on the left, active setup panel on the right.
- Mobile/narrow layout: status steps collapse above the active panel.
- Top controls: language switcher and app window drag area.
- Primary sections:
  - `AI path`: Claude Code, Codex, Anthropic API key, custom/local Claude-compatible
    provider.
  - `Runtime and credentials`: derived status for the selected path and its action.
  - `Start context`: Open Project, Clone from GitHub, or Start Quick chat.
- Status states are plain: `Ready`, `Needs sign-in`, `Needs API key`,
  `Runtime missing`, `Repair needed`, `Optional`.

The setup surface can recommend a path based on detected state:

- If a Claude Code account is already connected, recommend Claude Code.
- If Codex is already connected or an app-managed Codex API key exists, recommend
  Codex.
- If a Claude Provider Profile exists, recommend that profile path.
- Otherwise default to Claude Code in local-only builds because it is the primary
  local desktop runtime path, while still showing Codex and provider-profile
  choices.

## Decisions

### Decision: Readiness is derived, not a new durable truth

The renderer may have a helper hook such as `useFirstRunOnboardingStatus`, but it
must derive readiness from existing owners:

- Claude Code: `claudeCode.getIntegration`, `claudeCode.getSystemToken`,
  `claudeCode.getRuntimeStatus`, and existing Claude account queries.
- Codex: `codex.getIntegration`, `codex.getCodexApiKeyStatus`, and
  `codex.getRuntimeStatus`.
- Provider Profiles: `providerProfiles.listProfiles` and selected model-source
  state, with saves still routed through `providerProfiles.saveProfile`.
- Project entry: `projects.list`, project open/clone mutations, selected project
  state, and `repoOnboardingSkippedAtom`.

There are no existing users to migrate, so the legacy onboarding completion atoms
(`onboarding:anthropic-completed`, `onboarding:api-key-completed`,
`onboarding:codex-completed`, `onboarding:codex-auth-method`) are removed outright
rather than kept as compatibility hints. Readiness is derived solely from the
owners above; any orphaned localStorage keys are ignored.

### Decision: Auth launch is explicit

Current Claude and Codex onboarding pages can start browser/CLI login when the
page mounts. The redesign removes that behavior from first-run setup. The user
must click an action such as `Sign in`, `Import local credentials`, or
`Connect with API key` before the app launches a browser, starts a CLI auth
process, imports local credentials, or stores a credential.

### Decision: One usable AI path is enough

The app should not force users to configure both Claude and Codex during first
run. First-run completion requires one usable AI path plus either a selected
project or explicit Quick chat deferral. Other runtimes remain visible as
connect-later options in Settings > Models.

For this slice, "usable AI path" means one of:

- Claude Code account connected through the Claude credential owner.
- Codex connected through ChatGPT login or an app-managed Codex API key.
- Claude Provider Profile saved and selected for Claude runtime use.

Runtime hard blockers remain visible and repairable. Run-time enforcement and
preflight still own final run admission.

### Decision: Provider profile path stays canonical

Anthropic API key and custom Claude-compatible onboarding must keep saving
Provider Profiles and selecting a provider-profile model source. It must not
restore raw `claudeProviderConfig` or `custom-provider` as a durable source.

### Decision: Project setup remains separate and deferrable

Project selection is the final start-context choice, not part of provider
credential setup. Deferring project selection opens the main shell with Quick chat
available and project-dependent workflows unavailable until a project is selected
or attached.

## Risks / Trade-offs

- Risk: derived status can flicker while queries load.
  Mitigation: show explicit `Checking` states and avoid route redirects until all
  required setup queries settle.
- Risk: replacing stored completion flags with derived status could re-onboard
  upgrade users.
  Mitigation: there are no existing users to migrate, so the completion atoms are
  removed and any orphaned localStorage keys are ignored; readiness and repair
  states come only from authoritative owners.
- Risk: onboarding could grow into Settings.
  Mitigation: the proposal only builds first-run setup and reuses existing
  Settings owners for connect-later and repair work.
- Risk: visual redesign can become too decorative for a workbench.
  Mitigation: use a quiet, dense setup layout with status rows, buttons, and
  compact forms; no marketing hero.

## Migration Plan

1. Introduce derived first-run status in the renderer with tests.
2. Replace the route chain's individual full-screen pages with the setup surface
   while reusing existing save/login hooks where possible.
3. Remove first-run auto-start behavior for Claude/Codex login.
4. Remove the obsolete boolean completion atoms and the Codex auth-method atom;
   there are no existing users to migrate, so orphaned localStorage keys are
   simply ignored.
5. Migrate every completion-atom caller (new chat form, chat input, login modals,
   models tab, ACP transport) to the derived status helper.

## Verification

- `openspec validate refactor-first-run-onboarding --strict --no-interactive`
- focused Bun tests for:
  - no auto-start auth on first-run render
  - provider-profile save path remains canonical
  - Codex API key is not persisted in renderer localStorage
  - old completion flags do not override unhealthy runtime/credential status
  - repository deferral still opens Quick chat
  - English/Simplified Chinese onboarding strings stay in parity
- `bun run ts:check`
- manual desktop smoke with clean `LOCUS_USER_DATA_DIR`:
  - clean first run
  - existing Claude credentials
  - stale Claude credentials
  - Codex ChatGPT login
  - Codex API key
  - custom no-auth local provider
  - project open, clone, and Quick chat deferral
