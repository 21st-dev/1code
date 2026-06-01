# Codex Runtime Capability Audit Plan

This plan defines how to audit Codex support in Locus before opening
implementation OpenSpecs. It is not an implementation spec and does not approve
product-code changes.

## Purpose

Build a repo-grounded map of Codex capabilities in Locus:

- what Locus already supports as visible, controlled, tested behavior
- what Codex CLI or ACP may support natively but Locus only passes through
- what is partially supported
- what is unsupported because Codex CLI/ACP does not expose a safe primitive to
  Locus
- what should be deferred or kept out of scope

The goal is not full Claude Code equality. The goal is capability-driven
support: if Codex exposes a stable primitive, Locus can wire it and mark it
`supported`; if it does not, Locus should mark the capability `degraded`,
`unsupported`, or `out-of-scope`.

## Capability Status Definitions

Use these exact status labels in the audit:

- `supported`: Locus exposes the behavior, controls it, and has tests or smoke
  evidence.
- `native-pass-through`: Codex may support the behavior, but Locus does not
  manage it as a first-class product capability.
- `degraded`: Locus has partial behavior, read-only visibility, prompt-assisted
  behavior, or incomplete control.
- `unsupported`: Locus does not expose or safely control the behavior.
- `out-of-scope`: The behavior is not appropriate for Locus now.

Use these metadata fields:

- `value`: `high`, `medium`, or `low`
- `risk`: `high`, `medium`, or `low`
- `needs_openspec`: `yes` or `no`
- `next`: `audit`, `proposal`, `implement`, or `defer`

## Audit Method

1. Read current Locus implementation:
   - `src/main/lib/trpc/routers/codex.ts`
   - `src/main/lib/codex/`
   - `src/shared/codex-runtime-capabilities.ts`
   - `src/shared/codex-runtime-status.ts`
   - `src/shared/codex-tool-normalizer.ts`
   - `src/renderer/features/agents/lib/acp-chat-transport.ts`
   - `src/renderer/features/agents/`
   - `tests/codex-*`
   - `tests/agent-guard-runtime-pipeline.test.ts`
2. Read current OpenSpec context:
   - `openspec/changes/upgrade-codex-runtime-parity/`
   - `openspec/changes/add-agent-runtime-capability-model/`
   - `openspec/changes/add-headless-agent-jobs/`
   - `openspec/changes/add-command-guide/`
3. Verify current Codex CLI/ACP official behavior before claiming native
   support.
4. Fill the matrix in this document with file references and test evidence.
5. Split follow-up work into small OpenSpec changes.

## Observed Codex CLI Baseline

This audit should distinguish "Codex CLI exposes this" from "Locus exposes,
controls, and tests this." The current local baseline checked for this plan is:

- shell executable: `/opt/homebrew/bin/codex`
- Locus bundled dev executable: `resources/bin/darwin-arm64/codex`
- version: `codex-cli 0.136.0-alpha.1`
- top-level commands observed: `exec`, `review`, `login`, `logout`, `mcp`,
  `plugin`, `mcp-server`, `app-server`, `remote-control`, `app`,
  `completion`, `update`, `doctor`, `sandbox`, `debug`, `apply`, `resume`,
  `fork`, `cloud`, `exec-server`, and `features`
- important shared options observed: `--config`, `--profile`, `--model`,
  `--oss`, `--local-provider`, `--sandbox`, `--ask-for-approval`, `--search`,
  `--image`, `--cd`, `--add-dir`, `--enable`, `--disable`, and
  `--strict-config`
- important `exec` options observed: `--json`, `--output-schema`,
  `--output-last-message`, `--ephemeral`, `--ignore-user-config`,
  `--ignore-rules`, and `exec resume`
- public package freshness check: `npm view @openai/codex` reported
  `latest` as `0.135.0` and `alpha` as `0.136.0-alpha.1`; the shell CLI and
  local bundled dev CLI now match the newest published alpha line
