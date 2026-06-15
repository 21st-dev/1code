# Runtime CLI Capability Inventory

Snapshot date: 2026-06-05

This document aligns the current runtime CLI capability picture before opening
or expanding implementation OpenSpecs. It is an inventory and gap analysis, not
an implementation spec and not a support claim.

## Bottom Line

The next platform slice should be a runtime CLI capability inventory and
capability center.

Locus already has a capability truth model for Claude Code and Codex. The
missing platform layer is a vendor-aware matrix that can answer:

- what Claude Code CLI publishes
- what Codex CLI publishes
- what Locus has wired as controlled product behavior
- what is only configurable or discoverable
- what can actually execute through Locus
- what still needs tests or real smoke before it can be marked `supported`

Do not mark a capability `supported` because the vendor CLI has a command. In
this repo, `supported` requires Locus code plus tests or smoke evidence.

## Evidence Read

Local repo evidence:

- `src/shared/agent-runtime-capabilities.ts`
- `src/shared/codex-runtime-capabilities.ts`
- `src/main/lib/agent-runtime/runtime-registry.ts`
- `src/main/lib/trpc/routers/index.ts`
- `src/main/lib/trpc/routers/plugins.ts`
- `src/main/lib/trpc/routers/app-agents.ts`
- `src/main/lib/app-agents/**`
- `openspec/specs/agent-runtime-capabilities/spec.md`
- `openspec/specs/codex-runtime-parity/spec.md`
- `openspec/changes/add-claude-dynamic-workflows-adapter/**`
- `tests/agent-runtime-capabilities.test.ts`
- `tests/codex-runtime-capabilities.test.ts`
- `tests/agent-guard-runtime-pipeline.test.ts`
- `tests/headless-cli-dispatcher.test.ts`

Local CLI evidence:

- `codex --version`: `codex-cli 0.139.0`
- `claude --version`: `2.1.177 (Claude Code)`
- `codex --help`, `codex exec --help`, `codex review --help`,
  `codex mcp --help`, `codex plugin --help`
- `claude --help`, `claude mcp --help`, `claude plugin --help`,
  `claude agents --help`, `claude ultrareview --help`

Official upstream references checked:

- Claude Code CLI reference:
  <https://code.claude.com/docs/en/cli-usage>
- Claude Code Dynamic Workflows:
  <https://code.claude.com/docs/en/workflows>
- Claude Code plugins reference:
  <https://code.claude.com/docs/en/plugins-reference>
- Claude Dynamic Workflows announcement:
  <https://claude.com/blog/introducing-dynamic-workflows-in-claude-code>
- Codex CLI overview:
  <https://developers.openai.com/codex/cli>
- Codex CLI features:
  <https://developers.openai.com/codex/cli/features>
- Codex CLI slash commands:
  <https://developers.openai.com/codex/cli/slash-commands>
- Codex plugins:
  <https://developers.openai.com/codex/plugins>
- Codex workflows:
  <https://developers.openai.com/codex/workflows>
- Codex app server:
  <https://developers.openai.com/codex/app-server>
- Codex changelog:
  <https://developers.openai.com/codex/changelog>

## Current Locus Capability Truth

Locus currently declares two runtime IDs:

- `claude-code`
- `codex`

Locus currently declares fourteen capability IDs:

- `hardToolGuard`
- `planMode`
- `scopeExpansion`
- `askUserQuestion`
- `rollback`
- `mcpAuth`
- `mcpConfiguration`
- `providerProfiles`
- `attachments`
- `usageMetadata`
- `runtimePlugins`
- `runtimeCommands`
- `runtimeWorkflows`
- `appAgents`

The governing rule is in `agent-runtime-capabilities`: a capability marked
`supported` must include code or stable runtime evidence, and support evidence
must reference at least one source. The OpenSpec requirement is stricter:
tests or smoke evidence must cover the behavior before the implementation
checklist is completed. Prompt-only behavior, UI labels, docs indexing, and
post-run audit do not satisfy `supported`.

