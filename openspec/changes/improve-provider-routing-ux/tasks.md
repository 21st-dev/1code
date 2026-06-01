## 1. Reference audit
- [ ] 1.1 Review cc-switch provider management screenshots/components and extract reusable UI patterns.
- [ ] 1.2 Review current Locus Settings > Models provider profile UI and list scoped issues.
- [ ] 1.3 Reconfirm security boundaries for renderer-visible provider metadata.

## 2. Specification
- [ ] 2.1 Add provider-routing-ux OpenSpec proposal, design, and requirements.
- [ ] 2.2 Validate the change with strict OpenSpec validation.

## 3. Implementation
- [ ] 3.1 Widen Models settings content without changing other Settings tabs.
- [ ] 3.2 Adapt provider preset selection to scannable chips.
- [ ] 3.3 Adapt saved provider profile rows with safer status, target, defaults, diagnostics, and icon actions.
- [ ] 3.4 Add English and Simplified Chinese copy for new labels.
- [ ] 3.5 Require token re-entry when profile endpoint, protocol, or auth mode changes.

## 4. Verification
- [ ] 4.1 Add focused UI/source and i18n regression tests.
- [ ] 4.2 Add storage regression coverage for token reuse prevention.
- [ ] 4.3 Run targeted tests and typecheck.
- [ ] 4.4 Run build.
- [ ] 4.5 Run real desktop/browser smoke and capture screenshot/video evidence.
- [ ] 4.6 Commit the completed vertical slice.
