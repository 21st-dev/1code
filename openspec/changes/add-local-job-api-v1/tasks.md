## 1. Planning
- [x] 1.1 Create OpenSpec proposal, design, task list, and `local-job-api` spec delta.
- [x] 1.2 Validate the OpenSpec change strictly.
- [x] 1.3 Commit the planning slice before implementation.

## 2. Shared Contract
- [ ] 2.1 Add shared Local Job API v1 TypeScript types and validation helpers.
- [ ] 2.2 Add API job source metadata fields and Drizzle migration.
- [ ] 2.3 Add sanitization/rejection checks for secret-like request keys and values.
- [ ] 2.4 Add tests for request validation, response serialization, event mapping, and secret rejection.
- [ ] 2.5 Commit the shared contract slice.

## 3. CLI API Commands
- [ ] 3.1 Extend headless CLI parsing for `locus api runtimes list`.
- [ ] 3.2 Extend headless CLI parsing for `locus api runs create/status/events/result/cancel/retry`.
- [ ] 3.3 Implement API command dispatch with strict stdout JSON/JSONL and stderr diagnostics.
- [ ] 3.4 Gate requested capabilities before runtime work starts.
- [ ] 3.5 Add focused parser and dispatcher tests.
- [ ] 3.6 Commit the CLI API slice.

## 4. Artifact Contract
- [ ] 4.1 Create run-owned artifact directories for API jobs.
- [ ] 4.2 Persist sanitized `request.json`, `events.jsonl`, `result.json`, and `artifacts.json`.
- [ ] 4.3 Emit or serialize `artifact_created` events only for run-owned metadata/artifacts.
- [ ] 4.4 Add artifact tests covering path validation, sanitized writes, and final-directory non-mutation.
- [ ] 4.5 Commit the artifact slice.

## 5. Workbench Visibility
- [ ] 5.1 Design a compact Workbench metadata treatment for API jobs.
- [ ] 5.2 Show API source, consumer ID, external run ID, and artifact path/manifest when present.
- [ ] 5.3 Keep layout dense, accessible, and free of overlapping/truncated controls.
- [ ] 5.4 Add UI tests for API job labels and metadata.
- [ ] 5.5 Commit the Workbench slice.

## 6. Verification
- [ ] 6.1 Run `openspec validate add-local-job-api-v1 --strict --no-interactive`.
- [ ] 6.2 Run focused Bun tests for local-job-api, CLI parsing/dispatch, job store, artifacts, runtime capabilities, and Workbench UI.
- [ ] 6.3 Run `bun run ts:check`.
- [ ] 6.4 Run `bun run build`.
- [ ] 6.5 Run real macOS smoke with a career-style local package and fake runner.
- [ ] 6.6 Record CLI/API output, artifact files, Workbench screenshot, and UI recording if Workbench UI changed.
- [ ] 6.7 Run security review for request/event/artifact secret handling.
- [ ] 6.8 Record any Windows real-smoke gap separately from macOS completion.
