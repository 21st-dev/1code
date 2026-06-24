## Context

Chat composition renders an agent dropdown plus a second control that branches
three ways (`new-chat-form.tsx`, `chat-input-area.tsx`): Qwen → static label, Kun
→ `KunProviderProfileSelector`, Claude/Codex → `AgentModelSelector`.
`AgentModelSelector` is typed `AgentProviderId = "claude-code" | "codex"` yet
switches runtime inside `handleItemClick`, guarded by `CrossProviderConfirmDialog`.
The "switch runtime mid-chat" flow (`active-chat.tsx` `handleContinueWithProvider`
/ `handleInputProviderChange`) is also typed `"claude-code" | "codex"` and stages
history into a new sub-chat with per-runtime model-preference inheritance. The
runtime capability manifest (`agent-runtime-capabilities.ts`) already carries
status (supported/degraded/unsupported) and Qwen's `providerProfiles` is
`degraded` ("do not treat Qwen as provider-profile ready").

## Goals / Non-Goals

**Goals:**
- One Engine control (sole runtime switch) + one runtime-scoped Model control,
  identical in shape for all four runtimes, on both new-chat and active-chat.
- Zero behavior regression for existing Claude/Codex model, thinking, account
  source, provider-profile, and Ollama selection.
- Generalize the engine-switch-starts-a-new-chat flow to all four runtimes.

**Non-Goals:**
- Splitting the Settings `agents-models` tab (focused follow-up).
- Any backend/runtime, manifest data, or provider-gateway change.
- New provider-profile parity for Qwen.

## Decisions

- **Engine control owns the runtime switch and the new-chat confirm.** The Engine
  control is the only runtime-switch entry. Selecting a different engine triggers
  the appropriate active-chat switch path; the `CrossProviderConfirmDialog` moves
  from `AgentModelSelector` onto the Engine control for non-empty history
  switches. Status (experimental / unavailable / setup-required) is read from the
  runtime manifest + runtime setup status. Setup-required or unavailable engines
  are non-runnable: they may be disabled or provide a setup action, but selecting
  them must not change the selected runtime, start a run, or create a sub-chat.
  *Alternative rejected:* keep runtime switching reachable from the Model control
  — that is exactly today's conflation.
- **Model control is runtime-scoped and never switches runtime.** A single
  runtime-neutral Model component parameterized by the selected engine renders that
  runtime's sources/profiles/models/BYO. Contextual options (Codex thinking +
  account source, Claude thinking) appear ONLY when the selected engine/model
  supports them. The selected value is per-engine, backed by the existing
  per-runtime atoms. New-chat uses the existing global/project defaults, while
  active-chat uses the current sub-chat atom families
  (`subChatClaudeModelSourceAtomFamily`, `subChatCodexModelSourceAtomFamily`,
  `subChatCodexModelIdAtomFamily`, `subChatCodexThinkingAtomFamily`,
  `subChatKunModelSourceAtomFamily`, and `subChatModelIdAtomFamily`) and may
  update the matching `lastSelected*` atoms only as defaults for future chats.
  Runtimes without provider-profile parity (Qwen) render a runtime-managed /
  setup state, not faked profiles.
- **Generalize the switch flow, not just its type — the hard part.** Widening
  `handleContinueWithProvider` / `handleInputProviderChange` from
  `"claude-code" | "codex"` to all runtimes is necessary but not sufficient: the
  flow also inherits per-runtime model preferences (claude/codex-shaped today). It
  must generalize per runtime, including the no-provider-profile case (Qwen) and
  Kun's profile/BYO source, so a switch into any runtime starts a coherent new
  sub-chat. This is the change's main implementation risk.
- **Preserve the empty active sub-chat fast path.** Active-chat has two switch
  behaviors: an empty sub-chat can switch engine in place, while a sub-chat with
  history confirms and creates a new sub-chat with history attached. The new
  Engine control must preserve that distinction for all four runtimes.
- **Reuse, don't rewrite, the Claude/Codex internals.** The model list, thinking
  submenus, Codex account-source control, compatibility resolution, model-info
  panels, and Ollama path are preserved — relocated into the Model control rather
  than reimplemented — so Claude/Codex behavior is byte-for-byte preserved while
  Kun/Qwen join the same component shape.
- **Secret boundary unchanged.** The Model control passes only source/profile ids;
  no plaintext provider secret enters the renderer (Qwen hint: "do not send
  provider secrets to the renderer").

## Risks / Trade-offs

- **Claude/Codex UX regression.** → Preserve internals by relocation, not rewrite;
  acceptance asserts model/thinking/account-source/profile/Ollama behavior
  unchanged on both surfaces; keep the existing provider-routing-ux Codex
  requirements green.
- **Switch-flow generalization breaks model-pref inheritance for new runtimes.** →
  Make per-runtime inheritance explicit (claude/codex/qwen/kun), with the
  no-profile case handled; test a switch into each runtime starts a valid sub-chat.
- **Two inline surfaces drift (new-chat vs active-chat).** → Both consume the same
  Engine + Model components; a guard/test asserts parity between the two surfaces.
- **Qwen overclaim.** → Qwen Model state is runtime-managed/setup, gated on its
  `degraded` manifest; a test asserts no provider-profile rows are shown for Qwen.
- **Setup-required runtime accidentally starts work.** → Setup-required or
  unavailable engines are non-runnable and tests assert they do not start runs,
  change active sub-chat runtime, or create sub-chats.
- **Active-chat model state leaks globally.** → Active-chat writes current
  sub-chat atom families first; global `lastSelected*` writes are only defaults.
- **New labels ship English-only.** → Add English and Simplified Chinese i18n
  entries and a dictionary/source guard for Engine/Model/status/setup labels.

## Migration Plan

UI-only, no data migration. Rollback = revert the renderer components; backend
untouched. The Engine + Model components can land behind the existing per-runtime
enablement flags; default runtimes (Claude + Codex) unchanged.

## Open Questions

- Does the Engine control belong inline in the input bar for both surfaces, or
  should active-chat show engine as a read-only chip that opens the switch-confirm
  for non-empty chats? Both satisfy the contract as long as empty sub-chats switch
  in place and non-empty chats confirm before creating a new sub-chat.
