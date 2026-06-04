## Context
The current STT implementation is split between a main-process tRPC router, a low-level MediaRecorder hook, and duplicated chat-form handlers. The new structure should make voice input reusable while preserving the security boundary: renderer code records audio and sends it to main; main owns provider credentials and calls the configured transcription service.

## Goals
- Provide one reusable renderer hook for voice input orchestration.
- Provide one reusable voice control component for microphone/recording/transcribing UI.
- Keep transcription provider helpers testable outside the tRPC router.
- Preserve optional behavior: no configured provider means no blocker for text chat.
- Preserve credential safety: no renderer plaintext provider token, no env fallback, no transcript/provider-body logging.

## Non-Goals
- No TTS support.
- No new external package.
- No packaging into an npm package in this slice.
- No automatic `.env` fallback for voice provider credentials.

## Decisions
- Keep `useVoiceRecording` as the low-level browser MediaRecorder hook.
- Add `useVoiceInput` as the integration hook that accepts `transcribeAudio` and `onText` callbacks so projects can provide their own API transport.
- Add `VoiceInputControl` as a presentation component that composes the existing send button voice behavior and tooltip semantics.
- Move pure transcription helpers from `src/main/lib/trpc/routers/voice.ts` into `src/main/lib/voice/transcription.ts`; keep provider lookup and tRPC input validation in the router.
- Keep Locus chat editor insertion outside the reusable hook by passing `onText`.

## Risks
- Pointer/click behavior can regress if the component abstraction loses the existing start/stop race guards.
- Duplicated hotkey handlers can still remain until both chat forms use the new hook.
- Tests must guard against accidentally reintroducing env fallback or renderer secret storage.
