## 1. OpenSpec
- [x] 1.1 Add and validate the runtime plugin write-actions proposal, design, and spec delta.

## 2. Main Process API
- [ ] 2.1 Add shared action, target, preview, result, and scope types.
- [ ] 2.2 Add a main-process allowlist that maps typed action ids to exact Codex/Claude argv.
- [ ] 2.3 Add preview and confirmed execution helpers with redaction, timeout, and minimal environment handling.
- [ ] 2.4 Add tRPC preview/execute mutations and refresh cache state after successful writes.

## 3. UI
- [ ] 3.1 Add marketplace add/update/remove controls in the runtime marketplace view.
- [ ] 3.2 Add plugin install/update/enable/disable/uninstall controls where each runtime supports them.
- [ ] 3.3 Add command preview, exact confirmation, destructive action copy, unsupported Codex enable/disable copy, and Claude `/reload-plugins` guidance.
- [ ] 3.4 Keep Locus Store and runtime marketplace actions visually distinct.

## 4. Verification
- [ ] 4.1 Add unit tests for command mapping, unsupported action blocking, confirmation tokens, redaction, and injected runner execution.
- [ ] 4.2 Add UI source-guard tests for runtime write controls and no cross-runtime conversion.
- [ ] 4.3 Run targeted tests after each implementation checkpoint and commit each checkpoint.
- [ ] 4.4 Run `bun run test`, `bun run ts:check`, `openspec validate add-runtime-plugin-write-actions --strict --no-interactive`, and `git diff --check`.
- [ ] 4.5 Run a local desktop UI smoke for Settings > Plugins runtime marketplace actions.
- [ ] 4.6 Record the smoke test and save the video evidence path.
- [ ] 4.7 Do a UI/UX pass and fix any problems found during the smoke.
