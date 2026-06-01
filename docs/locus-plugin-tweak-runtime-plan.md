# Locus Plugin and Tweak Runtime Plan: Codex++ Track

This document records the future plan for learning from `codex-plusplus`
without turning Locus into a patched Codex Desktop runtime.

## Purpose

Build a Locus-native extension system for local desktop agent workflows.

The goal is not to embed `Codex++` wholesale. The goal is to learn from its
plugin governance, local tweak lifecycle, permissions, recovery tools, settings
extension model, and MCP declaration patterns, then express the useful parts
through Locus's own Electron, tRPC, SQLite, and local-first architecture.

## Why Codex++ Is Relevant

`Codex++` is useful because it answers a hard product question:

If a local agent desktop app allows extensions, how does the app keep plugin
identity, permissions, lifecycle, debugging, recovery, data storage, and update
review under control?

The useful ideas are:

- Manifest-driven plugin identity and metadata.
- Explicit runtime scope: renderer, main process, or both.
- Declared permissions for settings, IPC, filesystem, network, runtime APIs,
  MCP, and native integration.
- Local plugin folders outside the app bundle.
- Per-plugin data directories.
- Settings pages and settings sections contributed by plugins.
- Safe mode, doctor/debug commands, and repair/uninstall flows.
- Advisory update checks instead of silent plugin replacement.
- Store entries pinned to reviewed source versions.
- Plugin-declared MCP servers that can be reviewed before activation.

## Hard Boundaries

- Do not patch Locus `app.asar`.
- Do not add a re-signing or watcher-based patch repair system for Locus.
- Do not depend on Codex Desktop, Owl internals, private DOM heuristics, or
  upstream Codex window internals for Locus plugin execution.
- Do not load arbitrary main-process or native plugins by default.
- Do not expose provider secrets, OAuth tokens, local gateway tokens, or raw
  request headers to plugins.
- Do not let plugins write directly to the Locus SQLite database.
- Do not let plugins silently modify external runtime config such as
  `~/.codex/config.toml`, `~/.codex/auth.json`, or Claude settings.
- Do not enable plugin-provided MCP servers without explicit user approval.
- Do not show plugin execute/install/update controls for Codex runtime plugins
  until Locus owns a real execution path and capability contract.
- New plugin runtime behavior, permission grants, external writes, marketplace
  install flows, or native execution must go through OpenSpec before
  implementation.

## Plugin Model

### Manifest

Each plugin should have a manifest similar in spirit to Codex++:

```json
{
  "id": "com.example.locus-plugin",
  "name": "Example Plugin",
  "version": "0.1.0",
  "description": "Adds a local workflow panel.",
  "source": {
    "type": "github",
    "repo": "example/locus-plugin",
    "commit": "reviewed-commit-sha"
  },
  "scope": "renderer",
  "main": "index.js",
  "permissions": ["settings", "filesystem.read"],
  "mcp": {
    "servers": []
  }
}
```

Required fields:

- `id`
- `name`
- `version`
- `scope`
- `main`

Recommended fields:

- `description`
- `source`
- `author`
- `homepage`
- `minLocusVersion`
- `permissions`
- `mcp`
- `settings`

### Scopes

Supported scopes should start small:

- `renderer`: UI-only extension code loaded into a controlled renderer plugin
  host.
- `settings`: plugin settings page or settings section only.
- `mcp-declaration`: no runtime JS execution; plugin only declares MCP metadata
  for review and optional approval.

Deferred scopes:

- `main`: main-process code. Requires a separate OpenSpec and permission audit.
- `native`: native modules, helper processes, or OS-level integration. Avoid
  until there is a compelling local desktop requirement.

### Permissions

Initial permissions:

- `settings`: register settings pages or compact settings sections.
- `ui.panel`: register a controlled panel in a known Locus surface.
- `ui.command`: register a command/action entry.
- `filesystem.read`: read user-approved files or plugin-owned data.
- `filesystem.write`: write only plugin-owned data unless a user-selected path
  is explicitly approved.
- `network`: make outbound network calls from a main-process proxy with visible
  host allowlist.
- `mcp.declare`: declare MCP servers.
- `mcp.request-activation`: request user approval to activate declared MCP.

Explicitly excluded at first:

- Provider secret access.
- Raw SQLite access.
- Arbitrary shell execution.
- Native module loading.
- Direct external runtime config writes.

## Storage Layout

Use Locus user data, not the app bundle.

Suggested layout:

```text
<locus-user-data>/
  plugins/
    installed/
      <plugin-id>/
        manifest.json
        index.js
    disabled/
  plugin-data/
    <plugin-id>/
  plugin-logs/
    <plugin-id>.log
  plugin-backups/
  plugin-state.json
```

Rules:

- Plugin code and plugin data are separate.
- Plugin-owned data is isolated by plugin id.
- Locus-managed install state records manifest hash and content hash.
- User-modified plugin files are detected before update or replacement.
- Backups are created before plugin updates or removals.

## Runtime Surfaces

Start with controlled extension points instead of arbitrary DOM mutation.

Candidate surfaces:

