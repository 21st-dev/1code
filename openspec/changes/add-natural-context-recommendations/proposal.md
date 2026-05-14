# Change: Add natural-language context recommendations

## Why
Users can already select skills and custom agents with `@`, but they need to know the exact skill or agent name first. Natural-language recommendations make reusable skills and agents discoverable while keeping the final selection explicit.

## What Changes
- Add a local recommendation strip near the chat input that suggests relevant skills and custom agents from the user's current prompt text.
- Let users click a recommendation to insert the existing `@[skill:name]` or `@[agent:name]` mention token.
- Keep recommendations read-only and confirmation-based; the app must not silently install, enable, or invoke skills/agents.
- Reuse the existing skill and agent discovery APIs.

## Impact
- Affected specs: `agent-context-recommendations`
- Affected code:
  - `src/renderer/features/agents/main/chat-input-area.tsx`
  - `src/renderer/features/agents/main/new-chat-form.tsx`
  - new renderer recommendation component/hook under `src/renderer/features/agents/`
  - `src/renderer/lib/i18n/dictionaries.ts`
