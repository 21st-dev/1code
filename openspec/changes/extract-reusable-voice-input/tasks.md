## 1. Specification
- [x] 1.1 Add voice-input OpenSpec delta.
- [x] 1.2 Validate the change with OpenSpec strict mode.

## 2. Main Process
- [x] 2.1 Extract transcription URL building and provider transcription into `src/main/lib/voice/`.
- [x] 2.2 Keep the tRPC voice router as provider lookup, input validation, and response transport.
- [x] 2.3 Update transcription tests to target the extracted service.

## 3. Renderer
- [ ] 3.1 Add reusable `useVoiceInput` orchestration hook.
- [ ] 3.2 Add reusable `VoiceInputControl` component.
- [ ] 3.3 Refactor existing chat input surfaces to use the shared hook/component.

## 4. Verification
- [ ] 4.1 Add focused tests for the reusable hook/component source boundaries.
- [ ] 4.2 Run targeted voice tests.
- [ ] 4.3 Run TypeScript check and build.
- [ ] 4.4 Confirm no plaintext provider token or env fallback is introduced.
