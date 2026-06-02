## 1. Spec
- [x] 1.1 Add file viewer performance proposal and delta spec.
- [x] 1.2 Validate the OpenSpec change.

## 2. Implementation
- [x] 2.1 Add a shared Monaco preview loader/preload helper.
- [x] 2.2 Replace plain fallback full line rendering with virtualized line rendering.
- [x] 2.3 Trigger Monaco preload from file-viewer entry points without eager startup loading.
- [x] 2.4 Keep line numbers and word wrap behavior intact for fallback mode.

## 3. Validation
- [x] 3.1 Add focused tests for preview thresholds and fallback selection helpers.
- [x] 3.2 Run focused tests.
- [x] 3.3 Run TypeScript/build validation if the focused checks pass.
