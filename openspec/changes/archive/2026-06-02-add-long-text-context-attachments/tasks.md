## 1. Model and Storage
- [x] 1.1 Define shared long text attachment metadata and message part types.
- [x] 1.2 Add a main-process staging helper/router with app-managed storage, opaque refs, and filename normalization.
- [x] 1.3 Enforce single-attachment and aggregate-per-send limits.
- [x] 1.4 Ensure logs include only ids, filenames, and byte counts, not full text bodies.

## 2. Renderer Input and Persistence
- [x] 2.1 Convert large pasted text into pending long text attachment metadata.
- [x] 2.2 Render removable pending long text context cards in new-chat and active-chat inputs.
- [x] 2.3 Preserve long text attachment metadata through drafts, queue items, force-send, auth retry, and rollback restore.
- [x] 2.4 Persist sent user messages with metadata parts, not full long text bodies.
- [x] 2.5 Keep legacy `pasted:` and `chatHistory:` mention rendering for old messages.

## 3. Runtime Send Pipeline
- [x] 3.1 Pass long text attachment refs from renderer transports to main-process chat routers.
- [x] 3.2 Resolve and inject long text prompt blocks in the Claude Code route.
- [x] 3.3 Resolve and inject long text prompt blocks in the Codex route.
- [x] 3.4 Keep provider-profile/custom-provider paths on the same resolved prompt text.
- [x] 3.5 Block send with a visible error if any attachment cannot be resolved or the aggregate limit is exceeded.

## 4. Cleanup and Error Handling
- [x] 4.1 Remove pending refs when the user deletes a pending long text card.
- [x] 4.2 Add a cleanup path for unreferenced staged long text attachments.
- [x] 4.3 Handle missing attachment bytes in old drafts or restored sessions without crashing.

## 5. Verification
- [x] 5.1 Unit-test attachment staging, size limits, and prompt-block construction.
- [x] 5.2 Verify `>5KB` pasted text becomes metadata-backed context and does not enter the editor body.
- [x] 5.3 Verify oversize text is blocked and not silently truncated.
- [x] 5.4 Verify persisted message JSON does not contain the full long text body.
- [x] 5.5 Verify Claude Code receives the resolved attached text block.
- [x] 5.6 Verify Codex receives the resolved attached text block.
- [x] 5.7 Verify queue/auth-retry paths preserve metadata and still resolve text at send time.
- [x] 5.8 Run `bunx openspec validate add-long-text-context-attachments --strict --no-interactive`.
