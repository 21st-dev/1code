# Change: Add Local Job API project onboarding

## Why
The Local Job API requires every job's `cwd` to be inside a registered Locus
project, but the only way to register a project today is the desktop Workbench
folder picker and clone flows in `src/main/lib/trpc/routers/projects.ts`. A
downstream consumer or CI smoke that points at a fresh/temporary directory is
rejected with a plain English error such as `... must be inside a registered
project` (`src/main/lib/headless/schedules.ts:239`), and the CLI must guess the
failure by regex-matching that message (`localJobApiCreateErrorCode` in
`src/main/lib/headless/cli-dispatcher.ts:466`).

This makes the Local Job API non-self-sufficient as a downstream contract: the
first step ("make Locus aware of this workspace") still needs a human in the
desktop app, which blocks automated connected canaries and CI/local smoke.

## What Changes
- Add `locus api projects register`, `locus api projects status`, and
  `locus api projects unregister` headless commands with versioned JSON output.
- Extract project registration into a single shared owner reused by both the
  desktop tRPC `projects` router and the new headless commands, instead of
  duplicating registration logic in the CLI.
- Make project registration safe for automation: `register` is idempotent by
  canonical path, registration does not require a git remote, and `unregister`
  is scoped so it does not silently destroy a project with active jobs.
- Replace stderr string-matching with a stable structured error code
  (`project_not_registered`) returned by `locus api runs create` and
  `locus api projects status` so consumers stop parsing English error text.
- Keep the existing Local Job API v1 create/status/events/result/cancel/retry
  contract and the local-first secret boundary unchanged.

## Impact
- Affected specs: `local-job-api`
- Affected code:
  - `src/main/lib/trpc/routers/projects.ts` (register/unregister reuse shared owner)
  - new shared project registration owner under `src/main/lib/projects/`
  - `src/main/lib/headless/cli-args.ts` (parse new `api projects` commands)
  - `src/main/lib/headless/cli-dispatcher.ts` (command handlers, help, structured error code)
  - `src/main/lib/headless/schedules.ts` (`findRegisteredProjectForCwd*` raises a typed registration error)
  - `src/shared/local-job-api.ts` (project envelope + error code constants)
  - tests under `tests/*local-job-api*`, `tests/headless-cli-*`, and project registration tests
