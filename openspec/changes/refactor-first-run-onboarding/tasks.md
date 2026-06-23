## 1. Status Model

- [x] 1.1 Add a renderer-only derived first-run status helper that reads existing
      provider/runtime/project status queries without introducing a new durable
      provider or runtime truth.
- [x] 1.2 Remove the legacy onboarding completion atoms and the Codex auth-method
      atom (no existing users to migrate); derive connected/repair states from the
      owners and ignore orphaned localStorage keys.
- [x] 1.3 Add tests that a path is only "ready" when an owner reports it (no
      stored flag can mark an unhealthy Claude/Codex path as ready).

## 2. Setup Surface

- [x] 2.1 Replace the full-screen route chain with a single first-run setup
      surface for AI path, runtime/credential action, and start context.
- [x] 2.2 Keep desktop and narrow viewport layouts stable without overlapping
      labels or controls.
- [x] 2.3 Preserve language switching and title-bar drag behavior.

## 3. Provider And Auth Actions

- [x] 3.1 Remove first-run auto-start behavior for Claude Code local login and
      Codex ChatGPT login.
- [x] 3.2 Require explicit clicks before launching external auth, importing local
      Claude credentials, saving provider credentials, or saving Codex API keys.
- [x] 3.3 Keep Claude API key and custom endpoint saves on Provider Profiles and
      select the saved provider-profile source (existing profiles divert the
      OAuth default to the profile at run admission).
- [x] 3.4 Keep Codex API keys in main-process secure storage and preserve current
      renderer-secret negative tests.

## 4. Project Entry

- [x] 4.1 Reuse project open and GitHub clone behavior in the start-context step.
- [x] 4.2 Keep Quick chat deferral available after one usable AI path is
      configured.
- [x] 4.3 Clear repository deferral when a project is later opened, cloned, or
      selected.

## 5. Localization And Tests

- [x] 5.1 Add English and Simplified Chinese strings for the redesigned setup
      surface.
- [x] 5.2 Update onboarding, provider-profile, Claude auth, Codex auth,
      project-onboarding, and i18n tests.
- [x] 5.3 Run `bun run ts:check` and targeted `bun test` coverage.
- [x] 5.4 Capture manual clean-profile desktop smoke notes for the accepted
      implementation.
