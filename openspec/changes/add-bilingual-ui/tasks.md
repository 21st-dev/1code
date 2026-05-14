## 1. Proposal Gate
- [ ] 1.1 Review and approve this OpenSpec change before implementation.
- [ ] 1.2 Confirm the initial language default: `system` or English.
- [ ] 1.3 Confirm whether onboarding needs a language switch before Preferences is reachable.

## 2. Localization Infrastructure
- [ ] 2.1 Add typed language IDs and language preference atom.
- [ ] 2.2 Add renderer i18n provider, locale resolver, dictionaries, and `useI18n` hook.
- [ ] 2.3 Add helper support for simple interpolation and count-based strings where needed.
- [ ] 2.4 Add missing-key fallback behavior to English.

## 3. First Migration Batch
- [ ] 3.1 Migrate billing/provider onboarding screens.
- [ ] 3.2 Migrate API key, custom model, Codex, and Claude onboarding wrappers.
- [ ] 3.3 Migrate repository selection and clone screens.
- [ ] 3.4 Add language preference controls in Settings > Preferences.
- [ ] 3.5 Migrate settings sidebar labels and core Preferences/Models copy.

## 4. Second Migration Batch
- [ ] 4.1 Migrate main sidebar navigation and workspace actions.
- [ ] 4.2 Migrate archive/search/new workspace entry points.
- [ ] 4.3 Migrate primary chat input controls and mode labels.
- [ ] 4.4 Migrate common toast titles/descriptions where they are app-authored.

## 5. Later Migration Batch
- [ ] 5.1 Migrate agent tool/status wrapper labels.
- [ ] 5.2 Migrate changes/diff UI shell labels.
- [ ] 5.3 Migrate terminal and file viewer UI shell labels.
- [ ] 5.4 Migrate automations and inbox UI shell labels.

## 6. Verification
- [ ] 6.1 Run OpenSpec validation when CLI is available.
- [ ] 6.2 Run `bun run ts:check`.
- [ ] 6.3 Run `bun run build`.
- [ ] 6.4 Smoke test language switching in Electron for English and Simplified Chinese.
- [ ] 6.5 Sweep remaining hardcoded English strings and document intentional exclusions.