| Capability | Claude Code in Locus | Codex in Locus | Current read |
| --- | --- | --- | --- |
| `hardToolGuard` | `supported` | `supported` | Both runtimes route guarded work through Locus enforcement before mutating operations. |
| `planMode` | `supported` | `supported` | Both have read-only or deny-before-execute behavior wired through local runtime paths. |
| `scopeExpansion` | `supported` | `supported` | Both can emit or enforce scope expansion before crossing approved boundaries. |
| `askUserQuestion` | `supported` | `supported` | Claude question flows and Codex ACP host-side AskUserQuestion are bridged into the desktop question UI contract. |
| `rollback` | `supported` | `unsupported` | Claude has resume/fork/rollback metadata paths. Codex session IDs exist, but rollback/fork are not wired through durable shared session references. |
| `mcpAuth` | `supported` | `supported` | Both can block known needs-auth MCP servers before provider work. |
| `mcpConfiguration` | `degraded` | `degraded` | Both have some visibility/configuration, but scope-equivalent shared add/list/remove/auth semantics are incomplete. |
| `providerProfiles` | `supported` | `supported` | Provider profile IDs are renderer-safe and resolved in main process. |
| `attachments` | `supported` | `supported` | Image and long-text attachments are resolved through main-process/shared stores before runtime injection. |
| `usageMetadata` | `degraded` | `supported` | Codex token/context metadata is normalized when available. Claude usage/quota semantics remain runtime-specific and partial. |
| `runtimePlugins` | `degraded` | `unsupported` | Locus has plugin marketplace/list/action surfaces, but executable lifecycle semantics are not normalized; Codex execution is not yet a supported Locus capability. |
| `runtimeCommands` | `degraded` | `unsupported` | Locus has command guidance/discovery, but runtime-owned command execution is not modeled as normalized product behavior. |
| `runtimeWorkflows` | `unsupported` | `unsupported` | Claude Dynamic Workflows have a proposal only. Codex has no equivalent adapter or shared Locus workflow layer. |
| `appAgents` | `degraded` | `degraded` | Locus App Agents can be stored and prompt-prepared, but runtime-native execution and limitation reporting are incomplete. |

## Integration Decision Matrix

Decision labels:

- `already-integrated`: Locus already exposes controlled behavior with current
  capability truth. Keep evidence fresh, but this is not the next platform gap.
- `should-integrate`: This is a useful platform capability gap. Open a focused
  OpenSpec before product-code changes.
- `do-not-integrate-now`: Do not make this part of the current platform slice.
  Revisit only with a separate product/security proposal.

