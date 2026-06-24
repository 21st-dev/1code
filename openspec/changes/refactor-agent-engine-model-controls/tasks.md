# Tasks: Engine + Model chat composition controls

> Approval gate: do not start until this proposal is approved. UI-only, no backend
> change. Acceptance hard line: Claude/Codex model/thinking/account-source/
> provider-profile/Ollama behavior must NOT regress on either surface.

## 0. Pre-flight
- [x] 0.1 Branch off clean `main`.
- [x] 0.2 Inventory the three-way second control on both surfaces
      (`new-chat-form.tsx`, `chat-input-area.tsx`) and the runtime-switch flow
      (`active-chat.tsx` `handleContinueWithProvider`/`handleInputProviderChange`)
      so nothing is missed.

## 1. Engine control (sole runtime switch)
- [x] 1.1 Build an Engine control listing enabled runtimes (claude-code, codex,
      qwen-code, kun) with manifest/setup-derived status (experimental,
      unavailable, setup-required); reads the existing capability manifest, no
      manifest data change.
- [x] 1.2 Make it the ONLY runtime-switch entry; remove runtime switching from the
      model selector.
- [x] 1.3 Move the `CrossProviderConfirmDialog` from `agent-model-selector.tsx`
      onto the Engine control (switch confirm now owned here).
- [x] 1.4 Enforce setup-required/unavailable semantics: those engines are
      non-runnable, do not change the selected runtime, do not start runs, and do
      not create sub-chats; they may be disabled or route to Settings setup.
- [x] 1.5 Tests: selecting a ready engine changes the runtime; status renders from
      the manifest/setup status; setup-required/unavailable engines are blocked
      or setup-only; the model selector no longer changes the runtime.

## 2. Runtime-neutral Model control
- [x] 2.1 Build one Model component parameterized by the selected Engine; render
      that runtime's sources/models/provider-profiles/BYO with identical shape
      across runtimes.
- [x] 2.2 Show contextual options (Codex thinking + account source, Claude
      thinking) ONLY when the selected engine/model supports them.
- [x] 2.3 Back the selected value per-engine via the existing
      `lastSelected{Claude,Codex,Kun}ModelSource` / `lastSelectedModelId` atoms;
      switching Engine swaps the Model control's value.
- [x] 2.4 For active-chat, read/write the current sub-chat atom families
      (`subChatClaudeModelSourceAtomFamily`, `subChatCodexModelSourceAtomFamily`,
      `subChatCodexModelIdAtomFamily`, `subChatCodexThinkingAtomFamily`,
      `subChatKunModelSourceAtomFamily`, `subChatModelIdAtomFamily`) before
      updating `lastSelected*` defaults for future chats.
- [x] 2.5 Preserve Claude/Codex internals by RELOCATION not rewrite: model list,
      thinking submenus, Codex account-source control + compatibility resolution,
      model-info panels, Ollama path.
- [x] 2.6 The Model control never changes the runtime (guard/test).

## 3. Runtime-managed + Kun unification
- [x] 3.1 Qwen renders a runtime-managed / setup state in the Model control (no
      provider-profile rows; `providerProfiles` is `degraded`); no secret reaches
      the renderer.
- [x] 3.2 Replace `KunProviderProfileSelector`'s bespoke role with the shared
      Model control (Kun profiles + BYO config through the same component); remove
      the Qwen static label.

## 4. Generalize the engine-switch-starts-new-chat flow (the hard part)
- [x] 4.1 Widen `handleContinueWithProvider` / `handleInputProviderChange` from
      `"claude-code" | "codex"` to all four runtimes.
- [x] 4.2 Preserve the empty active sub-chat fast path: switching Engine in an
      empty sub-chat updates that sub-chat in place, without history attachment or
      creating a new tab.
- [x] 4.3 Generalize per-runtime model-preference inheritance in the new-sub-chat
      flow, including the no-provider-profile case (Qwen) and Kun's profile/BYO
      source — a switch into any runtime starts a coherent sub-chat.
- [x] 4.4 Tests: switching into each runtime (claude/codex/qwen/kun) from an empty
      active sub-chat updates in place; switching from a non-empty active chat
      confirms, creates a new sub-chat with history attached, and sets a valid
      inherited source; the Qwen no-profile case does not fail.

## 5. Both surfaces use the same controls
- [x] 5.1 Wire Engine + Model into both `new-chat-form.tsx` and
      `chat-input-area.tsx`.
- [x] 5.2 Guard/test: both surfaces use the same components with consistent
      behavior (no drift).
- [x] 5.3 Add English and Simplified Chinese i18n entries for Engine, Model,
      runtime statuses, and setup actions; tests/source guards prevent hardcoded
      English labels for these controls.

## 6. Acceptance (zero regression hard line)
- [x] 6.1 Claude: model selection, thinking toggle, Ollama/offline path, provider
      profile selection — unchanged on both surfaces.
- [x] 6.2 Codex: model selection, thinking level, ChatGPT/API-key account source,
      source/model compatibility, provider profile selection — unchanged.
- [x] 6.3 Existing provider-routing-ux Codex requirements (account source
      selection, source/model compatibility) stay green.
- [x] 6.4 Kun: works through the shared Model control, no bespoke selector; Qwen:
      runtime-managed state, no fabricated provider-profile rows.
- [x] 6.5 Setup-required/unavailable Qwen/Kun cannot start runs or create
      sub-chats; setup actions route to Settings.
- [x] 6.6 Engine switch behavior works for all four runtimes: empty active
      sub-chat switches in place; non-empty active chat confirms and creates a new
      sub-chat with history.

## 7. Validate
- [x] 7.1 `openspec validate refactor-agent-engine-model-controls --strict --no-interactive`.
- [x] 7.2 `bun run check` green; renderer handles only safe source/profile ids
      (no plaintext provider secret).
