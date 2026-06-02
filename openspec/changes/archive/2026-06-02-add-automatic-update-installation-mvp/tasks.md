## 1. Spec and release setup
- [x] 1.1 Add OpenSpec deltas for automatic update checks and local-only boundaries.
- [x] 1.2 Add `electron-updater` and GitHub publish config.
- [x] 1.3 Update release documentation to explain signing and version bump requirements.

## 2. Main process
- [x] 2.1 Add an updater singleton with supported-platform detection and userData JSON settings.
- [x] 2.2 Wire startup and focus automatic checks with a cooldown.
- [x] 2.3 Extend `appUpdates` tRPC with state, setting, check, download, and install actions.

## 3. Renderer
- [x] 3.1 Replace the manual About update card with the automatic update MVP UI.
- [x] 3.2 Add English and Chinese copy for update states and actions.

## 4. Verification
- [x] 4.1 Add/update behavioral tests for settings parsing and support detection.
- [x] 4.2 Run OpenSpec validation, tests, typecheck, build, and diff checks.
