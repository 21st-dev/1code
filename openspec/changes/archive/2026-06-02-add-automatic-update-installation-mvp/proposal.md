# Change: Add automatic update installation MVP

## Why
Locus currently only checks GitHub Releases manually from Settings > About. Users need a safer low-friction path that checks for app updates automatically while preserving explicit user control over downloads and restarts.

## What Changes
- Add packaged-app automatic update checks against this fork's GitHub Releases feed.
- Require user confirmation before downloading and before restarting to install.
- Keep portable Windows and Linux on manual download behavior.
- Keep local-only boundaries by avoiding official upstream hosted updater feeds and local data in update requests.

## Impact
- Affected specs: `app-update-check`, `local-only-cloud-guard`
- Affected code: Electron main updater service, `appUpdates` tRPC router, Settings > About UI, release configuration and docs
