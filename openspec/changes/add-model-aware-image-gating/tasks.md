## 1. Shared capability rule
- [ ] 1.1 Extend `getChatImageAttachmentCapability` input with normalized model vision state (`"supported" | "unsupported" | "unknown"`) and an enumerated `blockReason` of `"runtime-transport" | "offline" | "model-no-vision"`.
- [ ] 1.2 Implement the rule: runtime transport and offline blockers win first; otherwise `supportsImages = modelVision === "supported"`; `unsupported` and `unknown` both block with `model-no-vision`.
- [ ] 1.3 Unit-test the matrix: claude-code + first-party/runtime-default vision supported, Claude `auto` normalized to the actual run source, Claude `custom-provider` normalized to Provider Profile, claude-code + provider-profile vision true, claude-code + provider-profile vision false, claude-code + provider-profile vision unknown, claude-code + stale/deleted provider-profile id whose metadata lookup returns `null`, claude-code offline, Codex `chatgpt`, Codex `openai-api-key`, Codex provider-profile vision true/false/unknown/null metadata, qwen-code, kun.

## 2. Renderer (advisory UX)
- [ ] 2.1 Add a small renderer-side resolver for the normalized/effective active model source that maps `claude-oauth`, `chatgpt`, and `openai-api-key` to `"supported"`, Provider Profile metadata `capabilities.vision` to `"supported" | "unsupported" | "unknown"`, and leaves qwen/kun blocked by runtime transport.
- [ ] 2.2 In `chat-input-area.tsx`, pass the resolved model vision into the capability call from the same normalized/effective Claude source used for the outgoing `selectedModelSource` (derived from `normalizedClaudeModelSource`), not raw `selectedClaudeModelSource`; include normalization/profile inputs in the memo dependencies so provider/model changes re-evaluate staged attachments.
- [ ] 2.3 In `new-chat-form.tsx`, pass the resolved model vision into the capability call from `effectiveClaudeModelSource`, not raw `selectedClaudeModelSource`; include normalization/profile inputs in the memo dependencies so provider/model changes re-evaluate staged attachments.
- [ ] 2.4 Map each `blockReason` to its own i18n string; stop showing the offline copy for `qwen-code`/`kun`/text-only models. Add the new strings to all locales.
- [ ] 2.5 Confirm the send button + `blockUnsupportedImageSend` use the new reason and that changing provider/model re-evaluates without dropping staged attachments.

## 3. Main process (authoritative, fail-closed)
- [ ] 3.1 Add a main-process target capability resolver that derives model vision from the request's already-normalized target identity (`modelSource` plus `providerProfileId` when present) before attachment byte resolution. Main must not import `src/renderer/...` or duplicate `normalizeClaudeModelSourceForRun(...)`; it trusts the target identity produced by renderer/transport run admission and self-verifies capability from non-secret Provider Profile metadata (`getProviderProfileMetadata` or equivalent), never `getProviderProfileRuntimeConfig`.
- [ ] 3.2 Add the already-resolved capability result/input to `prepareChatImageAttachmentsForDesktopRun` in `src/main/lib/chat-attachments.ts`; when images are present and the capability is blocked, return a preflight blocker with the concrete reason before `resolveChatImageAttachments` reads bytes. If images are present and the caller omits the capability input, treat it as `unknown` and block with `model-no-vision`.
- [ ] 3.3 In the Claude path, require desktop requests to carry the already-normalized `modelSource` / Provider Profile identity before `prepareClaudeAgentSdkDesktopRunInputs` prepares attachments. First-party `claude-oauth` must remain image-capable; a `custom-provider` selection must arrive as its normalized Provider Profile identity; Provider Profile `vision: false` or missing must block. If run admission returns `provider-profile-required`, that blocker remains outside this image-gating spec because no normalized run target exists.
- [ ] 3.4 In `src/main/lib/trpc/routers/codex.ts`, resolve provider-profile metadata before `prepareChatImageAttachmentsForDesktopRun`, but keep `getProviderGatewayEndpoint`, token/runtime config, and provider startup after the image gate passes.
- [ ] 3.5 Ensure queued, resent, regenerated, and initial image-bearing messages hit the same main-process check (no renderer-only or route-specific bypass path).
- [ ] 3.6 Confirm Local Job API/headless has no current image-bearing input path (Local Job API v1 prompt is text-only; Codex app-server headless shim currently sends `attachments: []`). If any current or future headless/programmatic path accepts images, route it through the same normalized target identity + capability gate or fail closed before runtime startup. If that path accepts raw Claude selectors, extract the normalizer to `src/shared/` first.

## 4. Verification
- [ ] 4.1 `bun run --silent ts:check` passes.
- [ ] 4.2 Unit/integration: first-party Claude OAuth and Codex `chatgpt` / `openai-api-key` image sends remain allowed.
- [ ] 4.3 Unit/integration: renderer/transport normalizes Claude `auto` and `custom-provider` before dispatch; main receives the normalized target identity and verifies Provider Profile vision from metadata without importing renderer code or duplicating the normalizer.
- [ ] 4.4 Unit/integration: Provider Profile `vision: true` allows images; `vision: false`, missing `vision`, and `getProviderProfileMetadata(id) === null` block with `model-no-vision`.
- [ ] 4.5 Unit/integration: image-bearing calls to `prepareChatImageAttachmentsForDesktopRun` with omitted capability input fail closed as `model-no-vision`.
- [ ] 4.6 Unit/integration: blocked Provider Profile image sends do not call `getProviderGatewayEndpoint`, do not use `getProviderProfileRuntimeConfig`, and do not resolve image bytes.
- [ ] 4.7 Unit/integration: Codex resolves Provider Profile metadata before image preparation and only resolves gateway/token/runtime config after the gate passes.
- [ ] 4.8 Unit/integration: queued/resent/regenerated/initial image messages hit the same main-process image capability gate.
- [ ] 4.9 Unit/integration or architecture test: Local Job API/headless either has no image-bearing input path or any such path hits the same main-process image capability gate before runtime startup.
- [ ] 4.10 Unit/integration: `provider-profile-required` run-admission blockers happen before image gating and are not converted into model-vision blockers.
- [ ] 4.11 Manual: claude-code custom profile with vision unset -> image send blocked in UI and in main preflight (no provider call); message text-only still sends.
- [ ] 4.12 Manual: real Claude / Codex with vision -> images still send unchanged.
- [ ] 4.13 Manual: qwen-code / kun show the runtime reason (not offline); offline Ollama shows the offline reason.
- [ ] 4.14 `openspec validate add-model-aware-image-gating --strict --no-interactive` passes.
