## Context
Image gating today is keyed off the runtime engine only. The renderer computes
`getChatImageAttachmentCapability({ provider, offlineModeEnabled })` and uses it to disable the send
button and short-circuit submission. The main process validates size/type/count in
`resolveChatImageAttachments` but has no notion of model modality. Provider Profiles already expose
renderer-safe `capabilities.vision`, and first-party Claude/Codex sources have runtime-known image
support, so the missing piece is target-source resolution plus shared gating, not a new schema field.

This is cross-cutting (renderer + main), it is a fail-closed security decision, and it sets up later
phases (OCR / vision-handoff). A short design note is warranted.

## Goals / Non-Goals
- Goals:
  - A single capability rule used by renderer (advisory UX) and main (authoritative enforcement).
  - Fail closed when a Provider Profile/custom target has unknown or unset vision.
  - Preserve first-party Claude/Codex image sends by resolving those sources to explicit runtime
    defaults instead of treating missing Provider Profile metadata as unknown.
  - Accurate, cause-specific block messaging.
- Non-Goals:
  - OCR, vision-handoff, source substitution, compression (later phases).
  - Changing the `vision` field shape or provider-profile editing UX.
  - Per-model capability discovery from upstream APIs; phase 1 is source/profile-aware, with
    Provider Profile `vision` applying to that profile's selected/default model.
  - Eliminating silent drops caused by a first-party or `vision: true` profile selecting an individual
    text-only model. That needs a later per-model capability source.

## Decisions
- **Decision: capability = transportSupportsImages AND targetModelSupportsVision.** Two independent
  reasons to block; both must pass. Runtime transport handles `qwen-code` / `kun` / offline; model
  vision handles text-only models behind any runtime (including `claude-code` custom providers).
- **Decision: renderer/transport owns Claude source normalization for desktop UI requests.** The
  renderer already derives a normalized/effective Claude source and the IPC transport normalizes raw
  `auto` / `custom-provider` before dispatch. Image capability lookup must consume that same
  normalized/effective run identity, not raw `selectedClaudeModelSource`. `auto` normalizes through
  the existing run-admission logic (normally `claude-oauth`, or a Provider Profile diversion when
  OAuth is unusable). `custom-provider` normalizes through `normalizeClaudeModelSourceForRun(...)` to
  the legacy/usable `provider-profile:*` source before Provider Profile vision is read. The main
  process must not import `src/renderer/...` or reimplement that fallback policy. Instead, it trusts
  the request's already-normalized target identity (`modelSource` plus `providerProfileId` when
  present) and independently verifies capability from main-process Provider Profile metadata. In
  short: trust target identity, self-verify capability. If a future non-renderer entrypoint needs to
  accept raw Claude selectors, first move the normalization helper into `src/shared/`; do not create a
  second main-process copy.
- **Decision: resolve model vision before calling the shared gate.** Callers must resolve the active
  normalized target identity into `"supported" | "unsupported" | "unknown"` before invoking
  `getChatImageAttachmentCapability(...)`.
  - `claude-oauth` resolves to `supported` when that first-party path is the active source.
  - Claude `auto` is not a final capability source; resolve it first, then evaluate the resolved
    first-party or Provider Profile source.
  - Claude `custom-provider` is not a final capability source; resolve it first, then evaluate the
    normalized Provider Profile source or blocker.
  - Codex `chatgpt` and `openai-api-key` resolve to `supported`.
  - Provider Profile sources resolve from non-secret `ProviderProfileMetadata.capabilities.vision`:
    `true` = `supported`, `false` = `unsupported`, missing = `unknown`.
  - If a normalized Provider Profile identity is present but `getProviderProfileMetadata(id)` returns
    `null` (for example a stale/deleted profile id), resolve model vision to `unknown`; do not fall
    back to first-party support.
  - Offline Ollama remains blocked by the offline reason, regardless of model vision.
  - `qwen-code` and `kun` remain blocked by runtime transport in this phase.
  - If run admission cannot produce a normalized Claude target (for example
    `provider-profile-required` when OAuth is unusable and no Provider Profile can run), that is an
    upstream run-admission blocker, not an image-gating decision.
