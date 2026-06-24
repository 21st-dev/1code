# Kun Guarded Shell Evidence

Date: 2026-06-24

## Automated Evidence

- `bun test --isolate tests/kun-cli-status.test.ts tests/kun-serve-launcher.test.ts tests/kun-http-sse-transport.test.ts tests/kun-http-sse-adapter.test.ts tests/agent-runtime-permission-policy.test.ts tests/agent-runtime-registry.test.ts tests/agent-guard-runtime-pipeline.test.ts tests/agent-runtime-capabilities.test.ts`
  - Passed 58 tests.
  - Covered shell-approved executable hash persistence, re-hash mismatch, reset, selected sandbox launch/handshake verification, `danger-full-access` transport body propagation, Kun command/file envelope normalization, canonical `agent-guard/decision.ts` decisions, sensitive-path denial, out-of-scope scope-expansion guard event, missing guarded contract denial, observed-behavior fail-closed, and manifest honesty source guards.
- `openspec validate add-kun-guarded-shell-danger-full-access --strict --no-interactive`
  - Passed.
- `openspec validate --all --strict --no-interactive`
  - Passed 56 items.
- `bun run check`
  - Passed lint, architecture guard, TypeScript, and 1227 tests.

## Capability State

- `hardToolGuard`: remains `degraded`.
- Shell / Kun `command_execution`: implemented behind current-run hash + guarded-scope gates, but not flipped to manifest `supported`.
- `planMode`: remains `degraded` because Kun `create_plan` is native `auto` and bypasses Locus approval.

## Remaining Manual Smoke

- No real Kun `danger-full-access` run was executed in this pass.
- Still required before flipping shell/hardToolGuard to `supported`:
  - Guarded shell smoke where allow executes, deny blocks, and cancel leaves no process.
  - Sensitive-path/high-risk shell smoke against a real Kun build.
  - Degraded-state smoke after removing or changing the blessed hash.
