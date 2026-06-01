## 1. Reference audit
- [x] 1.1 Review cc-switch provider management screenshots/components and extract reusable UI patterns.
- [x] 1.2 Review current Locus Settings > Models provider profile UI and list scoped issues.
- [x] 1.3 Reconfirm security boundaries for renderer-visible provider metadata.

## 2. Specification
- [x] 2.1 Add provider-routing-ux OpenSpec proposal, design, and requirements.
- [x] 2.2 Validate the change with strict OpenSpec validation.

## 3. Implementation
- [x] 3.1 Widen Models settings content without changing other Settings tabs.
- [x] 3.2 Adapt provider preset selection to scannable chips.
- [x] 3.3 Adapt saved provider profile rows with safer status, target, defaults, diagnostics, and icon actions.
- [x] 3.4 Add English and Simplified Chinese copy for new labels.
- [x] 3.5 Require token re-entry when profile endpoint, protocol, or auth mode changes.

## 4. Verification
- [x] 4.1 Add focused UI/source and i18n regression tests.
- [x] 4.2 Add storage regression coverage for token reuse prevention.
- [x] 4.3 Run targeted tests and typecheck.
- [x] 4.4 Run build.
- [x] 4.5 Run real desktop/browser smoke and capture screenshot/video evidence.
- [x] 4.6 Commit the completed vertical slice.