- release-script caveat: `package.json` and CI download commands are still
  pinned to `0.134.0`, so release packaging would need a separate tracked
  version bump before shipping this alpha as Locus's bundled Codex version

Do not treat this local baseline as a permanent public contract. Re-run the
same command help checks before opening implementation OpenSpecs.

## Initial Capability Matrix

This table is a starting point. Update it with exact file and test references
before using it to approve implementation.

| Capability | Locus status | Native support to verify | Current gap | Value | Risk | Needs OpenSpec | Next |
|---|---|---|---|---|---|---|---|
| Runtime startup/status | supported | Codex CLI, ACP startup, and `codex doctor --json` behavior | Existing status and preflight paths work; shared capability manifest extraction still belongs in `add-agent-runtime-capability-model`; full doctor diagnostics are not surfaced | high | medium | yes | proposal |
| Bundled CLI version management | degraded | GitHub release assets for `rust-v0.136.0-alpha.1` and npm dist-tags | Local dev binary can be updated with `scripts/download-codex-binary.mjs`, but tracked release scripts still pin `0.134.0` | medium | medium | yes | proposal |
| Doctor diagnostics | unsupported | `codex doctor --json`, `--summary`, and detailed human output | Locus has runtime status but not the full Codex doctor report, grouping, or remediation detail | medium | medium | yes | proposal |
| Login/session auth | supported | `codex login`, `login status`, `--with-api-key`, `--with-access-token`, `--device-auth`, and `logout` | Locus supports login/status/logout and runtime API-key paths; exact CLI auth mode coverage and diagnostics need audit | high | high | no | audit |
| Plan mode | supported | Codex ACP read-only/plan behavior | Already guarded through ACP permission handling; needs shared manifest mapping | high | medium | yes | proposal |
| Agent mode/basic run | supported | Codex ACP chat/run behavior | Existing desktop chat path works; headless runner still pending | high | medium | yes | proposal |
| Permission modes | degraded | Full Codex CLI/ACP permission mode matrix | Locus enforces guarded plan/agent semantics, but does not expose every Codex-native approval mode as product state | medium | high | yes | audit |
| Runtime option matrix | degraded | `--config`, `--profile`, `--model`, `--oss`, `--local-provider`, `--sandbox`, `--ask-for-approval`, `--search`, `--add-dir`, `--enable`, `--disable`, and `--strict-config` | Locus exposes selected model/provider/cwd/safety concepts, but not the full Codex CLI option matrix | medium | high | yes | audit |
| Hard tool guard | supported | ACP permission handler behavior | Locus fails closed when handler cannot attach; needs shared runtime capability model | high | high | yes | proposal |
| Scope expansion | supported | Locus-owned scope approval contract | Guard emits scope-expansion and denies before approval; needs shared event/capability mapping | high | high | yes | proposal |
| AskUserQuestion | supported | Codex ACP host-side tool behavior | Current bridge handles pending, answer, timeout, and denial; keep event shape runtime-neutral | high | medium | yes | proposal |
| Session resume | degraded | `codex resume`, `codex resume --last`, `codex resume --all`, and `codex exec resume` | Locus persists chat session IDs and can pass an existing session into ACP, but has no Codex session picker/catalog or explicit resume command surface | high | medium | yes | proposal |
| Session-level fork | unsupported | `codex fork`, `codex fork --last`, and `codex fork --all` | Codex CLI exposes session-level fork, but Locus has no fork API/UI/job integration for Codex sessions | high | high | yes | proposal |
| Per-message rollback / fork | unsupported | Codex per-message resume/fork primitive | No reliable durable per-message primitive is exposed through the observed CLI help or wired through Locus | high | high | yes | defer |
| Headless run | unsupported | `codex exec`, stdin prompts, `exec resume`, `--ephemeral`, and `--output-last-message` | Locus has no shared `locus run` runner yet | high | high | yes | proposal |
| Stream JSON / structured output | unsupported | `codex exec --json`, `--output-schema`, and `--output-last-message` | Needed for jobs/CLI; not yet normalized through a shared runner contract | high | medium | yes | proposal |
| Code review | unsupported | `codex review`, `codex exec review`, `--uncommitted`, `--base`, `--commit`, and `--title` | Locus has no Codex-native review action or normalized review result surface | medium | medium | yes | proposal |
| MCP auth | supported | Codex MCP auth/preflight behavior | Locus blocks needs-auth cases before provider work; keep reason-specific diagnostics | high | high | yes | audit |
| MCP configuration | degraded | `codex mcp list --json`, `get --json`, `add`, `remove`, `login`, `logout`, stdio env, HTTP URL, bearer token env var, OAuth client/resource/scopes | Locus reads/listens and supports global add/remove plus login/logout, but lacks `get`, advanced auth/env fields, and safe project-scoped add/remove | high | high | yes | proposal |
| Skills | degraded | Codex skill discovery/import/runtime application | Prompt/context preparation exists in places, but runtime-neutral execution and limitation reporting are incomplete | medium | medium | yes | audit |
| Slash/runtime commands | unsupported | Codex slash/runtime command discovery and invocation | Command guide can index docs, but Codex runtime command execution is not implemented | medium | medium | yes | proposal |
| Hooks | unsupported | Codex hook or lifecycle extension support | No first-class Locus hook management, status, audit, or safety UI for Codex | medium | high | yes | defer |
| Plugins lifecycle | unsupported | `codex plugin list`, `add`, `remove`, and `plugin marketplace add/list/upgrade/remove` | Codex CLI exposes plugin marketplace and install/remove, but Locus has no Codex plugin lifecycle or execution safety UI | medium | high | yes | proposal |
| App Agents/custom agents | degraded | Codex runtime-native agent/skill behavior | Locus can prompt-prepare agent mentions, but prompt injection alone is not runtime support | high | high | yes | proposal |
| Runtime workflows | unsupported | Codex workflow adapter or runtime-native workflow support | Claude Dynamic Workflows have no Codex adapter or shared workflow layer | high | high | yes | defer |
| Usage/context metadata | supported | Codex token/context event availability | Locus emits normalized token/context metadata when Codex provides it and omits missing values | medium | medium | yes | audit |
| Attachments | supported | Codex image/file-content/long-text handling | Current path supports image refs, long-text prompt blocks, and file-content prompt parts | high | medium | yes | audit |
| Provider profiles/gateway | supported | Codex provider override and OpenAI-compatible profile behavior | Renderer passes safe profile IDs; main process resolves gateway tokens and redacts secrets | high | high | no | audit |
| Feature flags | unsupported | `codex features list`, `features enable`, and `features disable` | Locus does not display or mutate Codex feature flags; mutation would write config and needs explicit user control | low | high | yes | defer |
| Sandbox command wrapper | unsupported | `codex sandbox`, permissions profiles, managed config, socket allowlist, and denial logging | Locus uses its own runtime safety model and has not exposed Codex sandbox as a standalone command tool | low | high | yes | defer |
| Local-only/runtime blockers | supported | Locus-owned local-only guard and diagnostics | Keep startup, MCP auth, provider auth, and local-safety failures distinct | high | high | no | audit |
| Codex server/remote-control protocols | out-of-scope | `mcp-server`, `app-server`, `remote-control`, and `exec-server` | These are protocol/server surfaces, some experimental; do not integrate until Locus has a specific host/remote-control use case | low | high | yes | defer |
| Codex product/maintenance commands | out-of-scope | `app`, `completion`, `update`, `apply`, and `cloud` | These are Codex product maintenance, shell integration, task-apply, or cloud surfaces rather than Locus runtime chat/job primitives | low | medium | no | defer |
| Codex official desktop-only features | out-of-scope | Official Codex desktop product behavior | Do not claim support unless the same behavior is exposed through Codex CLI/ACP or a Locus-owned safe layer | low | high | no | defer |

