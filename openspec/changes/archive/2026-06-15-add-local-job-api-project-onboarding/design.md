## Context
The Local Job API v1 lets downstream local apps create, observe, and read Locus
jobs without importing Locus source or reading SQLite. But job creation resolves
`cwd` to a project through `findRegisteredProjectForCwdWithCanonicalPath`
(`src/main/lib/headless/schedules.ts:209`), which throws a plain `Error` whose
message is later regex-matched to pick an exit code
(`src/main/lib/headless/cli-dispatcher.ts:466`). Registration itself only exists
in the desktop tRPC `projects` router: `openFolder` (folder picker) and `create`
(path + optional name, dedupe by path, best-effort git info, insert) in
`src/main/lib/trpc/routers/projects.ts:139`.

There is no headless path to register, inspect, or remove a project, so a
downstream product or CI smoke pointed at a temporary directory cannot run a
connected canary without a manual desktop step.

This change is intentionally scoped to the onboarding/entry surface of the Local
Job API. It does not touch runtime execution, adapter selection, event
vocabulary, or permission policy, which are owned by the separate
`refactor-runtime-core-execution-boundary` change.

## Goals / Non-Goals
- Goals:
  - Let a headless caller register, check, and remove a project workspace through
    versioned `locus api projects` commands.
  - Have one shared registration owner used by both desktop and headless, not a
    duplicate CLI re-implementation.
  - Return a stable structured `project_not_registered` error instead of forcing
    consumers to match English stderr.
  - Make register/unregister safe to run repeatedly in automation and CI.
- Non-Goals:
  - No change to job execution, adapter selection, RunEvent vocabulary, or
    permission policy (owned by `refactor-runtime-core-execution-boundary`).
  - No Local Job API v2, no HTTP/WebSocket server, no remote registration.
  - No new desktop renderer UI for registration.
  - No change to how provider credentials are resolved.

## Decisions
### Shared Registration Owner
Extract the path-based registration logic from the desktop tRPC `projects.create`
mutation into a shared main-process owner (for example
`src/main/lib/projects/registry.ts`) exposing pure functions over an injected
database handle:

- `registerProjectForPath({ db, path, name? })` — canonicalize and verify the
  path exists and is a directory, dedupe by canonical path (return existing),
  otherwise insert. Git remote info stays best-effort so registration does not
  require a git repo.
- `getProjectRegistrationForCwd({ db, cwd })` — report whether a cwd resolves to
  a registered project and which one, without throwing.
- `unregisterProjectForPath({ db, path, force? })` — remove the registration for
  a canonical path, refusing when the project has active (queued/running) jobs
  unless `force` is set.

Both the desktop `projects` router and the new headless commands call this owner.
This follows the existing `architecture-ownership` "No Duplicate Business Paths"
rule rather than adding a parallel CLI registration path.

### Command Surface
Add three headless subcommands under the existing `locus api` group, mirroring
the shape of `api runs *` and `api runtimes list`:

- `locus api projects register --cwd <path> [--name <name>] --json`
- `locus api projects status --cwd <path> --json`
- `locus api projects unregister --cwd <path> [--force] --json`

Each prints a single versioned JSON envelope on stdout
(`apiVersion: locus.local-job.v1`) and uses `HEADLESS_EXIT_CODES` for the exit
status, consistent with the other `api` commands. `status` is read-only and
reports membership without mutating state.

### Idempotency and Automation Safety
- `register` is idempotent by canonical path: re-registering an already-known
  path returns the existing project envelope with success, so CI can call it
  unconditionally.
- `register` does not require or fail on a missing git remote.
- `unregister` refuses to remove a project that has active jobs unless `--force`,
  and the envelope reports what would be affected. This protects against an
  automation step deleting a real project (and its cascaded chats) by accident.

### Structured Registration Errors
Replace the regex-on-message exit-code derivation with a typed error carrying a
stable `code`. `findRegisteredProjectForCwd*` raises a registration error with
`code: "project_not_registered"` (plus the resolved cwd, redaction-safe), and the
`locus api runs create` and `locus api projects status` handlers surface that
code in a stable error envelope and map it to a deterministic exit code instead
of matching `/registered project/i`. Existing exit-code values are preserved for
compatibility; only the source of truth changes from string to code.

### Path and Secret Boundary
Registration input is a local filesystem path plus an optional display name. The
commands reject secret-like fields the same way the existing create path does,
and never accept provider tokens, env values, or headers. Path handling reuses
the existing `canonicalExistingPath`/`isPathInside` helpers so registration
cannot point at a non-existent or non-directory target.

## Risks / Trade-offs
- Extracting registration could drift desktop behavior. Mitigation: the desktop
  `projects` router calls the same owner; add tests asserting `openFolder` and
  `create` still dedupe-by-path and keep git info.
- `unregister` cascading to chats could destroy data. Mitigation: refuse when
  active jobs exist unless `--force`, and document the cascade in the envelope.
- A second consumer-facing error contract could fragment. Mitigation: define the
  `project_not_registered` code once in `src/shared/local-job-api.ts` and reuse it
  in create and status.

## Migration Plan
1. Add the shared registration owner and route the desktop `projects` router
   through it with tests proving unchanged desktop behavior.
2. Add typed `project_not_registered` errors at the cwd-resolution boundary and
   map them in the API command handlers, keeping current exit-code values.
3. Add `api projects register/status/unregister` parsing, handlers, help text,
   and JSON envelopes.
4. Add an automation lifecycle test (register temp dir → create+run job →
   unregister) proving the connected canary path works headlessly.

## Open Questions
- Should `unregister` default to refusing on any existing chats, or only on
  active jobs? Current decision: refuse on active jobs, allow with `--force`.
- Should `register` accept a `--synthetic` marker so Workbench can visually
  distinguish automation-created projects from user-opened ones?
