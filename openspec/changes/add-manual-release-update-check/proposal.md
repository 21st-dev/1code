# Change: Add manual release update check

## Why
Open-source users need a simple way to discover newer Locus builds without reintroducing hosted upstream updater behavior or automatic installation.

## What Changes
- Add a Settings > About surface that shows the current app version.
- Add a manual "Check for updates" action that requests the fork-owned GitHub Releases latest endpoint.
- Show whether the latest release is newer than the installed app.
- Let users open the GitHub Release page in their browser to download manually.
- Do not auto-download, auto-install, run background checks, or send local project information.

## Impact
- Affected specs: `app-update-check`, `local-only-cloud-guard`
- Affected code: app settings UI, i18n copy, tRPC router, GitHub Releases request helper