## Recommended Implementation Order

Do not implement the whole matrix at once. Use this order unless later evidence
changes the priority.

1. `add-agent-runtime-capability-model`
   - Establish the shared vocabulary: runtime-neutral, runtime-specific,
     supported, degraded, unsupported, and native-pass-through.
2. `add-headless-agent-jobs`
   - Add shared runner, jobs, CLI entrypoint, event persistence, cancellation,
     and capability gating for Claude and Codex. Codex support should use
     `codex exec --json` and `--output-schema` only after the event contract is
     normalized and tested.
3. `update-codex-bundled-version-management`
   - Decide whether Locus should track stable Codex releases or alpha Codex
     releases for bundled binaries. If alpha is accepted, update package/CI
     download pins and release notes together.
4. `add-codex-review-action`
   - Wire `codex review` / `codex exec review` as an explicit review workflow,
     not as generic chat output.
5. `add-codex-session-resume-fork`
   - Add whole-session resume/fork support using `codex resume`, `codex fork`,
     and `codex exec resume`. Keep per-message rollback/fork out of scope until
     Codex exposes durable per-message references.
6. `add-codex-mcp-project-config`
   - Add full CLI-backed MCP coverage, including `get`, advanced auth/env
     fields, and safe project-scoped behavior. Do not silently write global
     `~/.codex/config.toml`.
