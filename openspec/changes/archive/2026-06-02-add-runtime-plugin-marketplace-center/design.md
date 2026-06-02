## Context
The current Locus plugin UI already has runtime-aware plugin discovery, target modes, review gates, safe mode, Doctor/Debug, controlled UI, developer trusted mode, and a Locus-native pinned store candidate flow. That store flow reads `plugin-store-catalog.json` from Locus app state, verifies immutable commit pins and package hashes, and can install approved packages into Locus-managed package storage.

That is not the same as a Codex or Claude Code marketplace. Codex and Claude Code each own their own marketplace configuration, installed state, enablement state, update rules, and plugin component semantics. Locus should observe those ecosystems first, then only invoke runtime-owned write commands in a later explicit change.

## Goals
- Show Codex and Claude Code marketplace/plugin state even when Locus has no native pinned store candidates.
- Use each runtime as the source of truth for its own marketplace inventory where a safe read command exists.
- Keep Locus-native store pins separate and clearly named.
- Prevent cross-runtime install or conversion claims.
- Keep external runtime marketplace integration read-only in this slice.
- Preserve existing plugin trust language: metadata and pins are review inputs, not safety proof.

## Non-Goals
- No Codex plugin installed into Claude Code.
- No Claude Code plugin installed into Codex.
- No automatic marketplace add/install/update/remove.
- No automatic plugin enable/disable through Locus.
- No execution of plugin JavaScript, hooks, native modules, MCP servers, or developer trusted code as part of listing.
- No migration of Codex or Claude marketplace config into Locus-owned config.

## Runtime Sources
### Codex
Preferred read commands:
- `codex plugin marketplace list`
- `codex plugin list`

The adapter should capture marketplace name, root path, plugin id, marketplace id, status, version, and package path where the command exposes those fields. If Codex later exposes structured output, Locus should prefer that over table parsing. Until then, any table parsing must be bounded, tolerant of unknown columns, and surfaced as degraded when parsing fails.

Codex local filesystem scans under `~/.codex/plugins/cache` may remain a fallback or component-enrichment path, but they should not be the primary answer to "what marketplaces/plugins does Codex currently know about?"

### Claude Code
Preferred read commands:
- `claude plugin marketplace list`
- `claude plugin list --json`
- `claude plugin list --available --json`

The adapter should capture marketplace name/source/status where available, installed plugin status, available plugin inventory, version, source, scope, and component counts where available. If the CLI returns no installed plugins, Locus should display that as Claude runtime state, not as a Locus failure.

Existing scans under `~/.claude/plugins/marketplaces` may remain a fallback or component-enrichment path, but they should not override runtime-owned CLI results without reporting a conflict.

## UI Model
Settings > Plugins should stop presenting one ambiguous "Store" as the answer to all plugin ecosystems.

Recommended structure:
- `Codex` runtime tab: Marketplaces, Available, Installed, Doctor.
- `Claude Code` runtime tab: Marketplaces, Available, Installed, Doctor.
- `Locus` tab or clearly labeled section: Native plugins, Developer plugins, Pinned candidates.

If retaining the current Installed / Sources / Store view modes, rename `Store` to `Locus Store` or `Pinned Candidates` and add a distinct `Marketplaces` view for runtime-owned marketplaces.

## Data Model
Add shared read models rather than reusing `PluginStoreCatalogEntry`:
- `RuntimePluginMarketplace`: runtime, name, source/root, source kind, trust label, status, last refreshed, diagnostics.
- `RuntimePluginListing`: runtime, plugin id, marketplace, name, version, status, source/path, scope, installed/enabled flags when available, component summary, diagnostics.
- `RuntimePluginComponentSummary`: skills, MCP, hooks, apps, commands, agents, LSP, or unknown counts with runtime-specific labels.

`PluginStoreCatalogEntry` remains Locus-native pinned candidate metadata. It should not be used to represent Codex or Claude marketplace entries.

## Failure Handling
- CLI missing: show runtime unavailable/degraded with install guidance.
- CLI timeout: show stale or unavailable marketplace state; do not fall back silently.
- Parse failure: show raw command unavailable as a bounded diagnostic, not in renderer logs with secrets.
- Filesystem/CLI mismatch: show Doctor warning and identify which source is authoritative for the current slice.
- Safe mode: keep metadata listing available, but keep plugin-provided runtime capabilities blocked through existing gates.

## Security And Trust
Read-only CLI commands are allowed to collect marketplace inventory. Write commands require a later OpenSpec change with explicit user confirmation, command previews, timeout/error handling, rollback expectations, and tests.

The marketplace center must not treat marketplace source, OpenAI/Anthropic branding, commit pin, package hash, or local review as sandbox proof. These are provenance and review signals only.
