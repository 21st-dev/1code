# Electron manual smoke - 2026-06-25

Change: `add-model-aware-image-gating`

Branch: `codex/add-model-aware-image-gating`

## Setup

- App command:
  - `LOCUS_USER_DATA_DIR=/tmp/locus-image-gating-ui-smoke-20260625055842 ELECTRON_ENABLE_LOGGING=1 bun run dev`
  - For qwen/kun visibility: `LOCUS_ENABLE_QWEN_CODE_RUNTIME=1 LOCUS_ENABLE_KUN_RUNTIME=1`
- User data was isolated from the normal development profile:
  - `/tmp/locus-image-gating-ui-smoke-20260625055842`
- App startup evidence:
  - Main process logged the `LOCUS_USER_DATA_DIR` override.
  - Main process logged local mode.
  - SQLite initialized at `/tmp/locus-image-gating-ui-smoke-20260625055842/data/agents.db`.
- Image fixture:
  - `/tmp/locus-image-gating-smoke.png`
  - 1x1 PNG, 68 bytes.

## Observed

- Claude custom Provider Profile with `capabilities.vision` unset:
  - Real Electron UI selected `Smoke Claude Text Only - text-only-smoke-model`.
  - Image attachment staged successfully.
  - UI showed `当前模型不能处理图片附件。请为这个提供方配置启用视觉能力，或切换到支持图片的模型。`
  - Send button was disabled before and after typing text.

- Claude custom Provider Profile with `capabilities.vision: true`:
  - Real Electron UI selected `Smoke Claude Vision - vision-smoke-model`.
  - Same staged image remained available after switching profile.
  - UI showed `图片会保持本地，发送时才交给 Smoke Claude Vision - vision-smoke-model 处理。`
  - Send button became enabled.
  - Clicking send created a `claude-code` job and entered the runtime adapter path.
  - The run ended with `server_error` / `desktop_chat_canceled` because the smoke profile used `http://127.0.0.1:65535`; it was not blocked by image gating.

- First-party Codex UI path:
  - Real Electron UI selected `OpenAI Codex` with `GPT-5.5`.
  - Image attachment staged successfully.
  - UI showed `图片会保持本地，发送时才交给 GPT-5.5 处理。`
  - Send button was enabled.

- qwen/kun runtime reason:
  - With experimental env flags enabled, the real engine menu exposed `Qwen Code` and `Kun` as setup-required when CLIs were not installed.
  - To observe the selected-runtime UI state without pretending the CLIs were installed, temporary quick chats were inserted into the isolated DB with product-format message metadata:
    - `metadata.provider: "qwen-code"`
    - `metadata.provider: "kun"`
  - Real Electron UI rendered those chats as `Qwen Code / Qwen Code` and `Kun / Kun`.
  - Attaching the image in each chat showed `当前运行时不能处理图片附件。`
  - Send button was disabled for both qwen-code and kun.

## Not Fully Proven

- The Claude text-only Provider Profile main-process preflight was not exercised from the UI because the renderer correctly disabled send.
- No real external Claude or Codex vision request succeeded; the vision-profile smoke used a fake local endpoint and only proved the UI/provider path was not image-gated.
- Offline Ollama was not smoke-tested because this machine had no `ollama` CLI and no service on `127.0.0.1:11434`.
- The qwen/kun selected-runtime notice was DB-seeded UI evidence, not a full user-select flow, because the real menu disabled both entries until their CLIs are configured.
