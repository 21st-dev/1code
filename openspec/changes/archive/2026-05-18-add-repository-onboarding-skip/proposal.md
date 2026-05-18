# Change: Add repository onboarding skip

## Why
The first-run repository selection screen blocks users who want to inspect the app, adjust settings, or connect capabilities before choosing a local folder.

## What Changes
- Add a low-priority "choose later" action on repository onboarding.
- Let users enter the main app shell after deferring repository selection.
- Keep project-dependent chat, file, diff, and terminal workflows gated until a project is selected.

## Impact
- Affected specs: project-onboarding
- Affected code: renderer onboarding routing, repository onboarding page, project selection state, localized copy
