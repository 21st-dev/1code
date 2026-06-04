# Change: Extract reusable voice input

## Why
Voice input is now functional, but its recording, transcription, and UI glue are duplicated across chat inputs. Keeping this logic embedded in chat forms makes voice a recurring blocker and makes it hard to reuse in other projects.

## What Changes
- Extract a reusable renderer voice input hook that owns push-to-talk recording, stop-race guards, short-recording handling, transcription calls, and result insertion callbacks.
- Extract a reusable voice control component that displays microphone, recording, transcribing, and tooltip states without knowing about chat editors.
- Move main-process transcription helpers into a voice service module so the tRPC router is a thin transport boundary.
- Keep provider credentials in existing main-process secure storage and keep voice input optional when no transcription provider is configured.

## Impact
- Affected specs: voice-input
- Affected code:
  - `src/main/lib/trpc/routers/voice.ts`
  - `src/main/lib/voice/`
  - `src/renderer/lib/hooks/`
  - `src/renderer/features/agents/components/`
  - `src/renderer/features/agents/main/chat-input-area.tsx`
  - `src/renderer/features/agents/main/new-chat-form.tsx`
  - `tests/`
