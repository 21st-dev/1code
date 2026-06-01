# Locus Runtime Environment Center Plan: cc-switch Track

This document records the future plan for learning from `cc-switch` without
turning Locus into a direct wrapper around that project.

## Purpose

Build a Locus-native runtime environment center for:

- China and third-party model providers
- Claude Code and Codex provider bindings
- Provider health checks and diagnostics
- MCP, Skills, Prompts, and runtime config source visibility
- Import, backup, restore, and rollback of runtime configuration
- Usage, cost, quota, and reliability visibility

The goal is not to embed `cc-switch` wholesale. The goal is to learn from its
product surface and implementation choices, then express the useful parts
through Locus's own local-first architecture.

## Relationship Model

`cc-switch` is a reference implementation, not a Locus dependency.

Locus should use a reference-only adoption model:

- No embedded `cc-switch` binary, Tauri backend, database, or runtime service.
- No runtime coupling to `cc-switch` APIs, config files, process state, or
  release cadence.
- No shared source of truth between `cc-switch` and Locus.
- No direct port of `cc-switch` security boundaries.
- Optional importers may read external runtime config, but only through explicit
  scan, preview, user approval, backup, apply, validate, and restore flows.

The correct product relationship is:

```text
cc-switch product/repo -> study useful patterns -> write Locus OpenSpec slice
-> implement with Locus data model, secure storage, main-process runtime
   binding, tRPC APIs, renderer UI, and tests
```

The wrong relationship is:

```text
Locus -> depends on cc-switch database/process/config semantics at runtime
```

## Hard Boundaries

- Locus SQLite remains the source of truth for Locus-managed profiles, runtime
  status, user choices, install state, and audit metadata.
- Provider secrets stay in the Electron main process and encrypted storage.
- The renderer receives provider IDs, capability state, and redacted metadata,
  never plaintext provider tokens.
- Default runtime use should prefer per-run overrides and main-process routing
  over persistent mutation of user global CLI files.
- Any write to external config files such as `~/.codex/config.toml`,
  `~/.codex/auth.json`, or `~/.claude/settings.json` must be explicit,
  previewed, backed up, and restorable.
- Hosted sync, relay marketplace promotion, and cloud-backed config sync are
  out of the default local-first scope unless a future OpenSpec explicitly
  approves them.
- New product capabilities, runtime execution surfaces, provider routing
  changes, and security-sensitive config writes should go through OpenSpec
  before implementation.

## Reference Security Audit Notes

Reference baseline:

```text
farion1231/cc-switch main @ 25951d81
```

Known risks at that baseline:

- P1: Provider secret boundary is not suitable for Locus. `get_providers` can
  expose complete provider records to the renderer, and provider settings may
  include API keys, auth tokens, or equivalent secrets. Locus must never return
  provider secrets through provider listing, status, diagnostics, preset, or
  runtime selection APIs.
- P1: Renderer network scope must not make a renderer injection equivalent to a
  secret exfiltration path. Provider calls should be made by the main process
  or a main-owned gateway, with the renderer receiving only redacted status and
  user-visible results.
- P2: Deep-link MCP import confirmation must show more than command or URL.
  `args`, environment variable keys, redacted environment value presence,
  target runtime, target config path, activation behavior, and required
  permissions must be visible before import.
- P2: Deep-link imports must default to preview or pending state. They must not
  silently activate MCP servers, install secrets, or write live runtime config.

Security requirements Locus must preserve:

- Provider list APIs return only provider IDs, names, protocol, model metadata,
  capability status, timestamps, and redacted secret status.
- Secret save APIs accept plaintext only at an explicit user-save boundary.
- Runtime execution APIs accept profile IDs or auth modes, not plaintext tokens.
- Main process resolves and injects secrets at request time.
- Logs, diagnostics, errors, import previews, and telemetry redact secrets.
- Import/export payloads must be safe to inspect as plain text unless explicitly
  documented as encrypted local backup artifacts.
- MCP and runtime config status responses are not renderer-safe until proven
  otherwise. Renderer-facing config APIs must return only command or URL, args,
  env or header keys, redacted value-presence flags, scope, source, enabled
  state, auth state, and diagnostics. They must not return raw `env`,
  `headers`, `_oauth`, bearer tokens, resolved environment values, or full
  external config objects.

