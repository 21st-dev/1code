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
