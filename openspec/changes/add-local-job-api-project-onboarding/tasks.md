## 1. Proposal Validation
- [x] 1.1 Confirm this change does not overlap requirement names with `refactor-runtime-core-execution-boundary` in the `local-job-api` spec.
- [x] 1.2 Validate this proposal with `bunx openspec validate add-local-job-api-project-onboarding --strict --no-interactive`.

## 2. Shared Registration Owner
- [x] 2.1 Add a shared main-process registration owner (e.g. `src/main/lib/projects/registry.ts`) with `registerProjectForPath`, `getProjectRegistrationForCwd`, and `unregisterProjectForPath` over an injected database handle.
- [x] 2.2 Route the desktop tRPC `projects.create` (and the `openFolder` insert path) through the shared owner without changing existing desktop behavior.
- [x] 2.3 Keep git remote info best-effort so registration does not require a git repo.
- [x] 2.4 Add tests proving desktop registration still dedupes by canonical path and preserves git metadata.

## 3. Structured Registration Errors
- [x] 3.1 Define a `project_not_registered` error code constant in `src/shared/local-job-api.ts`.
- [x] 3.2 Raise a typed registration error from `findRegisteredProjectForCwd*` in `src/main/lib/headless/schedules.ts` instead of a plain message.
- [ ] 3.3 Map the typed error to a stable error envelope and deterministic exit code in `locus api runs create`, replacing the regex match in `localJobApiCreateErrorCode`.
- [ ] 3.4 Add tests proving `locus api runs create` against an unregistered cwd returns `project_not_registered` in JSON without requiring stderr string matching, and keeps the current exit-code value.

## 4. Project Onboarding Commands
- [ ] 4.1 Parse `api projects register|status|unregister` (with `--cwd`, `--name`, `--force`, `--json`) in `src/main/lib/headless/cli-args.ts`.
- [ ] 4.2 Implement the three handlers in `src/main/lib/headless/cli-dispatcher.ts` emitting versioned JSON envelopes and `HEADLESS_EXIT_CODES` statuses.
- [ ] 4.3 Make `register` idempotent by canonical path and `unregister` refuse active-job projects unless `--force`.
- [ ] 4.4 Update `locus` CLI help text to list the new `api projects` commands.
- [ ] 4.5 Add command tests for register success, idempotent re-register, status membership/non-membership, unregister cleanup, and unregister-refused-with-active-jobs.

## 5. Automation Lifecycle Proof
- [ ] 5.1 Add a test that registers a temporary directory, creates and runs a Local Job API job in it, and unregisters it, proving the headless connected canary path works end to end.

## 6. Verification
- [ ] 6.1 Run targeted tests for project registration, headless CLI commands, and Local Job API create errors.
- [ ] 6.2 Run `bun run ts:check`.
- [ ] 6.3 Run `bun run build`.
- [ ] 6.4 Run `bunx openspec validate add-local-job-api-project-onboarding --strict --no-interactive` and `bunx openspec validate --all --strict --no-interactive`.