## Plan Reconciliation Gate

Before starting another `cc-switch`-inspired implementation slice, run a
plan-only reconciliation pass. This pass is a deliverable, not just a verbal
checkpoint.

The pass should answer:

- Which parts of the plan are already implemented in Locus-native code.
- Which parts are only partially implemented and need stronger diagnostics,
  smoke evidence, or stricter capability gates.
- Which parts require a new OpenSpec change before product code changes.
- Which parts should remain deferred because they would expand secret,
  runtime, or external-config risk too early.

The pass must not:

- Add a second provider database or source of truth.
- Re-implement completed provider profile, gateway, or credential-storage work.
- Start writing `~/.codex`, `~/.claude`, MCP config, skills, or prompt files.
- Claim that Claude Code and Codex support every provider combination just
  because both CLIs are visible through Locus.

Current reconciliation snapshot:

| Plan area | Current Locus evidence | Status | Boundary decision |
| --- | --- | --- | --- |
| Provider presets and profile creation | `src/main/lib/provider-profiles/presets.ts`, `src/main/lib/provider-profiles/storage.ts`, `src/main/lib/trpc/routers/provider-profiles.ts`, Settings > Models | Mostly implemented for the first MVP. DeepSeek, SiliconFlow, Qwen, Moonshot, Zhipu, Volcengine, local, and generic presets exist. | Do not create another provider model. Data-only preset corrections may be direct; schema, security, or runtime behavior changes need OpenSpec. |
| Secure profile and Codex API-key boundary | `harden-provider-credential-storage`, `src/main/lib/secure-storage`, `src/main/lib/codex-api-key-store.ts`, provider profile storage | Implemented enough to treat plaintext renderer persistence as a regression risk. | Keep this as an existing completed boundary. Future slices must add negative tests instead of weakening it. |
| Provider diagnostics | `testProviderProfile()` stores a sanitized success/failure message and capability hints. | Partial. It is not yet the full endpoint/auth/model/streaming/tools/vision/runtime status taxonomy from this plan. | Next focused OpenSpec candidate: `add-provider-diagnostics`. |
| Runtime provider binding | Codex uses provider-profile runtime overrides through `codex-acp -c`; Claude uses a local gateway-backed provider config; helper defaults can resolve provider profiles. | Core path exists, but confidence depends on diagnostics and real smoke evidence. | Do not duplicate binding work. Extend only when diagnostics or smoke evidence shows a concrete gap. |
| MCP, Skills, and Prompts visibility | Settings surfaces already read Claude/Codex MCP and skill state; runtime-specific sources are visible in places. | Partial and security-sensitive. There is no full pending import/preview flow for MCP deep links or runtime-provided config, and raw config/status responses must be treated as unsafe until sanitized. | Split narrow preview work from broad management. Use `add-mcp-deep-link-import-preview` before any auto-activation or external writes, and require renderer-safe MCP/config metadata. |
| External config scan, backup, apply, restore | Existing code has specific config readers/writers and skill rollback patterns, but no general runtime config management workflow. | Missing as a runtime-center capability and high risk. | Keep separate as `add-runtime-config-import-backup`; require preview, backup, validate, and rollback before writes. |
| Usage, cost, quota, reliability | `usage-panel` tracks local observed token/context data and avoids invented provider quota. | Partial. It does not yet track provider/profile/model/runtime latency, error rate, or editable pricing. | Use `add-provider-usage-cost-observability` after diagnostics/runtime binding are stable. |
| Quick switch, deep links, preset sharing | Protocol registration exists for the app, but runtime preset sharing and quick switching are not implemented. | Deferred. | Do after diagnostics, import preview, and backup/restore. Shared presets must exclude secrets. |

OpenSpec boundary decisions:

- Do not duplicate `add-provider-profiles-and-gateways`,
  `harden-provider-credential-storage`, or `upgrade-codex-runtime-parity`.
- Use `add-provider-diagnostics` as the next implementation proposal if the
  goal is to make existing provider profiles trustworthy.