| Capability area | Claude Code upstream | Codex upstream | Locus state today | Decision | Why / next |
| --- | --- | --- | --- | --- | --- |
| Core safety gates: hard tool guard, plan mode, scope expansion, AskUserQuestion | Permission modes, tools, plan/auto/bypass flows, question/tool approval paths | Sandbox/approval modes, app-server command/file/network approvals, request-user-input | `supported` for both runtimes | `already-integrated` | This is the current foundation. Keep tests and smoke evidence current when adapters change. |
| Provider profiles | Runtime can be launched with model/profile-like settings and provider auth context | Runtime can be launched with model/profile-like settings and provider auth context | `supported` for both runtimes | `already-integrated` | Locus resolves profile IDs in the main process and keeps secrets out of renderer state. |
| Attachments | File/image inputs are available through Claude surfaces | Image inputs and file/context attachment flows are available through Codex surfaces | `supported` for both runtimes | `already-integrated` | Locus already resolves image and long-text attachments through local stores before runtime injection. |
| MCP auth preflight | MCP config and auth management are published | MCP config and auth management are published | `mcpAuth` is `supported` for both runtimes | `already-integrated` | Keep the preflight boundary. The remaining gap is MCP configuration parity, not auth blocking. |
| Claude rollback/fork | Continue/resume/session/fork-style primitives are available | Resume/fork commands exist upstream, but not as Locus rollback semantics | Claude `rollback` is `supported`; Codex `rollback` is `unsupported` | `already-integrated` for Claude only | Keep Claude runtime-specific. Do not expose Codex rollback until durable shared refs are wired. |
| Codex usage metadata | Usage/quota semantics are runtime-specific and partial | Token/context metadata is available through Codex runtime events | Claude `degraded`; Codex `supported` | `already-integrated` for Codex only | Treat missing fields as unavailable, not zero. Claude can stay degraded unless a useful normalized source appears. |
| Runtime CLI inventory and capability center | CLI/help/docs expose many command families | CLI/help/docs expose many command families | Missing dedicated inventory layer | `should-integrate` | This is the immediate platform gap: show upstream, installed, configured, executable, tested, smoked, and supported separately. |
| Runtime command inventory | Slash commands, plugin commands, workflow commands, CLI subcommands | Slash commands, CLI subcommands, app/plugin commands | Claude `runtimeCommands` degraded; Codex unsupported | `should-integrate` | First inventory and categorize commands. Execution should be a later OpenSpec with normalized events and approval semantics. |
| MCP configuration parity | `claude mcp` supports list/get/add/remove/import-like flows | `codex mcp` supports list/get/add/remove/login/logout | `degraded` for both runtimes | `should-integrate` | Add explicit scope semantics for user/global, project, local, and plugin/app-provided MCP servers. Never silently write to the wrong scope. |
| Runtime plugin lifecycle | Rich plugin model: skills, commands, agents, hooks, MCP, LSP, monitors, executables, settings | Plugins bundle skills, apps, and MCP servers; app and CLI plugin browsers exist | Claude degraded; Codex unsupported | `should-integrate` | Inventory/install/enable/auth/status should come before "execute plugin" claims. Execution requires separate smoke evidence. |
| Claude Dynamic Workflows | Research-preview dynamic workflow runtime with `/deep-research`, `/workflows`, `ultracode`, approval, progress, stop/save | No equivalent Claude-style local dynamic workflow primitive | Unsupported; proposal exists only | `should-integrate` as Claude-specific | Continue `add-claude-dynamic-workflows-adapter`, but keep it runtime-specific and non-blocking until implemented and smoked. |
| Runtime review surfaces | `claude ultrareview` | `/review` and `codex review` | Not modeled as a capability | `should-integrate` | Useful product surface. Add a small `runtimeReview` or command subtype with local/hosted labels and normalized review results. |
| Doctor, diagnostics, feature flags | `doctor`, plugin diagnostics, daemon/background diagnostics | `doctor`, `features`, app-server diagnostics | Scattered across runtime status, plugin doctor, provider diagnostics | `should-integrate` | Capability center should show version, command families, plugin health, MCP health, auth state, feature flags, and smoke status. |
| Codex resume/fork as Locus rollback | Not applicable for Codex | `resume`, `fork`, `/resume`, `/fork`, `/side` exist | Codex `rollback` unsupported | `should-integrate` later | Worth doing only if Locus can provide durable resume-at/fork semantics without mutating original transcript history. |
| App Agents, background agents, subagents | `claude agents`, background sessions, dynamic subagents, plugin agents | Subagent workflows and `/agent` | `degraded` for both runtimes | `should-integrate` later | First split Locus App Agents, vendor subagents, background sessions, and plugin-provided agents into separate capability concepts. |
| Remote-control, cloud, hosted execution | Remote-control and hosted/remote review surfaces | Cloud, app server, remote-control, remote connections | Not local-first platform capability | `do-not-integrate-now` | This changes trust boundaries. Keep out of the current local runtime capability center unless a new security/product proposal approves it. |
| Generic Locus workflow engine | Claude owns dynamic workflow runtime | Codex docs describe workflow recipes, not the same primitive | Not implemented | `do-not-integrate-now` | Do not build a generic workflow engine to mimic vendors. Adapt runtime-native workflow primitives only. |
| Codex parity for Claude Dynamic Workflows | Claude-specific primitive | No equivalent primitive | Unsupported | `do-not-integrate-now` | Do not require Codex to emulate Claude workflows. Either keep it unsupported or later define a separate shared Locus workflow layer. |
| Raw passthrough for every vendor command | Many commands and flags | Many commands and flags | Not modeled | `do-not-integrate-now` | Raw passthrough would bypass capability gating. Commands should go through typed adapters, approval, cancellation, and normalized events. |
| CLI niceties: themes, keymaps, install/update management | Themes/output styles/install/update/plugin niceties | Themes/keymaps/update/install niceties | Mostly not modeled | `do-not-integrate-now` | Low platform value for the next slice. Revisit only if the capability center needs display or upgrade diagnostics. |
| Browser/Chrome/computer-use runtime surfaces | Chrome integration | Computer Use / browser-like surfaces in Codex product docs | Separate from runtime CLI capability truth | `do-not-integrate-now` for this slice | This needs a browser/security product proposal, not a runtime capability inventory shortcut. |

