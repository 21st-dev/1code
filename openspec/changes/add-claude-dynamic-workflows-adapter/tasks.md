## 1. Proposal
- [x] 1.1 Review this proposal against `add-headless-agent-jobs` and confirm the adapter remains Claude-specific.
- [x] 1.2 Validate the OpenSpec change strictly.
- [ ] 1.3 Get approval before implementing product code.

## 2. Runtime Support and Settings
- [ ] 2.1 Add Claude workflow support detection for bundled Claude Code version and workflow disablement state.
- [ ] 2.2 Add local setting resolution for `off`, `ask`, and `allow`, defaulting to `ask`.
- [ ] 2.3 Inject `CLAUDE_CODE_DISABLE_WORKFLOWS=1` when workflows are off or unsupported.
- [ ] 2.4 Expose workflow support/status to the renderer without exposing provider secrets.

## 3. Claude Router Integration
- [ ] 3.1 Intercept `Workflow` tool calls in the Claude `canUseTool` path.
- [ ] 3.2 Emit workflow approval requests when the setting is `ask`.
- [ ] 3.3 Persist or cache "always for this project/workflow" decisions in local app state without storing scripts or provider secrets.
- [ ] 3.4 Deny workflow launch with clear messages when disabled, unsupported, timed out, or blocked by mode/guard constraints.
- [ ] 3.5 Verify Plan mode and guarded-run behavior cannot be bypassed by workflow-spawned tool calls; disable workflows in unsafe modes if necessary.

## 4. Event Normalization
- [ ] 4.1 Add workflow event chunk types shared between main and renderer.
- [ ] 4.2 Normalize Claude workflow/background task system messages into workflow-started, workflow-updated, workflow-finished, and workflow-error events.
- [ ] 4.3 Preserve unknown workflow events safely for diagnostics without breaking the chat stream.
- [ ] 4.4 Keep workflow events separate from future Locus job events.

## 5. Renderer UX
- [ ] 5.1 Add a workflow approval card with Once, Always, and Deny actions.
- [ ] 5.2 Add a compact running workflow card in the assistant message stream.
- [ ] 5.3 Show final, failed, canceled, and unsupported states.
- [ ] 5.4 Wire Stop to the existing Claude cancellation path.
- [ ] 5.5 Add Dynamic Workflows settings copy and controls in the Claude runtime settings area.
- [ ] 5.6 Update i18n strings in English and Simplified Chinese.

## 6. Slash Command and Command Guide
- [ ] 6.1 Prevent Locus slash-command expansion from consuming Claude-owned workflow commands.
- [ ] 6.2 Show Claude dynamic workflow commands in command guidance as runtime-owned, research-preview commands when detected.
- [ ] 6.3 Keep `/effort ultracode` out of primary controls unless the advanced/runtime-command surface is opened.

## 7. Tests and Verification
- [ ] 7.1 Add tests for workflow support detection and disable environment injection.
- [ ] 7.2 Add tests for `Workflow` approval allow/deny/timeout behavior.
- [ ] 7.3 Add transformer tests for workflow system event normalization.
- [ ] 7.4 Add renderer tests or focused component checks for workflow cards.
- [ ] 7.5 Run `openspec validate add-claude-dynamic-workflows-adapter --strict --no-interactive`.
- [ ] 7.6 Run focused Bun tests.
- [ ] 7.7 Run `bun run ts:check`.
- [ ] 7.8 Run `bun run build`.
- [ ] 7.9 Smoke test a small read-only workflow prompt with a real Claude Code credential and record whether workflow progress, approval, stop, and final output behave as specified.