- Provider diagnostics must use secret-aware redaction, including exact-match
  redaction for the active provider token, gateway token, custom header values,
  OAuth tokens, and derived authorization headers before persisting or returning
  diagnostic messages.
- Use `add-mcp-deep-link-import-preview` before broader MCP import or sharing
  work, because hidden `args` and `env` values are the immediate security risk.
- MCP/config OpenSpec work must include renderer-safe metadata requirements and
  tests proving the renderer cannot read plaintext values through list, status,
  diagnostics, import preview, or error payloads.
- Keep `add-runtime-config-import-backup` separate from import preview and
  provider diagnostics because it writes or restores user-owned external files.
- Existing direct writes to `~/.claude`, `~/.codex`, MCP config, skills, prompts,
  or runtime auth/config files should be brought under preview, explicit
  approval, timestamped backup, validation, rollback on validation failure, and
  manual restore before adding new import/apply flows.
- Treat voice/OpenAI API-key persistence as an adjacent hardening follow-up:
  it should use the same main-process secure-storage status-only renderer
  boundary as provider profiles and app-managed Codex API keys.
- Treat `add-provider-usage-cost-observability` and
  `add-runtime-preset-sharing` as follow-up slices, not prerequisites for the
  first usable two-runtime provider workflow.

## Roadmap

### Phase 0: Runtime Environment Center Proposal

Create an OpenSpec parent change or planning change that defines the overall
capability boundary.

Suggested change id:

```text
add-runtime-environment-center
```

Deliverables:

- Define the environment center product boundary.
- List affected existing specs: provider profiles, skill registry, usage panel,
  local-only guard, Claude/Codex runtime status, and any future MCP config spec.
- State explicitly that this is Locus-native, not `cc-switch` embedded into
  Locus.
- Split implementation into smaller follow-up changes.

Completion test:

- The plan is approved and each follow-up slice has a clear owner capability.

### Phase 1: Provider Preset Catalog

Priority: highest.

Build a Locus-native catalog of China, local, and third-party provider presets.

Suggested change id:

```text
add-provider-preset-catalog
```

Provider presets to start with:

- DeepSeek
- SiliconFlow
- Qwen / DashScope
- Moonshot / Kimi
- Zhipu
- MiniMax
- Volcengine / Ark
- OpenRouter or compatible relay
- Ollama
- LM Studio

Each preset should describe:

- Provider name and region
- Protocol: OpenAI Chat, OpenAI Responses, Anthropic Messages, or local
- Base URL
- Default model
- Known model aliases
- Whether it targets Claude, Codex, helpers, or local-only use
- Support hints for streaming, tools, vision, reasoning, and long context
- Setup notes in Chinese and English where useful

Implementation notes:

- Reuse the existing provider profile model where possible.
- Do not introduce a second provider database.
- Do not store preset secrets.
- Allow users to create a profile from a preset, then add their own token.

Minimum useful slice:

- DeepSeek and SiliconFlow presets.
- Create profile from preset.
- Set default Codex provider.
- Set helper/default utility provider.
- Leave Claude gateway support explicit if not ready.

### Phase 2: Provider Diagnostics

Build status checks that tell the user exactly what failed.

Suggested change id:

```text
add-provider-diagnostics
```

Checks:

- Endpoint reachable
- Auth token accepted
- Model exists or is authorized
- Streaming works
- Tool calling works or is unsupported
- Vision works or is unsupported
- OpenAI Chat to Anthropic gateway transform works
- OpenAI Responses path works
- Codex ACP runtime can start with the selected profile
- Claude Code path can start with OAuth, API key, or provider gateway as
  applicable

Status categories:

- `ok`
- `degraded`
- `unsupported`
- `auth_failed`
- `model_denied`
- `endpoint_unreachable`
- `protocol_mismatch`
- `runtime_unavailable`
- `gateway_failed`

UI goal:

- Never collapse these into a generic "Codex failed" or "provider failed"
  message.

### Phase 3: Runtime Provider Binding

Make provider profiles first-class choices for runtime execution.

Suggested change id:

```text
expand-provider-runtime-bindings
```

User-facing bindings:

- Claude main provider
- Codex main provider
- Sub-chat title provider
- Commit message provider
- Helper/utility provider
- Optional fallback provider

Execution rules:

- Codex should use runtime config overrides rather than silently mutating the
  user's global Codex config.
- Claude should make OAuth, Anthropic-compatible API, and gateway-backed
  third-party providers explicit.
- Every run should be able to display whether it used official login, API key,
  or a Locus provider profile.
- Unsupported combinations should fail before provider work starts, with a
  clear capability error.

Minimum useful slice:

- Codex can run through DeepSeek or SiliconFlow profile.
- Helper generation can use a selected provider profile.
- Claude either runs through a supported path or clearly says why the selected
  profile is not supported yet.

### Phase 4: MCP, Skills, and Prompts Management

Learn from `cc-switch`'s unified management surface, but keep Locus ownership
rules explicit.

Suggested change id:

```text
expand-runtime-mcp-skills-management
```

MCP views:

- Claude global MCP
- Codex global MCP
- Project MCP
- Imported or runtime-provided MCP
- Needs-auth MCP
- Missing or invalid MCP entries

Skills views:

- Claude installed skills
- Codex installed skills
- Registry-managed skills
- User-owned skills
- Project skills
- Locally modified skills
- Runtime-imported skills

Prompts/config views:

- `AGENTS.md`
- `CLAUDE.md`
- Gemini/OpenCode prompt files if supported later
- Project-level versus global source
- Locus-managed versus user-owned status

Rules:

- Do not silently overwrite user-authored files.
- Imported or runtime-provided MCP servers require explicit approval before
  activation.
- Runtime-specific formats should stay visible rather than being presented as
  one universal format.

### Phase 5: Import, Backup, Restore, and Rollback

Make it safe to bring an existing CLI environment under Locus management.

Suggested change id:

```text
add-runtime-config-import-backup
```

Import sources:

- `~/.codex/config.toml`
- `~/.codex/auth.json`
- `~/.claude/settings.json`
- Runtime MCP configs
- Runtime skills directories
- Existing provider-like config snippets

Behavior:

- Scan first.
- Show what was found.
- Let the user choose what to import.
- Import into Locus-managed profiles where possible.
- Do not overwrite live runtime files as part of import.

External write behavior:

- Preview the target path and content class.
- Create timestamped backup.
- Validate after write.
- Roll back automatically on failure.
- Expose restore action in the UI.

### Phase 6: Usage, Cost, Quota, and Reliability

Make multi-provider use measurable.

Suggested change id:

```text
add-provider-usage-cost-observability
```

Track by:

- Provider profile
- Model
- Runtime: Claude, Codex, helper, future job runner
- Chat and sub-chat
- Project and worktree
- Future headless job id

Metrics:

- Request count
- Token input/output where available
- Latency
- Streaming first-token latency where available
- Error rate
- Estimated cost
- Quota or limit status where available

Important constraint:

- Provider pricing changes often. Store pricing tables as editable local data,
  not as hard-coded truth.

### Phase 7: Quick Switch, Deep Link, and Preset Sharing

Add daily-use ergonomics after the foundations are stable.

Suggested change id:

```text
add-runtime-preset-sharing
```

Features:

- Tray quick switch for default provider.
- Quick open for recent projects.
- Quick view for running jobs.
- Deep link import for provider presets and MCP presets.
- Export shareable provider preset without secret material.
- Import preview that shows affected runtime, created records, external writes,
  and required permissions.

Rules:

- Deep links must never silently install or activate secrets.
- Import should always show a confirmation preview.
- Shared presets should be safe to inspect as plain text.

## Recommended Implementation Order

1. `add-provider-preset-catalog`
2. `add-provider-diagnostics`
3. `expand-provider-runtime-bindings`
4. `add-runtime-config-import-backup`
5. `expand-runtime-mcp-skills-management`
6. `add-provider-usage-cost-observability`
7. `add-runtime-preset-sharing`

## First Real MVP

The first practical MVP should be small:

- DeepSeek preset
- SiliconFlow preset
- Create provider profile from preset
- Store token securely in Locus
- Test endpoint, auth, model, and streaming
- Set default Codex provider
- Run Codex through the selected provider profile
- Show clear status if Claude support for that profile is not available yet
- Do not modify global `~/.codex` or `~/.claude` during normal runs

