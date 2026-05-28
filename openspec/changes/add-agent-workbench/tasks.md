## 1. Proposal and Scope
- [x] 1.1 Create the OpenSpec proposal, design, and requirements for the local Agent Workbench.
- [x] 1.2 Validate the OpenSpec change strictly.
- [x] 1.3 Commit the proposal as the first slice.

## 2. Main-Process Workbench Model
- [x] 2.1 Add task-summary types and status classification helpers.
- [x] 2.2 Add `agentWorkbench.listTasks` as a read-only aggregate query.
- [x] 2.3 Derive task cards from projects, chats, sub-chats, worktree metadata, git status, and PR metadata.
- [x] 2.4 Add focused tests for classification and filtering.
- [x] 2.5 Commit the main-process model slice.

## 3. Renderer Workbench Surface
- [x] 3.1 Add isolated `src/renderer/features/agents/workbench/` components and view helpers.
- [x] 3.2 Add filters for all, running, needs review, PRs, blocked, and clean.
- [x] 3.3 Add task cards with branch, project, latest sub-chat, diff count, PR status, and status reason.
- [x] 3.4 Wire a workbench entry point into the agents shell with minimal active-chat changes.
- [x] 3.5 Commit the renderer workbench slice.

## 4. Actions and Workflow Integration
- [x] 4.1 Wire Open/Continue to existing chat and sub-chat selection.
- [x] 4.2 Wire Review Diff to existing diff sidebar/filter behavior where available.
- [x] 4.3 Wire Open PR and Create PR through existing GitHub workflow surfaces and confirmations.
- [x] 4.4 Add disabled reasons for unavailable actions.
- [x] 4.5 Commit the action-integration slice.

## 5. Verification
- [x] 5.1 Run focused Bun tests.
- [x] 5.2 Run `bun run ts:check`.
- [x] 5.3 Run `bun run build`.
- [x] 5.4 Start the real desktop app/dev runtime.
- [x] 5.5 Perform real click and visual smoke checks for workbench filters, task cards, and safe actions.
- [x] 5.6 Fix findings and commit verification follow-ups if needed.
