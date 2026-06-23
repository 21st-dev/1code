# Clean Profile Desktop Smoke

Date: 2026-06-23

Command:

```bash
LOCUS_USER_DATA_DIR=/tmp/locus-onboarding-closeout-smoke bun run dev
```

Environment:

- User data directory: `/tmp/locus-onboarding-closeout-smoke`
- Renderer URL: `http://localhost:5174/` because an existing dev instance already held port 5173
- Existing daily profile was left running and was not used for this smoke

Observed startup evidence:

- The app honored `LOCUS_USER_DATA_DIR` and initialized SQLite under `/tmp/locus-onboarding-closeout-smoke/data/agents.db`.
- Database migrations completed for the clean profile.
- Local mode loaded unauthenticated.
- The Electron window became ready and the renderer finished loading.
- The bundled Claude binary was found and executable.

Observed UI evidence:

- `clean-profile-onboarding-desktop.png` captures the clean-profile first-run setup at desktop width.
- `clean-profile-onboarding-narrow.png` captures the same setup after resizing the Electron window to a narrow layout.
- Both screenshots reached the project step after an AI path was available, with the status rail, project actions, and language switch visible.
- The desktop and narrow layouts did not show overlapping labels or controls in the captured states.

Limitations:

- The existing daily dev instance occupied auth callback port 21322, so external OAuth callback completion was not exercised in this smoke.
- This smoke did not send a real model request or persist a real API key.
