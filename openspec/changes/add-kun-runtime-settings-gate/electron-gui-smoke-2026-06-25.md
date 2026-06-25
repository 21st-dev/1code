# Real Electron GUI Smoke: Kun Settings Gate + Onboarding Qwen Truth

Date: 2026-06-25

Branch: `codex/add-kun-runtime-settings-gate`

Build under test: `50f9ca92 Fix onboarding Qwen setup truth`

## Commands

```sh
bun run build
```

```sh
SMOKE_ROOT=/private/tmp/locus-kun-onboarding-qwen-smoke-20260625231613
LOCUS_USER_DATA_DIR="$SMOKE_ROOT/user-data" \
LOCUS_ENABLE_QWEN_CODE_RUNTIME=1 \
ELECTRON_ENABLE_LOGGING=1 \
node_modules/.bin/electron --remote-debugging-port=9337 .
```

Playwright connected to the real Electron process over CDP:

```js
const { chromium } = require("playwright")
await chromium.connectOverCDP("http://127.0.0.1:9337")
```

## Evidence Paths

Screenshots were written to:

```text
/private/tmp/locus-kun-onboarding-qwen-smoke-20260625231613/evidence/
```

Key screenshots:

- `01-onboarding-initial.png`
- `03-onboarding-qwen-guidance.png`
- `06-settings-models-kun-default-off.png`
- `08-settings-kun-on.png`
- `09-settings-kun-off-after-toggle.png`

Final persisted feature settings in the isolated profile:

```json
{
  "kunRuntimeEnabled": false
}
```

## Assertions

- Onboarding initial screen rendered in Chinese: `开始设置`, `AI 提供方`, `项目`,
  and `开始快速对话`.
- `LOCUS_ENABLE_QWEN_CODE_RUNTIME=1` surfaced Qwen in onboarding, but Qwen showed
  setup-needed state (`需安装 CLI`) rather than ready.
- Qwen onboarding panel showed Chinese setup guidance:
  - `Qwen Code 由运行时托管`
  - `需要安装 / 设置 Qwen Code CLI`
  - `运行 qwen，在 CLI 内用 /auth 登录`
  - `重新检测`
- Qwen onboarding did not render the raw English DTO/status strings:
  - `Run qwen, then sign in with /auth inside the CLI`
  - `Run qwen, then use /auth inside the Qwen Code CLI.`
  - `Qwen Code CLI setup required`
  - `Qwen Code CLI was not found on PATH.`
- Onboarding completion remained driven by usable Claude/Codex paths only. Qwen
  was not counted as a completion gate.
- Settings > Models default state showed Qwen Code CLI setup guidance but only
  the `启用 Kun 运行时` switch for Kun. `Kun CLI`, `托管安装`, and `受保护命令执行`
  were hidden while the gate was off.
- Toggling `启用 Kun 运行时` on immediately showed `Kun CLI`, `托管安装`,
  `受保护命令执行`, `可执行文件路径覆盖`, `配置文件路径覆盖`, and the provider-profile
  target runtime `Kun`.
- Toggling the switch off immediately hid the Kun sections and removed the new
  provider-profile target runtime `Kun`, while preserving the feature settings file
  with `kunRuntimeEnabled: false`.

## Non-blocking Observation

The Electron console emitted repeated tooltip controlled/uncontrolled warnings
while opening Settings. They did not affect the runtime gate, onboarding, or Qwen
assertions.