This is the smallest slice that proves the China/third-party model direction
without pulling in `cc-switch` as a dependency.

## Operating Flows

### 1. Capability Absorption Flow

Use this flow whenever a `cc-switch` feature looks useful:

1. Identify the product capability, not the code to copy.
2. Decide whether it belongs in the current roadmap phase.
3. Check the hard boundaries: source of truth, secret ownership, renderer
   exposure, external config writes, and local-first behavior.
4. Map the capability to an existing Locus spec or a new OpenSpec change.
5. Write or update the OpenSpec proposal before implementation when the change
   introduces a new capability, architecture boundary, provider routing change,
   security-sensitive storage, import/export, or external config write.
6. Implement through Locus-native modules only.
7. Verify with unit tests, integration tests, and desktop smoke evidence where
   runtime behavior is involved.

Do not start from "which `cc-switch` files do we port?". Start from "which
Locus user workflow do we need?".

### 2. Provider Preset Flow

Use this flow for provider catalog entries such as DeepSeek or SiliconFlow:

1. Add non-secret preset metadata: name, region, protocol, base URL, default
   model, aliases, capability hints, and setup copy.
2. Show the preset in Settings without creating a runtime credential.
3. Let the user create a Locus provider profile from the preset.
4. Save the user token through an explicit save action.
5. Store the token in main-process secure storage.
6. Return only redacted status to the renderer.
7. Run diagnostics before offering the profile as a default runtime binding.

Preset data is safe local metadata. Provider profile data may reference a
secret, but the secret itself stays outside renderer state.

### 3. Provider Secret Flow

Use this flow for any API key, auth token, or provider credential:

1. Renderer collects plaintext only inside the explicit save form.
2. Renderer sends plaintext once to a save mutation.
3. Main process validates shape and writes encrypted storage.
4. Main process returns status such as `hasSecret`, `encryptionAvailable`, and
   redacted timestamps.
5. Renderer clears local form state and never persists plaintext.
6. Runtime requests pass provider profile IDs or auth modes.
7. Main process reads and injects the secret only at runtime start.
8. Logs and errors redact the secret and derived authorization headers.

Any API that returns a full provider object must be checked for secret-bearing
fields before it is exposed to the renderer.

### 4. Runtime Binding Flow

Use this flow when a profile becomes selectable for Codex, Claude, helper
generation, commit messages, titles, or future jobs:

1. User selects a provider profile for a specific binding.
2. Locus stores the binding as Locus state, not by silently editing global CLI
   config.
3. The runtime startup path resolves the selected profile in the main process.
4. Main process checks capability compatibility before starting the runtime.
5. Unsupported combinations fail early with a specific status.
6. Runtime metadata records which binding, profile, model, and auth mode were
   used without exposing the secret.

Normal runs should prefer per-run overrides and main-process routing over
persistent mutation of `~/.codex` or `~/.claude`.

### 5. MCP Deep-Link Import Flow

Use this flow before accepting any provider or MCP deep link:

1. Parse the link into a pending import object.
2. Decode and validate payload shape, size, and allowed fields.
3. Show a complete preview:
   - server or preset name
   - transport type
   - command or URL
   - args
   - environment variable keys
   - whether environment values are present, with values redacted
   - target runtime
   - target scope: project, user, or global
   - files that would be written
   - whether the item would be enabled immediately
4. Default to pending or disabled unless the user explicitly enables it.
5. Apply only after user confirmation.
6. Audit the import action and make it reversible when files are changed.

This flow exists specifically to avoid hidden `args` or `env` values in
import links.

### 6. External Config Write Flow

Use this flow before writing files such as `~/.codex/config.toml`,
`~/.codex/auth.json`, `~/.claude/settings.json`, MCP config, skill directories,
or prompt files:

1. Scan existing files.
2. Classify each file as user-owned, runtime-owned, Locus-managed, or unknown.
3. Preview the exact target paths and content classes.
4. Show whether secrets are involved and how they are stored or redacted.
5. Require explicit user approval.
6. Create timestamped backups.
7. Apply the minimal write.
8. Validate the runtime can still read the config.
9. Roll back automatically on validation failure.
10. Expose manual restore in the UI.