7. `add-codex-doctor-diagnostics`
   - Surface `codex doctor --json` as diagnostics, keeping secrets redacted and
     preserving separate startup, auth, MCP, provider, and config failure
     states.
8. `expand-codex-runtime-command-capabilities`
   - Separate documentation indexing, prompt-template commands, Locus commands,
     and runtime-owned Codex command execution.
9. `expand-codex-plugin-lifecycle`
   - Add marketplace list/add/upgrade/remove and plugin install/remove only
     after config mutation, trust, and execution boundaries are explicit.
10. `add-codex-app-agent-runtime-support`
   - Normalize App Agents, skills, and runtime-specific agent behavior only
     after a real execution/limitation contract exists.

## Follow-Up OpenSpec Candidates

Use these only after the audit confirms the exact current gap.

```text
update-codex-bundled-version-management
add-codex-review-action
add-codex-session-resume-fork
add-codex-mcp-project-config
add-codex-doctor-diagnostics
expand-codex-runtime-command-capabilities
expand-codex-plugin-lifecycle
add-codex-app-agent-runtime-support
add-codex-feature-flags-management
add-codex-per-message-rollback-fork-support
```

Existing proposals to continue:

```text
add-agent-runtime-capability-model
add-headless-agent-jobs
```

## What Not To Do

- Do not create one large "complete Codex parity with Claude Code" proposal.
- Do not claim official Codex desktop features unless the same behavior is
  exposed through Codex CLI/ACP or a Locus-owned safe layer.
- Do not confuse session-level `codex fork` with per-message rollback/fork.
- Do not fake per-message rollback/fork with prompt rewriting, history slicing,
  or unsupported session metadata.
- Do not treat plugin marketplace/list/install support as executable plugin
  support inside Locus.
- Do not silently mutate global `~/.codex/config.toml` or `~/.codex/auth.json`
  while implementing project-scoped behavior, feature flags, MCP, or plugin
  lifecycle controls.
- Do not expose provider secrets, gateway tokens, or auth artifacts to the
  renderer.
- Do not block headless jobs on unsupported Codex gaps. Gate the missing
  behavior as `degraded` or `unsupported`.

## Completion Criteria For This Audit

The audit is complete when:

- every matrix row has repo file references
- every `native support to verify` item has a current source or is marked
  unverified
- each `supported` claim has tests or smoke evidence
- each `degraded` or `unsupported` claim has a user-facing reason
- follow-up OpenSpec candidates are ranked and scoped
- unsupported Codex features are not represented as Claude-equivalent behavior
