# Claude Code Runtime Capability Audit Plan

This plan defines how to audit Claude Code support in Locus before opening
implementation OpenSpecs. It is not an implementation spec and does not approve
product-code changes.

## Purpose

Build a repo-grounded map of Claude Code capabilities in Locus:

- what Locus already supports as visible, controlled, tested behavior
- what Claude Code may support natively but Locus only passes through
- what is partially supported
- what is unsupported
- what should be deferred or kept out of scope

The output should guide small follow-up OpenSpec changes instead of creating one
large "support every Claude Code feature" change.

## Capability Status Definitions

Use these exact status labels in the audit:

- `supported`: Locus exposes the behavior, controls it, and has tests or smoke
  evidence.
- `native-pass-through`: Claude Code may support the behavior, but Locus does
  not manage it as a first-class product capability.
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
   - `src/main/lib/trpc/routers/claude.ts`
   - `src/main/lib/claude/`
   - `src/shared/`
   - `src/renderer/features/agents/`
   - `src/renderer/components/dialogs/settings-tabs/`
   - `tests/`
2. Read current OpenSpec context:
   - `openspec/specs/claude-code-credentials/spec.md`
   - `openspec/specs/runtime-plugins/spec.md`
   - `openspec/specs/skill-registry/spec.md`
   - `openspec/specs/usage-panel/spec.md`
   - `openspec/changes/add-claude-dynamic-workflows-adapter/`
   - `openspec/changes/add-headless-agent-jobs/`
   - `openspec/changes/add-agent-runtime-capability-model/`
3. Verify current Claude Code official behavior before claiming native support.
4. Fill the matrix in this document with file references and test evidence.
5. Split follow-up work into small OpenSpec changes.

## Initial Capability Matrix

This table is a starting point. Update it with exact file and test references
before using it to approve implementation.

Status note: this audit predates the later `add-headless-agent-jobs` phases.
Rows marked for headless jobs have been reconciled with the current local job
platform evidence, while advanced Claude Code structured-output/session details
still need capability-specific audits before public parity claims.

| Capability | Locus status | Native support to verify | Current gap | Value | Risk | Needs OpenSpec | Next |
|---|---|---|---|---|---|---|---|
| Runtime startup | supported | Claude CLI/SDK startup | Existing runtime path is mature; may still need shared manifest extraction | high | medium | yes | proposal |
| Local credential import/login/refresh | supported | Claude Code OAuth/local credential behavior | Current spec exists; keep under local-first credential boundary | high | high | no | audit |
| Plan mode | supported | Claude permission/read-only behavior | Needs mapping into shared capability manifest | high | medium | yes | proposal |
| Agent mode | supported | Claude tool execution behavior | Needs mapping into shared capability manifest | high | medium | yes | proposal |
| Permission modes | degraded | Full Claude Code permission mode matrix | Locus mostly exposes Plan/Agent plus guard semantics, not the full matrix | medium | high | yes | proposal |
| Hard tool guard | supported | SDK `canUseTool` / permission hook behavior | Needs shared capability manifest and tests when extracted | high | high | yes | proposal |
| Scope expansion | supported | Locus-owned guard approval | Works through Locus guard path; needs capability manifest | high | high | yes | proposal |
| AskUserQuestion | supported | SDK user-input/tool flow | Works in current Claude path; needs shared event naming | high | medium | yes | proposal |
| Session resume | supported | Claude session resume | Current path persists session IDs; audit exact semantics | high | medium | yes | audit |
| Rollback / fork | supported | `resumeSessionAt` / fork session behavior | Supported for Claude path; needs shared manifest and clearer session metadata | high | high | yes | proposal |
| Headless run | supported | Claude headless/print/stream output | Basic `claude -p` backed `locus run` exists through the job platform; successful runs still depend on local Claude Code auth | high | high | yes | audit |
| Stream JSON / structured output | degraded | Claude structured CLI output | Locus provides structured job events and CLI output rules; full Claude-native structured-output parity remains a separate capability audit | high | medium | yes | audit |
| MCP config/auth/tools | degraded | Claude MCP config and OAuth behavior | Locus has MCP surfaces, but full runtime-scoped capability/status map needs audit | high | high | yes | audit |
| Skills | degraded | Claude skills directories/import behavior | Install/list exists through registry surfaces; runtime application needs audit | medium | medium | yes | audit |
| Slash/runtime commands | degraded | Claude slash/runtime command behavior | Locus has command guide/discovery, not full command execution capability model | medium | medium | yes | proposal |
| Hooks | unsupported | Claude hooks | No first-class Locus hooks management, status, audit, or safety UI | high | high | yes | proposal |
| Plugins lifecycle | degraded | Claude plugin install/enable/disable/MCP behavior | Locus has discovery/source browsing and some scoped actions, not full lifecycle | medium | high | yes | proposal |
| Subagents/custom agents | degraded | Claude subagents / agents behavior | Locus App Agents exist, but runtime-native mapping is not complete | high | high | yes | proposal |
| Dynamic workflows | unsupported | Claude dynamic workflows | OpenSpec exists; implementation is pending | high | high | yes | implement |
| Usage/context metadata | degraded | Claude usage/context metadata | Locus has local usage surfaces; exact provider quota/context support needs audit | medium | medium | yes | audit |
| Attachments | supported | Claude image/long-text input handling | Current send paths support image and long-text refs; keep local-ref boundary | high | medium | yes | audit |
| Git/PR workflow | supported | Locus-owned GitHub workflow | Mostly Locus-owned, not Claude-native; keep runtime-neutral where possible | medium | medium | no | audit |
| Session metadata rename/tag/search | unsupported | Claude session metadata behavior | Locus primarily uses sub-chat metadata; no full Claude session catalog UI | medium | medium | yes | defer |
| Local-only boundary | supported | Locus-owned local-only guard | Must remain enforced regardless of Claude runtime feature | high | high | no | audit |