Importing data into Locus is lower risk than writing live external config. Prefer
import first, then explicit apply only when the user needs Locus to manage an
external runtime file.

### 7. Verification Flow

Each implemented slice should have evidence for:

- OpenSpec validation when a proposal exists.
- Unit tests for redaction, schema boundaries, and storage behavior.
- Integration tests for provider diagnostics and runtime binding where possible.
- Desktop smoke evidence for real provider selection, runtime startup, and
  visible error states.
- `git diff --check` before handoff.

Security-sensitive slices must include a negative test that the renderer cannot
read plaintext secrets through provider list, diagnostics, import preview,
runtime status, or chat request payloads.

## Reference Repository Update Flow

Use this flow whenever `/Users/ethan/Documents/GitHub/agent-reference-repos/cc-switch`
has a new upstream commit.

### Step 1: Record the baseline

Before reviewing changes, record:

- Previous reviewed commit, for example `25951d81`.
- New commit or branch head.
- Release notes or commit range.
- Whether the update touches provider, MCP, config write, CSP, proxy/gateway,
  backup/restore, usage, or deep-link code.

Useful commands from the reference repo:

```bash
git rev-parse HEAD
git log --oneline <old-reviewed-commit>..HEAD
git diff --stat <old-reviewed-commit>..HEAD
```

Use scoped diffs first:

```bash
git diff <old-reviewed-commit>..HEAD -- \
  src-tauri/src/commands/provider.rs \
  src-tauri/src/provider.rs \
  src-tauri/src/provider_defaults.rs \
  src-tauri/src/services/provider \
  src-tauri/src/deeplink \
  src-tauri/src/services/mcp.rs \
  src-tauri/src/proxy \
  src-tauri/tauri.conf.json \
  src/components/deeplink \
  src/components/providers \
  src/components/mcp
```

### Step 2: Classify the update

Classify each changed area into one of these buckets.

Must update Locus plan or OpenSpec:

- The update fixes or changes provider secret exposure boundaries.
- The update changes MCP deep-link import preview, activation, `args`, or `env`
  behavior.
- The update changes provider preset schema, provider list, important base URLs,
  model IDs, protocol support, or capability metadata relevant to the current
  Locus phase.
- The update changes diagnostics categories, gateway behavior, streaming,
  tool-calling, or runtime compatibility in a way Locus intends to support.
- The update adds new external config write behavior, backup behavior, restore
  behavior, or rollback behavior.
- The update introduces new risk: cloud sync, relay marketplace, remote config,
  broader CSP/network permissions, secret export, or automatic activation.

Optional backlog update:

- The update adds useful provider presets outside the current MVP.
- The update improves usage/cost UI or pricing metadata that Locus may want
  later.
- The update improves MCP/Skills/Prompts information architecture without
  changing current Locus implementation priorities.
- The update adds convenience features such as quick switch, tray actions,
  session views, or sharing that belong to a later roadmap phase.

Ignore for Locus:

- Tauri-specific refactors with no transferable product or security lesson.
- Rust implementation details that do not affect Locus's Electron/main-process
  architecture.
- cc-switch-specific database migrations that would create a second source of
  truth in Locus.
- Release packaging, CI, branding, or UI polish unrelated to Locus roadmap
  phases.
- Cloud/WebDAV/relay marketplace changes unless a future Locus proposal
  explicitly brings those into scope.
- Provider additions that are not relevant to the current phase and have no
  new protocol or security implication.

### Step 3: Decide the Locus action

Use the smallest action that keeps Locus accurate:

- Documentation update only: when the reference changed but no Locus behavior
  should change yet.
- OpenSpec update: when the reference affects planned capability boundaries,
  security rules, import/export semantics, provider routing, diagnostics, or
  external writes.
- Code update: only after the OpenSpec slice is approved or when the change is
  a narrow bug fix restoring already-specified Locus behavior.
- No action: when the change is ignored by the classification rules above.

If an active Locus implementation is already underway, update the active
OpenSpec `design.md` or `tasks.md` first. Do not patch product code based only
on the reference diff.

### Step 4: Preserve the new baseline

After review, update the relevant planning note or OpenSpec design with:

- Reviewed `cc-switch` commit.
- What was adopted.
- What was intentionally ignored.
- Any new risks.
- Any follow-up change IDs.

This keeps future reviews incremental instead of re-auditing the whole
reference repository every time.

## cc-switch Learning Path

Repository:

```text
https://github.com/farion1231/cc-switch
```

Read order:

1. `README.md`
   - Understand the product surface: provider management, MCP, Skills,
     Prompts, proxy, failover, usage, sessions, deep links, backup.
2. `src-tauri/src/codex_config.rs`
   - Learn how Codex config, auth, model provider IDs, model catalog, and
     atomic config writes are handled.
   - Use as reference only. Locus should avoid direct global config mutation
     for normal runs.
3. `src-tauri/src/provider.rs` and `src-tauri/src/provider_defaults.rs`
   - Study provider metadata shape, defaults, protocol differences, and preset
     coverage.
4. `src-tauri/src/services/provider/`
   - Study provider service boundaries, live switching, usage checks, endpoint
     metadata, and gateway-adjacent behavior.
5. `src-tauri/src/proxy/`
   - Study format conversion, routing, failover, circuit breaker, health, and
     streaming transforms.
   - Locus should copy concepts, not the Rust implementation.
6. `src-tauri/src/mcp/` and `src-tauri/src/services/mcp.rs`
   - Study import/export and cross-runtime MCP synchronization.
7. `src-tauri/src/services/skill.rs`
   - Study skill source-of-truth, symlink/copy strategies, backups, and repo
     discovery.
8. `src-tauri/src/database/`
   - Study schema choices for providers, MCP, prompts, skills, usage, and
     backup metadata.
9. `src/components/providers/`, `src/components/mcp/`,
   `src/components/skills/`, `src/components/prompts/`
   - Study UI structure and information architecture.
10. `docs/user-manual/`
   - Study user language, onboarding, provider setup, and troubleshooting copy,
     especially Chinese model scenarios.

What to learn:

- Provider preset breadth.
- China model/provider naming and defaults.
- Provider health, latency, and model catalog ideas.
- MCP/Skills/Prompts management UX.
- Backup and restore habits.
- Usage/cost observability.
- Deep link import preview.

What not to copy directly:

- Tauri/Rust backend architecture.
- A second SQLite source of truth.
- Silent global config takeover.
- Cloud/WebDAV sync as default product behavior.
- Relay marketplace/commercial assumptions.

## Local Code Areas To Study Before Each Slice

Provider work:

- `src/shared/provider-profile-types.ts`
- `src/main/lib/provider-profiles/storage.ts`
- `src/main/lib/provider-profiles/gateway.ts`
- `src/shared/provider-profile-transforms.ts`
- `src/shared/provider-profile-security.ts`
- `src/renderer/components/dialogs/settings-tabs/`

Codex runtime work:

- `src/shared/codex-runtime-capabilities.ts`
- `src/shared/codex-runtime-status.ts`
- `src/main/lib/codex/`
- `src/main/lib/trpc/routers/codex.ts`

MCP, Skills, Prompts:

- `openspec/specs/skill-registry/spec.md`
- `src/main/lib/skills/registry.ts`
- `resources/skill-registry/`
- `src/renderer/components/dialogs/settings-tabs/`

Usage and observability:

- `openspec/specs/usage-panel/spec.md`
- Current chat/sub-chat persistence schema under `src/main/lib/db/schema/`
- Runtime stream and metadata normalization code under `src/shared/`

OpenSpec planning:

- `openspec/AGENTS.md`
- `openspec/project.md`
- Existing changes:
  - `openspec/changes/add-provider-profiles-and-gateways/`
  - `openspec/changes/upgrade-codex-runtime-parity/`
  - `openspec/changes/add-headless-agent-jobs/`

## Future Decision Checklist

Before implementing any slice, answer:

- Does this introduce a new capability or architectural boundary?
- Does it write external runtime config?
- Does it expose, transform, or store provider secrets?
- Does it create a second source of truth?
- Does it claim runtime parity that is not actually enforced?
- Does it require network, filesystem, or external config-write permissions?
- Can it be validated with local tests and real desktop smoke evidence?

If yes to any high-risk item, create or update an OpenSpec change first.
