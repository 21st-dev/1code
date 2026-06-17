# Tasks: Optimize chat-stream code highlighting (phase 3c)

> Baseline: `main` (`a90e2a9`). Single-file renderer fix; independent of other phases.

## 1. Defer Shiki during streaming
- [x] 1.1 In `CodeBlock` (`chat-markdown-renderer.tsx`), do not run Shiki while the code block is still streaming; render plain escaped text via the existing fallback path.
- [x] 1.2 Trigger Shiki once the block is settled (fence closed / message no longer streaming); a trailing debounce is an acceptable fallback only if a completeness signal is unavailable.
- [x] 1.3 Add/pass `isStreaming` through `MemoizedTextPart → MemoizedMarkdown → MemoizedMarkdownBlock → CodeBlock` (`createCodeComponent` receives it today, but `CodeBlock` and the memoized markdown chain do not); do not bust block memoization of already-settled blocks.

## 2. Preserve final result + scope
- [x] 2.1 Confirm a settled block highlights after streaming and the final message shows full syntax highlighting; a settled block still re-highlights on content/language/theme change (not "exactly once forever").
- [x] 2.2 No change to throttle, streamdown block memoization, auto-scroll, or non-code rendering.

## 3. Verification
- [x] 3.1 Run `openspec validate optimize-chat-stream-code-highlighting --strict --no-interactive`.
- [x] 3.2 Run `bun run lint`, `bun run ts:check`, and `bun run architecture:check`.
- [ ] 3.3 Manual smoke: stream a response containing a long code block — no per-tick re-highlight flicker during streaming; final syntax-highlighted output appears after the block settles; plain-text streaming feels smoother.
