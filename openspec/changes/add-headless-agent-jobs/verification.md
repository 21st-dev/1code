# Verification Record

Date: 2026-06-03

## Current Status

The first four requested steps are implemented and verified locally on macOS:

- Phase 0: OpenSpec boundary and non-goals clarified.
- Phase 1: Durable job database, state machine, heartbeat, cancellation, retry, and interruption handling implemented and tested.
- Phase 2: Headless CLI dispatcher and macOS/Windows shims implemented; macOS smoke completed.
- Phase 3: Claude Code and Codex basic headless adapters implemented through the shared job platform.
- Phase 4: CLI/headless jobs are visible and actionable in Agent Workbench.

This change is **not release-ready or archive-ready yet** because the OpenSpec requires both macOS and Windows first-slice support, and Windows has not had a real host smoke.

## Verified Locally On macOS

Commands run after the final implementation commits:

```text
bun test tests
358 pass, 0 fail, 1728 expect() calls

bun run ts:check
pass

openspec validate add-headless-agent-jobs --strict --no-interactive
pass

git diff --check
pass

bun run build
pass
```

Build printed the existing Browserslist/caniuse-lite freshness warning. That warning did not fail the build.

## Real Headless Smoke

Codex real headless run:

```text
runtime: codex
jobId: mpwuoh99pavpo25y
status: succeeded
exitCode: 0
events: 30
stdout: valid JSON
stdin warning in job JSON: false
```

Claude Code real headless run reached the real runtime boundary, but this machine is not logged in to Claude Code:

```text
runtime: claude-code
jobId: mpwuoh99x4nzeklf
status: failed
errorCode: runtime_auth_required
exitCode: 1
events: 7
stdout: valid JSON
```

This verifies auth-failure classification and structured CLI output. It does not prove a successful Claude Code run on an authenticated machine.

## Desktop UI Smoke

A fake CLI-created job was written through Electron headless mode, then a real Electron desktop window was opened with a temporary user data directory. The smoke verified:

- Agent Workbench opens.
- CLI job is visible.
- Job status and filter counts match.
- Job logs dialog opens and shows persisted events.
- No obvious layout overlap or button crowding was visible in the checked desktop viewport.

Final artifact directory:

```text
/Users/ethan/Documents/Locus-smoke-artifacts/headless-phase-0-4-2026-06-03/
```

Artifacts:

```text
workbench-cli-jobs.mov
workbench-cli-jobs.png
workbench-job-logs-dialog.png
ui-smoke-summary.json
```

The final UI smoke summary recorded:

```text
filterShowsAllOne: true
finalTextHasCliJobs: true
finalTextHasPrompt: true
videoBytes: 14032690
```

## Windows Evidence Still Required

Implemented and test-covered:

- `resources/cli/locus.cmd` synchronously invokes the app executable for headless `run` and `jobs`.
- Source tests cover Windows shim behavior and confirm it does not use detached `start` for headless commands.
- Headless CLI parsing and dispatcher tests cover command behavior independent of platform shell.

Not yet verified:

- Real Windows host or CI smoke for `locus run`.
- Real Windows host or CI smoke for `locus jobs list`.
- Real Windows host or CI smoke for `locus jobs logs`.
- Windows stdout/stderr/exit-code behavior from the actual `.cmd` shim and packaged executable.
- Windows desktop visibility for a CLI-created job.

Until this Windows evidence exists, the accurate status is:

```text
macOS local implementation + smoke complete
headless/job/desktop visibility implemented and verified locally
Windows shim implemented and source-tested
Windows real smoke pending
ordinary desktop chat migration deferred
daemon, schedule, and locus acp deferred
```

## Deferred By Design

These are not part of the current first-slice completion:

- Ordinary desktop chat as `source=desktop` jobs.
- Local daemon queue.
- Local schedules.
- `locus acp`.
- Full Codex behavior parity with Claude Code.