- **Decision: unknown Provider Profile vision ⇒ unsupported (fail closed).** Custom third-party
  profiles usually have not declared `vision`, and stale Provider Profile ids may resolve to no
  metadata row at all. Defaulting to "supported" is what causes the silent-drop bug, so Provider
  Profile `unknown` is blocked. First-party Claude/Codex sources are not Provider Profiles and must
  not inherit that unknown default.
- **Decision: main process is authoritative; renderer is advisory.** Renderer disables the send
  button and shows the reason early, but the main-process preflight re-checks model vision before
  resolving image bytes, so a bypassed/queued/resent message cannot leak an image.
  - Main-process capability resolution must use the request's normalized `modelSource` /
    `providerProfileId` identity and non-secret metadata (`getProviderProfileMetadata(...)` / list
    metadata), not renderer-supplied vision booleans and not `getProviderProfileRuntimeConfig(...)`,
    because image capability checks do not require decrypting tokens or resolving gateway config.
  - Claude desktop requests must already carry normalized `modelSource` / Provider Profile identity
    before attachment preparation. Main verifies that identity's capability; it does not redo
    renderer-only normalization.
  - Codex must resolve provider-profile metadata before `prepareChatImageAttachmentsForDesktopRun(...)`;
    gateway endpoint and token resolution stay after the image capability gate passes.
  - `prepareChatImageAttachmentsForDesktopRun(...)` enforces the already-resolved capability and keeps
    byte resolution, size/type/count validation, and preflight blocker creation in one attachment
    readiness path.
- **Decision: omitted capability at the attachment chokepoint fails closed.**
  `prepareChatImageAttachmentsForDesktopRun(...)` is the shared image attachment readiness chokepoint.
  When image attachments are present, an omitted capability input is treated as `unknown` and blocked
  with `model-no-vision`. Every existing caller (Claude, Codex) and any future headless/programmatic
  image-bearing caller must pass an explicit resolved capability; omission must not silently restore
  the old allow-by-default behavior.
- **Decision: headless/local-job must not be a parallel policy path.** Current Local Job API v1 stores
  a text-only `prompt.text` and the Codex app-server headless shim builds desktop requests with
  `attachments: []`. This change should verify that no existing Local Job API/headless route accepts
  image attachments. If a current or future programmatic/headless path does accept images, it must
  route through the same normalized target identity plus capability resolver and
  `prepareChatImageAttachmentsForDesktopRun(...)` fail-closed behavior before runtime startup. If that
  path accepts raw Claude selectors, the normalization helper must be shared first.
- **Decision: ownership boundary.** The pure rule lives in
  `src/shared/chat-attachment-capabilities.ts`. Main-process target-source resolution is part of
  desktop attachment preflight/readiness and consumes renderer-safe provider metadata before runtime
  startup. Runtime routes may wire inputs and emit blockers, but they must not define separate Claude
  and Codex image capability tables.
- **Decision: block reason is enumerated.** Reasons: `runtime-transport`, `offline`,
  `model-no-vision`. Renderer maps each to its own copy, fixing the current behavior where Qwen/Kun
  show the offline message.

## Risks / Trade-offs
- Risk: a vision-capable custom model whose profile didn't set `vision` is now blocked (false
  negative) -> Mitigation: clear copy telling the user to enable the profile's vision capability; the
  block is recoverable (toggle vision, re-send) and attachments are preserved.
- Risk: treating all missing profile metadata as unknown could regress first-party Claude/Codex ->
  Mitigation: source resolution explicitly maps `claude-oauth`, `chatgpt`, and `openai-api-key` to
  supported before the shared gate.
- Risk: moving Codex profile metadata earlier could accidentally pull gateway/token resolution earlier
  too -> Mitigation: use `getProviderProfileMetadata(...)` for the gate and assert tests that
  `getProviderGatewayEndpoint(...)` / token resolution are not called when the gate blocks.

## Migration Plan
- No data migration. Behavior change only: text-only / unknown-vision paths flip from "allow (then
  silently drop)" to "block with explanation." Existing persisted messages are unaffected.
- Rollback: revert the gate signature and caller args; no persisted state depends on this.

## Open Questions
- Should the renderer offer a one-click "enable vision for this profile" action in the block, or just
  point to the profile settings? (Default: point to settings for phase 1.)
