## Status
In progress.

## 1. Spec and Guardrails
- [x] 1.1 Add OpenSpec proposal, design, tasks, and capability delta.
- [x] 1.2 Validate the OpenSpec change strictly.

## 2. Shared Local Browser Model
- [ ] 2.1 Add shared URL validation and normalization helpers for local-only preview targets.
- [ ] 2.2 Add bounded diagnostic/report builders for browser context handoff.
- [ ] 2.3 Add automated tests for URL guardrails and report bounding.

## 3. Workbench UI
- [ ] 3.1 Add per-chat browser workbench open/width state.
- [ ] 3.2 Add a header affordance to open the workbench from active agent workspaces.
- [ ] 3.3 Build the resizable workbench panel with URL entry, reload, screenshot capture, DOM summary, console, and network failure views.
- [ ] 3.4 Support desktop/mobile viewport sizing and scale controls.
- [ ] 3.5 Block navigation outside local URLs and surface the reason in the panel.

## 4. Agent Context Handoff
- [ ] 4.1 Let users add a note or selected element summary.
- [ ] 4.2 Insert a bounded browser QA report into the active chat input.
- [ ] 4.3 Keep the same URL available for reload/smoke checks after agent edits.

## 5. Verification
- [x] 5.1 Run `openspec validate add-local-browser-workbench --strict --no-interactive`.
- [ ] 5.2 Run targeted unit tests.
- [ ] 5.3 Run `bun run ts:check`.
- [ ] 5.4 Run the real desktop app against a local static test page and click through the workbench.
- [ ] 5.5 Capture screenshot/visual evidence for the workbench preview and diagnostics.
- [ ] 5.6 Commit completed slices incrementally before continuing.
