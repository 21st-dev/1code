# Design: Local Browser Workbench

## Scope
The first version is a local visual QA loop for app development. It is intentionally limited to local URLs and local static previews. The browser surface is a workbench panel, not a general-purpose web automation platform.

## Architecture
- Enable Electron's renderer `<webview>` support for the main app window.
- Render the Local Browser Workbench as a resizable right-side panel in the agent workspace.
- Validate and normalize URLs in a shared utility before loading or restoring a target.
- Keep browser diagnostics in renderer state:
  - console messages from the webview event stream
  - network/load failures from webview load events
  - DOM summary from a read-only injected script
  - screenshot data from `capturePage`
- Insert a bounded Markdown report into the active chat input through the existing editor ref.

## URL Boundary
Allowed:
- `http://localhost[:port]`
- `http://127.0.0.1[:port]`
- `http://[::1][:port]`
- `file://...`

Blocked:
- remote hosts
- official hosted/cloud URLs
- browser profile or extension pages
- unsupported schemes

The workbench blocks navigation attempts that leave the local boundary and records the blocked target as a diagnostic.

## Context Capture
The workbench captures context only when the user clicks the capture/annotate control. The generated report contains:
- URL, title, viewport preset, scale, and timestamp
- screenshot availability
- selected element or free-form note
- bounded DOM summary
- recent console errors/warnings
- recent load or network failures

## Testing
- Unit tests cover URL normalization/allow-listing and bounded report generation.
- Type checking validates Electron webview surface integration.
- Local smoke tests launch the app, open the workbench, navigate to a local page, click inside the preview, capture diagnostics, and visually inspect the screenshot/panel state.