- Settings > Plugins.
- Settings page registered by a plugin.
- Agent Workbench right-side panel.
- Chat input command/action menu.
- Diff view contextual action.
- Local Browser Workbench helper panel.
- Read-only project/worktree status panel.

Avoid:

- Free-form DOM patching in core chat surfaces.
- Replacing app-owned React components.
- Monkey-patching tRPC clients.
- Preload replacement.
- Main-process global hooks.

## MCP Declaration Flow

Plugin-provided MCP needs a strict approval path:

1. Plugin is installed or discovered.
2. Locus validates the manifest and MCP declaration.
3. Settings > Plugins shows requested MCP servers.
4. User reviews command, args, env keys, cwd behavior, and runtime target.
5. User explicitly approves activation.
6. Locus records approval state in SQLite.
7. Locus enables the MCP through its existing MCP/runtime configuration layer.
8. Disabling the plugin disables or detaches plugin-owned MCP approvals.

Important rules:

- MCP declarations do not auto-activate.
- Env values must be redacted unless user-provided at approval time.
- Plugin MCP and user MCP must be distinguishable in the UI.
- Removing a plugin must not delete user-owned MCP entries.

## Roadmap

### Phase 0: Proposal and Capability Boundary

Create an OpenSpec change before implementation.

Suggested change id:

```text
add-locus-plugin-tweak-runtime
```

Deliverables:

- Define the Locus plugin capability boundary.
- State explicitly that this is Locus-native, not `Codex++` embedded into
  Locus.
- Add or modify specs for runtime plugins, skill registry, MCP approval, and
  plugin settings surfaces.
- Confirm which plugin scopes are supported, degraded, or unsupported.

Completion test:

- `openspec validate add-locus-plugin-tweak-runtime --strict --no-interactive`
  passes.

### Phase 1: Read-Only Plugin Catalog

Priority: highest.

Build a safe catalog that can discover local plugin folders without executing
them.

Features:

- Scan a local plugin directory.
- Parse and validate manifests.
- Show plugin metadata, source, version, scope, and requested permissions.
- Show validation errors.
- Show source labels: user, registry, local dev, external collection.
- Do not execute plugin code.

Minimum useful slice:

- Local plugin folder discovery.
- Manifest validation.
- Settings > Plugins read-only list.
- No install/update/enable controls yet.

### Phase 2: Renderer-Only Settings Extensions

Allow the smallest safe execution path.

Features:

- Enable renderer/settings-only plugins.
- Register Settings pages or sections.
- Start and stop plugin lifecycle.
- Persist enablement state.
- Log plugin load errors.
- Provide safe mode that disables plugin loading before renderer startup.

Rules:

- No main-process execution.
- No provider secret access.
- No arbitrary filesystem writes.
- No direct DOM mutation outside the registered settings root.

Completion tests:

- Bad manifest is rejected.
- Plugin load failure does not break Settings.
- Safe mode disables all plugin execution.
- Disabling a plugin calls its cleanup lifecycle.

### Phase 3: Controlled UI Commands and Panels

Expand renderer plugins into controlled UI surfaces.

Features:

- Register command/action entries.
- Register a right-side Workbench panel.
- Register read-only project or worktree status widgets.
- Register Local Browser Workbench helper panels if applicable.

Rules:

- Plugins render only inside app-owned containers.
- Plugin actions receive a limited, typed API.
- Plugin APIs return redacted metadata only.
- Long-running actions go through app-owned job/event APIs, not ad hoc async
  work hidden in the renderer.

### Phase 4: MCP Declaration and Approval

Allow plugins to declare MCP servers, still without arbitrary main-process code.

Features:

- Manifest-level MCP declaration.
- Approval UI.
- Runtime target selection: Claude, Codex, or future shared runtime.
- Approval state tracking.
- Disable/revoke behavior.
- Plugin-owned MCP labels in MCP settings.

Rules:

- MCP server activation requires explicit user approval.
- Plugin disablement revokes plugin-owned MCP activation.
- Plugin updates that change MCP command, args, env, or cwd require
  re-approval.

### Phase 5: Registry-Managed Plugin Packages

Add install/update UX only after local discovery and approval are proven.

Features:

- Bundled registry metadata.
- External collection browsing.
- Verified package hashes.
- Approved source commit pinning.
- Install from bundled or reviewed package.
- Advisory update checks.
- Local modification detection.
- Backup and restore.

Rules:

- No silent remote update.
- No auto-install from arbitrary deep link.
- Update opens a review/confirmation flow.
- Plugin source and permissions are visible before install.

### Phase 6: Main-Process Plugin API

Only add this if renderer/settings/MCP phases are insufficient.

Potential features:

- Main-process task handlers.
- File operations through explicit app-owned prompts.
- Network calls through an allowlisted bridge.
- Background local job integration.

Requirements before implementation:

- Threat model.
- Permission prompt design.
- Audit log design.
- Crash isolation strategy.
- Revocation behavior.
- Tests for secret redaction.

### Phase 7: Native Plugin Boundary

Defer by default.

Native plugins should require a separate proposal because they can execute
arbitrary OS-level code.

Possible future use cases:

- Native macOS panel integration.
- Local device APIs.
- Specialized editor or preview surfaces.

Default answer:

- Do not support native plugins until there is a concrete product requirement
  that cannot be met through renderer UI, MCP, or a main-process bridge.

## Recommended Implementation Order

1. `add-locus-plugin-tweak-runtime`
2. Read-only plugin catalog.
3. Renderer-only settings extensions.
4. Safe mode and plugin diagnostics.
5. Controlled UI commands and panels.
6. MCP declaration and approval.
7. Registry-managed package install/update.
8. Main-process plugin API only if required.
9. Native plugin boundary only if required.

## First Real MVP

The first practical MVP should be intentionally small:

- Local plugin directory.
- Manifest validation.
- Settings > Plugins read-only catalog.
- Enable one renderer-only settings plugin.
- Disable plugin.
- Safe mode.
- Plugin load error reporting.
- No plugin marketplace.
- No main-process plugin code.
- No native plugins.
- No automatic MCP activation.

This proves the extension architecture without widening the security surface too
early.

## Codex++ Learning Path

Repository:

```text
https://github.com/b-nnett/codex-plusplus
```

Read order:

1. `README.md`
   - Understand user-facing install, tweak folder, safe mode, doctor/debug,
     update, and uninstall concepts.
2. `docs/ARCHITECTURE.md`
   - Study runtime separation, user data layout, boot sequence, update
     handling, and what breaks across upstream app updates.
   - Use as cautionary reference. Locus should not need the patch/re-sign path.
3. `docs/WRITING-TWEAKS.md`
   - Study tweak authoring flow and minimal manifest/entry layout.
4. `docs/tweaks/manifest.md`
   - Study manifest fields, validation rules, permissions, MCP declaration,
     and update checks.
5. `docs/tweaks/runtime-lifecycle.md`
   - Study start/stop/reload behavior and cleanup expectations.
6. `docs/tweaks/api-reference.md`
   - Study API shape, settings APIs, storage, IPC, filesystem, and runtime
     capabilities.
7. `packages/runtime/src/tweak-discovery.ts`
   - Study manifest discovery and entry resolution.
8. `packages/runtime/src/tweak-lifecycle.ts`
   - Study lifecycle management.
9. `packages/runtime/src/preload/settings-injector.ts`
   - Study settings injection as a reference only. Locus should expose owned
     settings extension points instead of DOM heuristics.
10. `packages/sdk/src/index.ts`
    - Study public SDK types and validation helpers.
11. `store/index.json`
    - Study store metadata, approved commit pinning, and permission display.
12. `packages/installer/src/commands/safe-mode.ts`,
    `packages/installer/src/commands/debug.ts`,
    `packages/installer/src/commands/doctor.ts`
    - Study recovery and diagnostics UX.

What to learn:

- Manifest-first governance.
- Explicit permissions.
- Plugin lifecycle.
- Safe mode and diagnostics.
- Per-plugin storage.
- Settings extension surfaces.
- Advisory updates.
- Reviewed source pinning.
- MCP declaration patterns.

What not to copy directly:

- `app.asar` patching.
- Re-signing flows.
- Watcher-based patch repair.
- DOM heuristic injection.
- Owl/Codex private runtime dependencies.
- Native bridge support before Locus has a concrete need.

## Local Code Areas To Study Before Each Slice

Runtime capability and plugin status:

- `src/shared/codex-runtime-capabilities.ts`
- `openspec/specs/runtime-plugins/spec.md`

Settings surfaces:

- `src/renderer/components/dialogs/settings-tabs/`
- `src/renderer/features/agents/`

MCP and skills:

- `openspec/specs/runtime-plugins/spec.md`
- `openspec/specs/skill-registry/spec.md`
- `src/main/lib/skills/registry.ts`
- `resources/skill-registry/`

Main-process boundaries:

- `src/main/`
- `src/preload/`
- `src/main/lib/trpc/routers/`
- `src/main/lib/db/schema/`
- `src/main/lib/secure-storage.ts`

Provider and secret boundaries:

- `src/main/lib/provider-profiles/storage.ts`
- `src/main/lib/provider-profiles/gateway.ts`
- `src/shared/provider-profile-security.ts`

OpenSpec planning:

- `openspec/AGENTS.md`
- `openspec/project.md`
- Existing relevant specs and changes:
  - `openspec/specs/runtime-plugins/spec.md`
  - `openspec/specs/skill-registry/spec.md`
  - `openspec/changes/upgrade-codex-runtime-parity/`
  - `openspec/changes/add-headless-agent-jobs/`

## Future Decision Checklist

Before implementing any plugin/tweak slice, answer:

- Does this execute plugin code?
- Which process executes it?
- Which permissions does it need?
- Can the user see and revoke those permissions?
- Can safe mode disable it before startup?
- Where does plugin data live?
- Can plugin updates be reviewed before replacement?
- Does it expose provider secrets or raw request headers?
- Does it write external runtime config?
- Does it activate MCP or tools?
- Does it claim Codex runtime plugin parity that is not actually implemented?
- Can failures be diagnosed without breaking the app?

If yes to any high-risk item, create or update an OpenSpec change first.
