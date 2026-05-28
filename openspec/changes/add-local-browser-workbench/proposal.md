# Change: Add local browser workbench

## Status
In progress.

## Why
Locus can edit files, inspect diffs, and run terminals, but frontend work still relies on users manually opening a browser, taking screenshots, and pasting visual feedback back into chat. A local-first coding agent workbench needs a controlled visual QA loop for local pages so users and agents can inspect the running product, capture diagnostics, annotate issues, and re-check after code changes.

## What Changes
- Add a Local Browser Workbench panel for `localhost`, loopback hosts, and local static/file previews.
- Render a controlled local page preview inside the desktop app.
- Capture screenshot evidence, DOM summary, console errors, and network load failures from the preview.
- Let users select/annotate page context and insert that browser report into the active agent input.
- Provide reload and smoke-check affordances so the same URL can be re-opened after agent edits.
- Reuse existing agent preview controls for viewport, scale, and URL editing where practical.

## Non-Goals
- No authenticated Chrome profile takeover.
- No arbitrary public website automation.
- No system-wide macOS Accessibility or desktop computer-use layer.
- No remote browser sandbox.
- No long-running cloud automation.

## Impact
- Affected specs: `local-browser-workbench`
- Affected code:
  - `src/main/windows/main.ts`
  - `src/preload/index.ts`
  - `src/renderer/features/agents/main/active-chat.tsx`
  - `src/renderer/features/agents/atoms/index.ts`
  - new local browser workbench UI and shared validation utilities
  - automated tests under `tests/`
- Security/privacy considerations:
  - The browser preview must only accept local URLs.
  - Captured context should be explicit and user-triggered before insertion into agent chat.
  - Console/network/DOM summaries should be bounded and avoid raw page dumps.
