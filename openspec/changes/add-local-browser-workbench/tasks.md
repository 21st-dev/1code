## Status
In progress.

## 1. Spec and Guardrails
- [x] 1.1 Add OpenSpec proposal, design, tasks, and capability delta.
- [x] 1.2 Validate the OpenSpec change strictly.

## 2. Shared Local Browser Model
- [x] 2.1 Add shared URL validation and normalization helpers for local-only preview targets.
- [x] 2.2 Add bounded diagnostic/report builders for browser context handoff.
- [x] 2.3 Add automated tests for URL guardrails and report bounding.

## 3. Workbench UI
- [x] 3.1 Add per-chat browser workbench open/width state.
- [x] 3.2 Add a header affordance to open the workbench from active agent workspaces.
- [x] 3.3 Build the resizable workbench panel with URL entry, reload, screenshot capture, DOM summary, console, and network failure views.
- [x] 3.4 Support desktop/mobile viewport sizing and scale controls.
- [x] 3.5 Block navigation outside local URLs and surface the reason in the panel.

## 4. Agent Context Handoff
- [x] 4.1 Let users add a note or selected element summary.
- [x] 4.2 Insert a bounded browser QA report into the active chat input.
- [x] 4.3 Keep the same URL available for reload/smoke checks after agent edits.

## 5. Verification
- [x] 5.1 Run `openspec validate add-local-browser-workbench --strict --no-interactive`.
- [x] 5.2 Run targeted unit tests.
- [x] 5.3 Run `bun run ts:check`.
- [x] 5.4 Run the real desktop app against a local static test page and click through the workbench.
- [x] 5.5 Capture screenshot/visual evidence for the workbench preview and diagnostics.
- [x] 5.6 Commit completed slices incrementally before continuing.

Evidence:
- Spec: `openspec validate add-local-browser-workbench --strict --no-interactive` passed.
- Automated: `bun test tests` passed.
- Static/build: `bun run ts:check` and `bun run build` passed.
- Real UI smoke: launched Electron dev app with `LOCUS_USER_DATA_DIR=/tmp/locus-local-browser-workbench-profile`, served `tests/fixtures/local-browser-smoke` at `http://127.0.0.1:49321/`, opened the Local Browser Workbench, loaded the local page, clicked the page button, captured screenshot/DOM/console diagnostics, inserted the report into the active chat input, and visually confirmed the screenshot thumbnail plus report text.
- Navigation guard smoke: clicked the page's remote `https://example.com/...` link, confirmed the workbench displayed the local-only error, recorded the blocked URL in failures, and rolled the preview back to `127.0.0.1:49321`.