## Vendor CLI Surface Snapshot

This section is upstream capability inventory. It does not mean Locus supports
the behavior.

### Claude Code CLI

Observed locally with Claude Code `2.1.177` and checked against official docs.

Published CLI surfaces include:

- interactive sessions and print/SDK mode
- stream JSON input/output
- session continue/resume, named sessions, explicit session IDs, fork session
- `--add-dir` and worktree/tmux execution surfaces
- tool restrictions and permission modes
- plan/auto/bypass permission modes
- MCP configuration and MCP server management
- plugin install/list/enable/disable/update/validate/details
- plugin components: skills, commands, agents, hooks, MCP servers, LSP servers,
  monitors, executables, output styles, themes, and settings
- `claude agents` for background sessions and agent view
- background-session management in published docs, including attach, logs,
  respawn, stop, remove, and daemon status/stop
- `claude ultrareview` for non-interactive review
- Chrome integration flags
- remote-control surfaces
- structured output via JSON schema
- prompt suggestions in stream JSON mode
- dynamic subagents via `--agents`
- dynamic workflows as research preview, including `/deep-research`,
  `/workflows`, saved workflow commands, `ultracode`, workflow approval,
  progress view, pause/resume in-session, stop, restart agent, save, and
  disablement through `/config`, settings, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`

Important Locus boundary:

- Claude Dynamic Workflows are not supported in Locus today.
- The active proposal `add-claude-dynamic-workflows-adapter` is only 4/36 tasks
  complete and explicitly says not to describe Dynamic Workflows as supported
  until approved, implemented, tested, and smoke-tested.

### Codex CLI

Observed locally with Codex CLI `0.136.0-alpha.1` and checked against official
Codex docs.

Published CLI surfaces include:

- interactive TUI
- `exec` non-interactive mode for automation
- `review` for local code review
- login/logout
- MCP client management through `codex mcp`
- experimental MCP server through `codex mcp-server`
- plugin management through `codex plugin`
- app server and remote-control experimental surfaces
- app browsing/mention surfaces
- shell sandbox modes and approval modes
- `doctor`, `sandbox`, `debug`, `apply`, `resume`, `fork`, `cloud`,
  `exec-server`, and `features`
- feature flags through `codex features`
- image inputs and image generation
- web search
- subagent workflows when explicitly requested
- slash commands including `/diff`, `/resume`, `/fork`, `/side`, `/review`,
  `/mcp`, `/apps`, `/plugins`, `/hooks`, `/ps`, `/stop`, `/compact`,
  `/mention`, `/theme`, `/keymap`, `/new`, `/init`, `/feedback`, and `/logout`
- app-server approval flows for command execution, file changes, network
  access, request-user-input, dynamic tools, and app/MCP tool-call approvals
- plugin model that bundles skills, app integrations, and MCP servers into
  reusable workflows
- workflow docs that describe development usage patterns across IDE, CLI, and
  Codex cloud, not a Claude-style local dynamic-workflow runtime adapter

Important Locus boundary:

- Codex upstream has `resume` and `fork` commands, but Locus still keeps Codex
  `rollback` unsupported because Locus has not wired durable shared rollback
  and fork references through the runtime contract.
- Codex upstream has plugin browsing/management, but Locus still keeps Codex
  `runtimePlugins` unsupported because executable plugin lifecycle semantics
  are not a supported Locus product path yet.
- Codex upstream has slash commands and subcommands, but Locus still keeps
  Codex `runtimeCommands` unsupported because normalized runtime command
  invocation and events are not implemented.

## Locus Code vs Vendor Feature Gaps

### 1. Runtime CLI capability inventory

Missing platform ability:

- Probe installed runtime versions and command surfaces.
- Capture renderer-safe CLI metadata without secrets or raw config.
- Persist a local snapshot that distinguishes:
  - upstream published
  - locally installed
  - Locus configured
  - Locus executable
  - Locus tested/smoked
  - Locus supported
- Show drift when vendor CLI adds/removes commands.

Current code has the capability manifest, but not the vendor CLI inventory
layer. This is the highest-leverage next slice because it prevents future
claims from mixing up "vendor CLI has it" with "Locus supports it."

### 2. Runtime commands

Current state:

- Claude: `degraded`
- Codex: `unsupported`

What exists:

- Locus has command guidance/discovery surfaces.
- Claude and Codex both publish many runtime-owned commands.

What is missing:

- A command category model:
  - CLI subcommands, such as `codex review` or `claude ultrareview`
  - interactive slash commands, such as `/review`, `/workflows`, `/mcp`
  - plugin or skill commands
  - Locus prompt templates
- Runtime command invocation API.
- Normalized events:
  - command started
  - command output
  - command awaiting approval
  - command completed
  - command failed
- Capability gating so command execute controls are hidden or disabled unless
  the selected runtime can really run them through Locus.

High-value command candidates:

- Claude: `/deep-research`, `/workflows`, `/effort ultracode`,
  `claude agents`, `claude ultrareview`, plugin management commands.
- Codex: `/review`, `/diff`, `/mcp`, `/apps`, `/plugins`, `/hooks`,
  `/resume`, `/fork`, `/side`, `codex review`, `codex apply`,
  `codex sandbox`, `codex doctor`, `codex features`.

### 3. Runtime workflows

Current state:

- Claude: `unsupported`
- Codex: `unsupported`

What exists upstream:

- Claude Code has Dynamic Workflows in research preview.
- Codex has workflow documentation as usage recipes across surfaces, but not
  the same local dynamic workflow primitive.

What exists in repo:

- An active OpenSpec proposal for a Claude-specific dynamic workflows adapter.
- No implementation yet.

What is missing:

- Claude workflow support detection.
- `Off` / `Ask` / `Allow` setting.
- `CLAUDE_CODE_DISABLE_WORKFLOWS=1` injection when disabled or unsupported.
- Workflow launch approval card.
- Workflow event normalization.
- Workflow stop/cancel integration.
- Real smoke with a Claude Code credential.

Do not make this runtime-neutral. Treat it as Claude-specific until another
runtime has an equivalent primitive or Locus explicitly builds a shared workflow
layer.

### 4. Runtime plugins

Current state:

- Claude: `degraded`
- Codex: `unsupported`

What exists:

- `src/main/lib/trpc/routers/plugins.ts` exposes runtime plugin marketplace
  list/action preview/action execution paths for Claude and Codex action IDs.
- Claude Code publishes a rich plugin model with skills, agents, hooks, MCP,
  LSP, monitors, executables, output styles, themes, settings, and lifecycle
  CLI commands.
- Codex publishes plugins that bundle skills, app integrations, and MCP
  servers, with app and CLI plugin browsers.

What is missing:

- A normalized runtime plugin lifecycle contract.
- Per-runtime install source, enablement state, auth state, and executable
  surface metadata.
- A clear split between:
  - marketplace listing
  - install/update/remove
  - enable/disable
  - authentication
  - MCP/server activation
  - skill/agent/command discovery
  - actual execution during a run
- Tests or smoke that prove installed plugin behavior is available to the
  selected runtime through Locus.

Until this is done, plugin UI can be useful but should not imply full runtime
plugin support.

### 5. MCP configuration

Current state:

- Claude: `degraded`
- Codex: `degraded`

What exists:

- Both runtimes have MCP auth checks and can block known needs-auth state before
  provider work.
- Both vendor CLIs expose MCP management commands.

What is missing:

- Shared semantics for list/get/add/remove/login/logout by scope.
- Explicit scope handling:
  - user/global
  - project
  - local/gitignored
  - app/plugin-provided
- Health and auth-state normalization across both runtimes.
- Failure behavior that never silently writes to the wrong scope.
- Smoke cases for authenticated and unauthenticated MCP servers.

### 6. Session lifecycle: resume, fork, rollback, side threads

Current state:

- Claude rollback: `supported`
- Codex rollback: `unsupported`

What exists upstream:

- Claude supports continue/resume/session ID/fork-session style primitives.
- Codex publishes `resume`, `fork`, `/resume`, `/fork`, and `/side`.

What is missing:

- Codex durable shared session references in Locus.
- Resume-at-message or equivalent rollback semantics.
- Fork semantics that do not mutate the original transcript.
- Tests proving Codex cannot use Claude session semantics by accident.

This is a good example of the core rule: upstream has commands, but Locus does
not call the capability supported until the product semantics are wired.

### 7. Background agents and App Agents

Current state:

- Claude App Agents: `degraded`
- Codex App Agents: `degraded`

What exists:

- Locus has an App Agent registry, settings UI, mentions, and prompt
  preparation.
- Claude publishes `claude agents` and background-session management.
- Codex publishes subagent workflows and slash `/agent`.

What is missing:

- A runtime-native background agent capability model.
- A split between:
  - Locus App Agents as saved prompt/tool profiles
  - Claude Code subagents/background agents
  - Codex subagents
  - plugin-provided agents
- Runtime execution metadata and limitations.
- Event stream for spawned agents and their tool work.

Prompt preparation alone is not full agent execution support.

### 8. Review surfaces

Current state:

- Not modeled as its own capability.

What exists upstream:

- Codex publishes local code review through `/review` and `codex review`.
- Claude publishes `claude ultrareview`.

What is missing:

- A `runtimeReview` or command-category capability decision.
- Clear local vs hosted review boundary.
- Normalized review result shape.
- Runtime-specific gating and cost/remote warnings.

This likely deserves its own small capability or command subtype instead of
being hidden inside generic runtime commands.

### 9. Doctor, diagnostics, and feature flags

Current state:

- Partially scattered across runtime status, provider diagnostics, plugin
  doctor, and CLI help.

What exists upstream:

- Claude publishes `doctor`, plugin diagnostics, and daemon/background
  diagnostics.
- Codex publishes `doctor` and `features`.

What is missing:

- A capability center diagnostics panel that can show:
  - vendor CLI path
  - version
  - supported command families
  - disabled experimental features
  - plugin health
  - MCP health
  - auth state
  - sandbox/permission mode support
  - smoke evidence status

### 10. Remote, cloud, and hosted execution

Current state:

- Not modeled as a local-first platform capability.

What exists upstream:

- Claude publishes remote-control and hosted/remote review surfaces.
- Codex publishes cloud, app server, remote-control, remote connections, and
  app-server protocols.

What is missing:

- Explicit local-first boundary labels.
- Off-by-default gating for hosted or remote execution.
- Separate trust model and OpenSpec before exposing these as Locus platform
  capabilities.

Do not let remote/cloud commands leak into local runtime support claims.

## Proposed OpenSpec Slice

Suggested change ID:

- `add-runtime-cli-capability-inventory`

Suggested scope:

- Add a runtime CLI inventory data model.
- Add probes for `claude` and `codex` versions and help surfaces.
- Add a renderer-safe capability center view or data endpoint.
- Add snapshot/evidence fields that distinguish upstream, installed,
  configured, executable, tested, and supported.
- Do not implement command execution, workflow execution, plugin execution, or
  remote/cloud execution in this slice.

Suggested first requirements:

- The system SHALL collect sanitized runtime CLI metadata for each registered
  runtime.
- The system SHALL separate vendor-published capabilities from Locus-supported
  capabilities.
- The system SHALL mark support evidence as absent until code plus tests or
  smoke evidence exists.
- The system SHALL expose a capability center without provider secrets, OAuth
  tokens, raw request headers, or plaintext credential material.
- The system SHALL identify unsupported/degraded capabilities before provider
  work starts.

Suggested implementation order:

1. Runtime CLI probe library.
2. Static parsers for known `claude --help` and `codex --help` command groups.
3. Safe status endpoint through the existing runtime registry/router boundary.
4. Capability center matrix UI.
5. Focused tests for parser redaction and status separation.
6. Follow-up OpenSpecs for command execution, MCP management parity, plugin
   lifecycle parity, Claude dynamic workflows, review surfaces, and runtime
   diagnostics.

## Acceptance Rules For Future Work

Use these rules when deciding whether a feature is supportable:

- `vendor-published`: official docs or local CLI help expose the feature.
- `installed`: the local runtime version exposes the command or flag.
- `configured`: Locus can read or write the relevant safe configuration.
- `executable`: Locus can invoke the behavior through an intentional runtime
  adapter path.
- `controlled`: Locus can apply permissions, cancellation, event normalization,
  status, and error handling.
- `tested`: focused tests cover the behavior.
- `smoked`: real runtime smoke covers the behavior where tests cannot prove it.
- `supported`: all required product semantics above are true for the specific
  runtime and capability.

This inventory doc should therefore unblock planning without pretending the
platform is complete. The goal is to make the missing platform abilities visible
and actionable.
