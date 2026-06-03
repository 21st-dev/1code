# Verification Record

Date: 2026-06-03

## Current Status

The first four requested steps, Phase 5 desktop-chat job migration, and Phase 6
local daemon queue are implemented and verified locally on macOS:

- Phase 0: OpenSpec boundary and non-goals clarified.
- Phase 1: Durable job database, state machine, heartbeat, cancellation, retry, and interruption handling implemented and tested.
- Phase 2: Headless CLI dispatcher and macOS/Windows shims implemented; macOS smoke completed.
- Phase 3: Claude Code and Codex basic headless adapters implemented through the shared job platform.
- Phase 4: CLI/headless jobs are visible and actionable in Agent Workbench.
- Phase 5: Ordinary desktop chat streams are wrapped as linked `source=desktop`
  jobs without replacing existing chat/sub-chat message, session, and stream
  storage.
- Phase 6: `locus run --daemon` enqueues `source=daemon` jobs, `locus daemon
  run` claims them through the shared runner without a renderer window, stale
  daemon jobs recover to `interrupted`, and Agent Workbench shows daemon jobs
  with a distinct source label.

This change is **not release-ready or archive-ready yet** because the OpenSpec
requires both macOS and Windows support, and Windows has not had a real host
smoke.

## Verified Locally On macOS

Commands run after the Phase 5 implementation and smoke:

```text
bun test tests
371 pass, 0 fail, 1782 expect() calls

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

Commands run after the Phase 6 daemon implementation and smoke:

```text
openspec validate add-headless-agent-jobs --strict --no-interactive
pass

bun run ts:check
pass

bun test tests/agent-job-store.test.ts tests/headless-cli-args.test.ts tests/headless-cli-dispatcher.test.ts tests/headless-daemon.test.ts tests/headless-runtime-adapters.test.ts tests/headless-process-runner.test.ts tests/headless-cli-shims.test.ts tests/agent-runtime-capabilities.test.ts tests/agent-runtime-registry.test.ts tests/desktop-agent-jobs.test.ts tests/headless-desktop-jobs-ui.test.ts tests/provider-runtime-binding.test.ts tests/windows-desktop-readiness.test.ts
70 pass, 0 fail, 360 expect() calls

bun test tests/headless-cli-dispatcher.test.ts tests/headless-daemon.test.ts
13 pass, 0 fail, 80 expect() calls

bun run build
pass

git diff --check
pass
```

Build printed the existing Browserslist/caniuse-lite freshness warning. That
warning did not fail the build.

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

## Phase 5 Desktop Chat Smoke

A real Electron desktop window was opened with a temporary user data directory.
The smoke sent a normal desktop chat message through the existing chat UI and
verified that the same run appeared as a linked `source=desktop` job in Agent
Workbench.

Final artifact directory:

```text
/Users/ethan/Documents/Locus-smoke-artifacts/desktop-source-jobs-2026-06-03/
```

Artifacts:

```text
desktop-source-jobs.mov
desktop-source-job-summary.json
01-chat-before-send.png
02-chat-after-send.png
03-workbench-desktop-job.png
04-workbench-events.png
05-open-linked-chat.png
```

The final smoke summary recorded:

```text
beforeJobs: 0
jobId: mpx8ov2clniiembt
source: desktop
runtime: claude-code
mode: agent
status: canceled
errorCode: desktop_chat_canceled
workbenchHasStartedInChat: true
workbenchHasAgentRuns: true
videoBytes: 126648628
```

The smoke intentionally does not claim a successful Claude model response.
This machine opened the Claude auth modal during the run, and the smoke closed
the modal/window after proving the linked job, Workbench visibility, event log,
and Open chat navigation. That terminal state is valid cancellation evidence
for the desktop job wrapper, not successful provider execution evidence.

The checked desktop viewport showed no obvious overlap or button crowding in
the chat page, Workbench card, event dialog, or Open chat return path.

## Phase 6 Local Daemon Smoke

A clean temporary user data directory was used for the daemon smoke. The daemon
was started through Electron headless CLI mode with `LOCUS_HEADLESS_FAKE_RUNNER=1`,
then a daemon job was enqueued through `locus run --daemon`.

Final artifact directory:

```text
/Users/ethan/Documents/Locus-smoke-artifacts/headless-daemon-phase6-20260603-114617/
```

Artifacts:

```text
smoke-summary.json
logs/daemon.stderr
logs/run-daemon.stdout.json
logs/jobs-show.stdout.json
logs/jobs-list-daemon.stdout.json
logs/jobs-logs.stdout.json
logs/jobs-logs-follow.stdout.ndjson
logs/daemon-recovery-after-fix.stdout.json
logs/jobs-show-stale-after-fix.stdout.json
media/ui-cdp-workbench-daemon.png
media/ui-os-workbench-front.png
media/ui-workbench-daemon-recording.mov
```

The successful daemon job recorded:

```text
jobId: mpxae02ngihbz3gm
source: daemon
runtime: codex
mode: plan
status: succeeded
exitCode: 0
result: Fake codex job completed.
```

The daemon process evidence recorded `Started local agent daemon` in
`logs/daemon.stderr` and did not record `Created window` in that daemon log.
The renderer window used later for UI verification was a separate desktop smoke
step against the same temporary job store.

The stale-worker recovery smoke recorded:

```text
daemon interruptedJobs: 1
daemon stoppedBy: once
staleJobId: mpxak1z5js5vx9k0
staleJobStatus: interrupted
staleJobErrorCode: worker_interrupted
```

Agent Workbench UI smoke used the same temporary user data directory, registered
the current repo as a temporary project, and verified that the Workbench showed
daemon jobs with the `本地 daemon` source label, including both `已成功` and
`已中断` terminal states. The checked desktop viewport showed no obvious layout
overlap or button crowding in the Workbench list or run-event dialog.

The video artifact is an OS-level `.mov` recording of the Workbench daemon job
list and event-button interaction:

```text
media/ui-workbench-daemon-recording.mov
recordingBytes: 4645956
```

## Windows Evidence Still Required

Implemented and test-covered:

- `resources/cli/locus.cmd` synchronously invokes the app executable for headless `run` and `jobs`.
- `resources/cli/locus.cmd` synchronously invokes the app executable for `daemon`.
- Source tests cover Windows shim behavior and confirm it does not use detached `start` for headless `run`, `jobs`, or `daemon` commands.
- Headless CLI parsing and dispatcher tests cover command behavior independent of platform shell.

Not yet verified:

- Real Windows host or CI smoke for `locus run`.
- Real Windows host or CI smoke for `locus run --daemon`.
- Real Windows host or CI smoke for `locus daemon run`.
- Real Windows host or CI smoke for `locus jobs list`.
- Real Windows host or CI smoke for `locus jobs logs`.
- Windows stdout/stderr/exit-code behavior from the actual `.cmd` shim and packaged executable.
- Windows desktop visibility for a CLI-created job.
- Windows desktop visibility for a daemon-created job.

Until this Windows evidence exists, the accurate status is:

```text
macOS local implementation + smoke complete
headless/job/desktop/daemon visibility implemented and verified locally
desktop chat source=desktop migration implemented and smoked locally
daemon source=daemon queue implemented and smoked locally on macOS
Windows shim implemented and source-tested
Windows real smoke pending
schedule and locus acp deferred
```

## Deferred By Design

These are not part of the current completion:

- Local schedules.
- `locus acp`.
- Full Codex behavior parity with Claude Code.
- Generic safe retry semantics for `source=desktop` chat jobs. Generic retry is
  intentionally disabled for desktop chat jobs until chat-specific retry can
  preserve session/message semantics.
