# Real Electron GUI Smoke: Qwen Runtime Settings Gate

Date: 2026-06-26

Branch: `codex/add-qwen-runtime-settings-gate`

Functional build under test: `042b5a51 Add Qwen runtime toggle to settings`
plus validation-only follow-up `d94b970a test: finish Qwen runtime gate validation`.

## Commands

An isolated profile and fake Qwen binary were created under:

```text
/tmp/locus-qwen-gate-smoke2.U2wdXA
```

The fake Qwen binary returned `qwen 0.18.5-smoke` for `--version`.

Electron dev was started with the isolated profile, fake Qwen on `PATH`, and
safe storage disabled so the smoke did not touch the user's macOS keychain:

```sh
PATH="/tmp/locus-qwen-gate-smoke2.U2wdXA/bin:$PATH" \
HOME="/tmp/locus-qwen-gate-smoke2.U2wdXA/home" \
LOCUS_USER_DATA_DIR="/tmp/locus-qwen-gate-smoke2.U2wdXA/user-data" \
LOCUS_DISABLE_SAFE_STORAGE=1 \
ELECTRON_ENABLE_LOGGING=1 \
bun run dev -- --remote-debugging-port=9224
```

The main-process log confirmed:

```text
[App] Using userData path override from LOCUS_USER_DATA_DIR: /tmp/locus-qwen-gate-smoke2.U2wdXA/user-data
[Main] Local mode: not authenticated, loading app
DevTools listening on ws://127.0.0.1:9224/devtools/browser/...
```

CDP was used only to inspect text, dispatch pointer events, and capture the real
Electron renderer state.

## Evidence Paths

Screenshots were written to:

```text
/tmp/locus-qwen-smoke2-*.png
```

Key screenshots:

- `locus-qwen-smoke2-default.png`
- `locus-qwen-smoke2-qwen-enabled-onboarding.png`
- `locus-qwen-smoke2-qwen-card-selected.png`
- `locus-qwen-smoke2-settings-models-qwen-on.png`
- `locus-qwen-smoke2-settings-models-qwen-off.png`
- `locus-qwen-smoke2-settings-models-qwen-on-again.png`
- `locus-qwen-smoke2-engine-menu-pointer.png`
- `locus-qwen-smoke2-engine-menu-qwen-off.png`

Final persisted feature settings in the isolated profile after toggling Qwen
off again:

```json
{
  "qwenRuntimeEnabled": false,
  "kunRuntimeEnabled": false
}
```

## Assertions

- Default fresh profile rendered onboarding in Chinese and did not show
  `Qwen Code`, even though fake `qwen` was present on `PATH`.
- With `qwenRuntimeEnabled: true` in the isolated runtime settings file,
  onboarding showed the `Qwen Code` card with `实验` and `CLI 设置`.
- Selecting the Qwen card showed localized setup guidance:
  - `Qwen Code 由运行时托管`
  - `已检测到 Qwen Code CLI`
  - `运行 qwen，然后在 Qwen Code CLI 里使用 /auth。`
  - `重新检测`
- Qwen CLI detection did not complete onboarding. The left rail still showed
  `AI 提供方` with `CLI 设置`, and the flow did not advance to the project step.
- To reach Settings after the onboarding assertions, a fake non-Qwen custom
  provider row was inserted into the isolated SQLite DB and the repo step was
  skipped via isolated renderer storage. This was only to open the real Settings
  UI and was not used for the Qwen onboarding-completion assertion.
- Settings > Models showed `Qwen Code CLI`, `CLI 状态`, `已启用`, the fake Qwen
  path, version `qwen 0.18.5-smoke`, and the passive `/auth` setup guidance
  while `启用 Qwen Code 运行时` was checked.
- Toggling `启用 Qwen Code 运行时` off through the real Settings UI changed the
  persisted settings file to `qwenRuntimeEnabled: false` and immediately hid
  `Qwen Code CLI`, `CLI 状态`, and the fake Qwen path.
- Toggling the same switch back on through Settings restored the Qwen CLI setup
  guidance and detected version.
- The engine selector showed `Qwen Code` with `不可用` while Qwen was enabled.
  After toggling Qwen off, the engine menu contained only `Claude Code` and
  `OpenAI Codex`.
- Provider-profile target buttons visible in Settings remained `Claude`,
  `Codex`, `辅助`, and `本地`; no `qwen-code` Provider Profile target was added.

## Non-blocking Observations

- An earlier smoke attempt without `LOCUS_DISABLE_SAFE_STORAGE=1` triggered a
  macOS keychain prompt for `Locus Dev`. That run was discarded for evidence;
  the recorded smoke used isolated safe-storage-disabled startup.
- The app emitted existing Electron dev warnings such as the insecure CSP and
  Browserslist age notices. They did not affect the Qwen gate assertions.
