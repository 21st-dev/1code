# Design: Optimize chat-stream code highlighting (phase 3c)

Independent renderer perf fix. No dependency on the Details sidebar or right-side phases.

## Context

- `CodeBlock` (in `chat-markdown-renderer.tsx`) highlights via an async `highlightCode` (Shiki) in a `useEffect` whose deps include `children` (the code text).
- The chat uses `useChat` with `experimental_throttle: 50`; `streamdown` re-renders the active (last) block each tick with `parseIncompleteMarkdown={isStreaming}`. So a streaming code block's `children` grows every ~50ms → Shiki re-highlights the whole growing block each tick (`O(N²)` + async HTML swap/reflow).
- `createCodeComponent` already receives `isStreaming`, but `CodeBlock` does not yet accept it, and the main message path does not thread it: `MemoizedTextPart` renders `<MemoizedMarkdown>` without `isStreaming` (`memoized-text-part.tsx:122`), and `MemoizedMarkdown` → `MemoizedMarkdownBlock` does not pass it. So this change is mostly adding/passing the prop + an effect gate, not new infrastructure.
- "Highlight after settle" must not be implemented as "highlight exactly once forever": theme switch, content change, and React StrictMode double-invoke must still produce a correct final highlight.

## Goals / Non-Goals

- Goals: remove the per-tick Shiki re-highlight on streaming code; keep the final highlighted result; no behavior change for non-code or completed content.
- Non-goals: throttle changes, block-memoization changes, auto-scroll, widget-query lazy-load.

## Decisions

### 1. Defer highlight until the block is settled
- While the code block is still streaming (incomplete fence / message not yet stable), render it as **plain escaped text** (no Shiki). The component already falls back to `escapeHtml(children)` when `highlightedHtml` is null — reuse that path during streaming.
- Run Shiki once: when the block is complete (fence closed / message reaches a stable/ready state). Alternatively, a trailing debounce (~150–250ms) if a definitive completeness signal is awkward — but the completeness signal is preferred (deterministic, one highlight per block).

### 2. Preserve the final result
- After settling, highlight as today; the highlighted HTML replaces the plain text once. No loss of syntax highlighting in the final rendered message.

### 3. Scope discipline
- Only the `CodeBlock` highlight trigger changes. No change to throttle, streamdown block model, auto-scroll, or any non-code rendering.

## Risks / Trade-offs

- A single highlight swap when the block settles is an acceptable one-time transition (plain → highlighted), far cheaper than re-highlighting every tick.
- Determining "block complete" mid-stream: prefer the existing streaming/`parseIncompleteMarkdown` signal; if a block can be the last incomplete block, treat it as streaming until the message is no longer streaming.
- Very long completed code still highlights once at the end (unavoidable and cheap relative to per-tick).

## Migration / Sequencing

- Single-file change in `chat-markdown-renderer.tsx`; independent of all other phases.
