# Change: Optimize chat-stream code highlighting (phase 3c)

## Why

Streaming chat output feels janky when a response contains a code block. The code block's Shiki highlight effect re-runs on every change to its content (`src/renderer/components/chat-markdown-renderer.tsx:62`, effect deps include `children`). While a code block is streaming, its text grows on every throttled tick (`experimental_throttle: 50`), so Shiki re-highlights the entire growing block every ~50ms — `O(N²)` highlight work plus repeated async HTML swaps and reflows. For long code blocks this is visible stutter/flicker.

This is an independent chat-stream rendering fix. It does not depend on the Details sidebar work, and per review it is scoped to the Shiki streaming behavior only — widget-query lazy-load is explicitly out (no profile shows it as the same jank source).

## What Changes

- Defer Shiki highlighting while a code block is still streaming: render the block as plain escaped text during streaming, and run Shiki once the block settles (fence closed / message no longer streaming), or via a trailing debounce.
- "Don't re-run per streaming tick" — **not** "highlight exactly once forever": a settled block may still re-highlight when its content, language, or the active theme changes (and React StrictMode double-invoke must remain correct).
- Preserve the final highlighted result (no loss of syntax highlighting once the block settles).
- No change to the streaming throttle, the markdown block model, or any non-code rendering.

## Impact

- Affected specs: `chat-stream-rendering` (new)
- Baseline: `main` (`a90e2a9`).
- Affected code:
  - `src/renderer/components/chat-markdown-renderer.tsx` — `createCodeComponent` already receives `isStreaming`, but `CodeBlock` does not yet accept it, and the main message path does not thread it: `MemoizedTextPart` calls `<MemoizedMarkdown>` without `isStreaming` (`memoized-text-part.tsx:122`), and `MemoizedMarkdown` → `MemoizedMarkdownBlock` does not pass it down. Add/pass `isStreaming` through `MemoizedTextPart → MemoizedMarkdown → MemoizedMarkdownBlock → CodeBlock`, then gate the `CodeBlock` highlight effect on it.
  - Thread it **without busting block memoization** of already-settled blocks (only the active/streaming block should change behavior).
- Non-goals:
  - Widget-query lazy-load or any Details/right-side perf — separate, pending a profile.
  - No change to throttle value, block memoization, auto-scroll, or non-code rendering.
