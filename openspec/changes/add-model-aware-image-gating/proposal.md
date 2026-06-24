# Change: Model-aware, fail-closed image attachment gating

## Why
Image attachment gating (`getChatImageAttachmentCapability`) decides support only from the
runtime `provider` (`claude-code` / `codex` / `qwen-code` / `kun`) plus an offline flag. It does
**not** consult the selected model source's vision capability. Provider Profiles already expose a
renderer-safe `vision` capability (`src/shared/provider-profile-types.ts:39`), and first-party
Claude/Codex sources have runtime-known image support, but the gate does not model that distinction.

As a result, when a user points the `claude-code` runtime at a text-only third-party model through a
custom provider profile (e.g. DeepSeek via an Anthropic-compatible base URL), the gate reports
`supportsImages: true`. The renderer persists only attachment metadata/local refs, but the main
process later resolves the image bytes and may forward them to a text-only endpoint. That endpoint
then either errors or - worse - **silently drops the image** and answers confidently about content it
never saw. This already contradicts the existing `Provider Image Capability` requirement in
`specs/agent-chat-attachments/spec.md`, which states attachments must be validated against the
selected provider **and model** capabilities.

This change closes that gap (phase 1 only). It does not add OCR, vision-handoff, or any image
transformation — those are deferred to later phases. Phase 1 is source/profile-aware, not true
per-model capability discovery: it closes the dominant custom Provider Profile / unknown-vision
silent-drop path, but it does not prove that every first-party model override or every model inside a
mixed vision profile can process images.

## What Changes
- Make image-capability resolution the conjunction of two dimensions: **runtime transport can
  deliver images** AND **resolved target model supports vision**.
- Treat unknown/unset `vision` on custom Provider Profile sources as **unsupported** - fail closed.
  Do not apply that default to first-party `claude-oauth`, `chatgpt`, or `openai-api-key` sources;
  those sources must resolve to explicit runtime-default vision support.
- Thread the normalized/effective selected model source and profile metadata into the two renderer
  callers so the advisory gate sees the same model-vision state as the active run. Raw Claude sources
  such as `auto` and `custom-provider` must be normalized before image capability lookup.
- Enforce the same rule authoritatively in the **main process** as attachment preflight before image
  bytes, provider gateways, provider tokens, or adapter work are resolved, so a bypassed/queued/resent
  renderer cannot leak an image to a text-only model.
- Make the block explanation name the actual cause (runtime/transport vs offline vs text-only
  model) instead of always showing the offline message. **BREAKING**: none — user-visible copy and
  internal gate signature change only.

## Impact
- Affected specs: `agent-chat-attachments` (MODIFIED `Provider Image Capability`, ADDED main-process
  enforcement). References `agent-provider-profiles` (`vision` capability is the source of truth;
  no change there) and first-party Claude/Codex runtime defaults.
- Affected code:
  - `src/shared/chat-attachment-capabilities.ts` — shared pure gate becomes model-aware and returns
    explicit block reasons
  - `src/renderer/features/agents/main/chat-input-area.tsx` — resolve normalized/effective active
    model-source vision and pass it into the advisory gate
  - `src/renderer/features/agents/main/new-chat-form.tsx` — resolve normalized/effective active
    model-source vision and pass it into the advisory gate
  - `src/main/lib/chat-attachments.ts` — `prepareChatImageAttachmentsForDesktopRun` receives the
    already-resolved capability result and blocks before resolving bytes
  - `src/main/lib/claude/agent-sdk-desktop-run-inputs.ts` / Claude startup path — resolve model-source
    vision from first-party defaults or non-secret Provider Profile metadata before attachment
    preparation
  - `src/main/lib/trpc/routers/codex.ts` — resolve provider-profile metadata before attachment
    preparation; only resolve gateway/token/runtime config after the image capability gate passes
  - i18n strings — distinct block reasons (also fixes Qwen/Kun showing the offline message)

## Non-Goals (deferred)
- Local OCR fallback (PP-OCRv6 or any engine).
- Vision handoff / image captioning via a multimodal model.
- Source-context substitution (DOM / a11y tree / logs / snapshot) for screenshots.
- Any image compression or format transformation.
- Eliminating every possible silent image drop for mixed-vision profiles or first-party per-model
  differences. That requires later per-model capability discovery or explicit handoff.
