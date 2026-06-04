## 1. Planning
- [x] 1.1 Create OpenSpec proposal, design, task list, and `local-job-api` spec delta.
- [x] 1.2 Validate the OpenSpec change strictly.
- [x] 1.3 Commit the planning slice before implementation.

## 2. Shared Contract
- [x] 2.1 Add shared Local Job API v1 TypeScript types and validation helpers.
- [x] 2.2 Add API job source metadata fields and Drizzle migration.
- [x] 2.3 Add sanitization/rejection checks for secret-like request keys and values.
- [x] 2.4 Add tests for request validation, response serialization, event mapping, and secret rejection.
- [x] 2.5 Commit the shared contract slice.

## 3. CLI API Commands
- [x] 3.1 Extend headless CLI parsing for `locus api runtimes list`.
- [x] 3.2 Extend headless CLI parsing for `locus api runs create/status/events/result/cancel/retry`.
- [x] 3.3 Implement API command dispatch with strict stdout JSON/JSONL and stderr diagnostics.
- [x] 3.4 Gate requested capabilities before runtime work starts.
- [x] 3.5 Add focused parser and dispatcher tests.
- [x] 3.6 Commit the CLI API slice.

## 4. Artifact Contract
- [x] 4.1 Create run-owned artifact directories for API jobs.
- [x] 4.2 Persist validated `request.json`, `events.jsonl`, `result.json`, and `artifacts.json`.
- [x] 4.3 Emit or serialize `artifact_created` events only for run-owned metadata/artifacts.
- [x] 4.4 Add artifact tests covering path validation, secret rejection before writes, and final-directory non-mutation.
- [x] 4.5 Commit the artifact slice.

## 5. Workbench Visibility
- [x] 5.1 Design a compact Workbench metadata treatment for API jobs.
- [x] 5.2 Show API source, consumer ID, external run ID, and artifact path/manifest when present.
- [x] 5.3 Keep layout dense, accessible, and free of overlapping/truncated controls.
- [x] 5.4 Add UI tests for API job labels and metadata.
- [x] 5.5 Commit the Workbench slice.

## 6. Verification
- [x] 6.1 Run `openspec validate add-local-job-api-v1 --strict --no-interactive`.
- [x] 6.2 Run focused Bun tests for local-job-api, CLI parsing/dispatch, job store, artifacts, runtime capabilities, and Workbench UI.
- [x] 6.3 Run `bun run ts:check`.
- [x] 6.4 Run `bun run build`.
- [x] 6.5 Run real macOS smoke with a generic local package and fake runner.
- [x] 6.6 Record CLI/API output, artifact files, Workbench screenshot, and UI recording if Workbench UI changed.
  - Note: CLI/API output, artifact files, terminal recording, and smoke screenshot/video were captured. Workbench UI is covered by static UI tests; live Workbench automation was blocked by the local onboarding/privacy prompt on this host.
- [x] 6.7 Run security review for request/event/artifact secret handling.
- [x] 6.8 Record any Windows real-smoke gap separately from macOS completion.
  - Note: macOS local smoke passed; Windows real smoke was not run on this macOS host and remains a separate release/platform gate.
