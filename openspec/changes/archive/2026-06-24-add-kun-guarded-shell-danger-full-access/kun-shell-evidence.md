# Kun guarded shell evidence

Date: 2026-06-25

## Automated evidence

- `bun test --isolate tests/kun-cli-status.test.ts tests/kun-serve-launcher.test.ts tests/kun-http-sse-transport.test.ts tests/kun-http-sse-adapter.test.ts tests/agent-runtime-permission-policy.test.ts tests/agent-runtime-registry.test.ts tests/agent-guard-runtime-pipeline.test.ts tests/agent-runtime-capabilities.test.ts`
  - Passed 58 tests.
  - Covered shell-approved executable hash persistence, re-hash mismatch, reset, selected sandbox launch/handshake verification, `danger-full-access` transport body propagation, Kun command/file envelope normalization, canonical `agent-guard/decision.ts` decisions, sensitive-path denial, out-of-scope scope-expansion guard event, missing guarded contract denial, observed-behavior fail-closed, and manifest honesty source guards.
- `openspec validate add-kun-guarded-shell-danger-full-access --strict --no-interactive`
  - Passed.
- `openspec validate --all --strict --no-interactive`
  - Passed 56 items.
- `bun run check`
  - Passed lint, architecture guard, TypeScript, and 1227 tests.

## Reference Kun build

- Resolved executable:
  `/Users/ethan/Documents/GitHub/DeepSeek-GUI/kun/dist/cli/serve-entry.js`.
- SHA-256 approved for shell:
  `4f31d68a99a1c42038fc2a8b8abb1b299d9c7a1d3810520fa37d145ee8cd7ee1`.
- Verified Kun tool source showed side-effecting tools request approval:
  `bash` uses policy `on-request` and `toolKind: command_execution`; file
  write/edit tools use policy `on-request` and `toolKind: file_change`.
  The only `auto` side-effecting tool observed in source is plan-scoped
  `create_plan`, which keeps `planMode` degraded.

## Live guarded-shell smoke

- Allow path:
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/34-shell-allow-subscribe.json`.
  A Kun `bash` approval for `printf 'ALLOW_OK' > shell-allow.txt` surfaced
  through the shared approval path, was allowed, and wrote `ALLOW_OK` in the
  guarded workspace. Runtime events included `approval_requested`,
  `approval_resolved` with status `allowed`, and a `tool_result` exit code `0`.
- Deny path:
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/35-shell-deny-subscribe.json`.
  The same style of `bash` write approval was denied; the target file was absent
  after the run and no shell execution result was produced.
- Sensitive/high-risk path:
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/36-shell-sensitive-deny-subscribe.json`.
  `cat .env` was denied by the canonical guard owner as high-risk or ambiguous
  shell, without surfacing a user allow prompt. Runtime guard events used
  `toolName: Bash`, `toolKind: command_execution`, and `guardOwner: true`.
- Degraded path:
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/37-shell-degraded-subscribe.json`.
  After resetting the blessed hash, Kun status reported shell unapproved and the
  run emitted `kun-shell-unapproved`; the gateway tool list omitted `bash`, the
  attempted shell operation was sandbox-blocked, and the target file was absent.
- Cancel path:
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/40-shell-cancel-final-subscribe.json`.
  A `sleep 43` command allowed by the guard was canceled mid-run. The job ended
  with status `canceled`, error code `desktop_chat_canceled`, and message
  `Desktop Kun chat stream was canceled.` Process inspection after cancellation
  found no live `sleep 43` or Kun serve process.

## Bug found during smoke

- The first cancel smoke exposed an orphan descendant process from the Kun serve
  process tree. `src/main/lib/kun/kun-serve-launcher.ts` now launches Kun in a
  detached process group on non-Windows platforms and closes descendant process
  groups before returning. `tests/kun-serve-launcher.test.ts` covers detached
  descendant cleanup with a real grandchild `sleep` process.
- The same pass fixed the desktop job label so Kun failures/cancellations report
  `Desktop Kun ...` instead of falling through to Qwen wording.

## Capability state

- `hardToolGuard`: supported for hash-approved guarded Kun runs through the
  canonical guard owner.
- Shell / Kun `command_execution`: supported only when the current executable
  hash matches the user-approved shell hash and the run has a guarded scope.
- No bless or hash mismatch remains a current-run degraded state: Kun falls back
  to file-only `workspace-write` and shell is unavailable.
- `planMode`: remains degraded because Kun `create_plan` is native `auto` and
  bypasses Locus approval.

## Final closeout verification

- Targeted regression suite:
  `bun test tests/kun-serve-launcher.test.ts tests/desktop-agent-jobs.test.ts tests/agent-runtime-capabilities.test.ts tests/agent-runtime-registry.test.ts tests/kun-http-sse-adapter.test.ts tests/agent-guard-runtime-pipeline.test.ts tests/kun-provider-config.test.ts tests/provider-gateway-scope.test.ts tests/provider-routing-ux.test.ts`
  - 70 pass, 0 fail.
- `bun run check`
  - Passed lint, architecture guard, TypeScript, and 1242 tests.
- `openspec validate add-kun-guarded-shell-danger-full-access --strict --no-interactive`
  - Passed before archive.
- `openspec validate --all --strict --no-interactive`
  - Passed before archive with 56 items; passed after archive with 54 items.