## Recommended Implementation Order

Do not implement the whole matrix at once. Use this order unless later evidence
changes the priority.

1. `add-agent-runtime-capability-model`
   - Establish the shared vocabulary: runtime-neutral, runtime-specific,
     supported, degraded, unsupported.
2. `add-headless-agent-jobs`
   - Implemented for the basic local job platform. Future work should extend
     this layer instead of creating a second headless runner.
3. `add-claude-dynamic-workflows-adapter`
   - Implement the existing Claude-only workflows proposal after the capability
     model is accepted.
4. `add-claude-hooks-management`
   - Make hooks visible, auditable, and controllable before treating them as a
     first-class runtime capability.
5. `add-claude-subagent-runtime-support`
   - Map Locus App Agents/custom agents to Claude runtime-native agent behavior
     where safe.
6. `expand-runtime-plugin-lifecycle`
   - Complete plugin install/update/enable/disable and plugin-provided MCP
     approval flows.
7. `expand-runtime-command-capabilities`
   - Separate prompt-template commands, Locus commands, and runtime-owned
     Claude commands.

## Follow-Up OpenSpec Candidates

Use these only after the audit confirms the exact current gap.

```text
add-claude-hooks-management
add-claude-subagent-runtime-support
expand-runtime-plugin-lifecycle
expand-runtime-command-capabilities
expand-claude-session-metadata-management
```

Existing proposals to continue:

```text
add-agent-runtime-capability-model
add-headless-agent-jobs
add-claude-dynamic-workflows-adapter
```

## What Not To Do

- Do not create one large "complete Claude Code parity" proposal.
- Do not treat native Claude behavior as Locus-supported unless Locus exposes,
  controls, and tests it.
- Do not expose provider secrets or OAuth tokens to the renderer while adding
  capability status.
- Do not let runtime-specific Claude features appear as Codex features.
- Do not make headless jobs depend on dynamic workflows, hooks, plugins, or
  subagents being complete.

## Completion Criteria For This Audit

The audit is complete when:

- every matrix row has repo file references
- every `native support to verify` item has a current source or is marked
  unverified
- each `supported` claim has tests or smoke evidence
- each `degraded` or `unsupported` claim has a user-facing reason
- follow-up OpenSpec candidates are ranked and scoped
