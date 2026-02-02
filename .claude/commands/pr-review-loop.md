# PR Review Loop Command

**Command**: `/pr-review-loop`
**Description**: Automated continuous PR review monitoring and fixing workflow
**Category**: Development Workflow
**Model**: sonnet (for plan mode compatibility)

---

## Overview

This command implements an automated loop that:
1. Monitors a PR for new review comments
2. Validates comments and creates implementation plans
3. Implements approved fixes
4. Commits and pushes changes
5. Waits 10 minutes before checking again

The loop continues indefinitely until manually stopped or the PR is closed.

---

## Usage

```
/pr-review-loop [pr-number]
```

**Arguments**:
- `pr-number` (optional): The PR number to monitor. If not provided, uses the current branch's PR.

**Examples**:
```
/pr-review-loop 9
/pr-review-loop
```

---

## Workflow Steps

### Phase 1: Retrieve Latest Comments (5-10 seconds)

1. **Fetch PR data** using `gh pr view [number] --json comments,reviews,url,title,body,updatedAt`
2. **Create review snapshot** in workspace:
   - File: `.ii/workspaces/{workspace_id}/pr-review-{number}-{timestamp}.md`
   - Include: All comments, reviews, URLs, timestamps
   - Pipe raw JSON output directly into file for reference

3. **Parse and validate comments**:
   - Extract actionable feedback
   - Identify security issues (P1)
   - Identify bugs and improvements (P2)
   - Filter out non-actionable comments (questions, praise, etc.)

4. **Create prioritized issue list**:
   - Mark each comment as: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, or `INFO_ONLY`
   - Add validity assessment: `VALID`, `NEEDS_CLARIFICATION`, `INVALID`, `ALREADY_FIXED`
   - Add action status: `TODO`, `IN_PROGRESS`, `DONE`, `WONT_FIX`

5. **Update review document** with analysis:
   ```markdown
   # PR Review Analysis: PR #{number}

   **Retrieved**: {timestamp}
   **Last Updated**: {pr.updatedAt}
   **Total Comments**: {count}
   **Actionable Issues**: {count}

   ## Summary
   - Critical Issues: {count}
   - High Priority: {count}
   - Medium Priority: {count}
   - Low Priority: {count}
   - Informational: {count}

   ## Actionable Issues

   ### CRITICAL - Must Fix Immediately
   1. [VALID] [TODO] Comment by @user at file.ts:123
      - Issue: {description}
      - Impact: {impact}
      - Fix Required: {yes/no}

   ### HIGH - Should Fix Soon
   ...

   ### MEDIUM - Can Fix Later
   ...

   ### LOW - Nice to Have
   ...

   ## Non-Actionable Comments
   - [INFO_ONLY] Comment by @user: {text}
   - [ALREADY_FIXED] Comment by @user: Fixed in commit {sha}
   ```

### Phase 2: Enter Plan Mode (User Approval Required)

1. **Present findings to user**:
   ```
   📋 Found {count} actionable issues in PR #{number}:
   - {critical_count} CRITICAL
   - {high_count} HIGH PRIORITY
   - {medium_count} MEDIUM PRIORITY
   - {low_count} LOW PRIORITY

   Review document created: pr-review-{number}-{timestamp}.md

   Entering plan mode to design fixes...
   ```

2. **Enter plan mode** using `EnterPlanMode` tool

3. **In plan mode**:
   - Read the review document
   - Validate each issue's legitimacy
   - Design implementation approach for valid issues
   - Create phased implementation plan:
     - Phase 1: Critical security issues
     - Phase 2: High-priority bugs
     - Phase 3: Medium-priority improvements
     - Phase 4: Low-priority enhancements
   - Estimate effort and complexity
   - Identify dependencies between fixes
   - Write plan to plan file

4. **Exit plan mode** and present plan to user for approval

5. **User decision point**:
   - ✅ **Approve**: Proceed to Phase 3 (Implementation)
   - ❌ **Reject**: Skip to Phase 4 (Wait and repeat)
   - 🔄 **Revise**: Return to plan mode with feedback

### Phase 3: Implementation (After User Approval)

1. **Create todo list** from approved plan:
   ```typescript
   TodoWrite({
     todos: [
       { content: "Fix P1-1: Security issue in file.ts", status: "pending", activeForm: "Fixing P1-1" },
       { content: "Fix P1-2: Another security issue", status: "pending", activeForm: "Fixing P1-2" },
       // ... all planned fixes
       { content: "Commit and push changes", status: "pending", activeForm: "Committing changes" },
     ]
   })
   ```

2. **Execute implementation**:
   - Work through todos in priority order
   - Mark each as `in_progress` before starting
   - Mark as `completed` after finishing
   - Handle errors gracefully (mark as `pending` with notes)

3. **Run implementation** (same approach as previous session):
   - Use multiple parallel agents for independent fixes
   - Group related fixes by file/feature
   - Ensure TypeScript compilation passes
   - Preserve old code as comments for rollback

4. **Verify changes**:
   - Run `git status` to see changed files
   - Run `git diff` to review changes
   - Ensure no unintended modifications

### Phase 4: Commit and Push

1. **Stage changes**:
   ```bash
   git add [files]
   ```

2. **Create descriptive commit message**:
   ```
   fix(scope): address PR #{number} review comments

   This commit addresses {count} issues identified in PR review:

   ## Critical Fixes (P1)
   - Fix 1: {description}
   - Fix 2: {description}

   ## High Priority Fixes (P2)
   - Fix 3: {description}
   - Fix 4: {description}

   ## Related
   - PR: #{number}
   - Review: pr-review-{number}-{timestamp}.md

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```

3. **Commit and push**:
   ```bash
   git commit -m "{message}"
   git push origin {branch}
   ```

4. **Create follow-up comment on PR** (optional):
   ```bash
   gh pr comment {number} --body "✅ Addressed {count} review comments in commit {sha}:
   - Fixed: {list of issues}

   Changes pushed to {branch}. Ready for re-review."
   ```

### Phase 5: Wait and Monitor

1. **Inform user**:
   ```
   ✅ Changes committed and pushed.

   Waiting 10 minutes before checking for new comments...
   Press Ctrl+C to stop the loop.
   ```

2. **Sleep for 10 minutes**:
   ```bash
   sleep 600
   ```
   - Use timeout of 610 seconds (10 min 10 sec) to allow for graceful completion
   - This allows manual interruption if needed

3. **After sleep, check for updates**:
   ```bash
   gh pr view {number} --json updatedAt
   ```
   - Compare `updatedAt` with previous timestamp
   - If changed, proceed to Phase 1
   - If unchanged, sleep again (exponential backoff optional)

4. **Loop back to Phase 1**

---

## Implementation Instructions

### For Claude Agent

When this command is invoked, you should:

1. **Parse the PR number**:
   - If provided as argument, use it
   - If not provided, detect from current branch: `gh pr list --head $(git branch --show-current) --json number`

2. **Initialize loop state**:
   - Store PR number, branch name, workspace ID
   - Create initial review document
   - Track last check timestamp

3. **Execute loop**:
   ```
   LOOP:
     Phase 1: Retrieve and analyze comments
     Phase 2: Enter plan mode (wait for user approval)
     IF user approves plan:
       Phase 3: Implement fixes
       Phase 4: Commit and push
     Phase 5: Sleep 10 minutes
     GOTO LOOP
   ```

4. **Handle interruptions**:
   - If user cancels (Ctrl+C during sleep), exit gracefully
   - If PR is closed/merged, exit with message
   - If git push fails, ask user for guidance

5. **State management**:
   - Each iteration creates new review document with timestamp
   - Track which comments have been addressed (by commit SHA)
   - Don't re-fix already fixed issues

### Review Document Format

**File**: `.ii/workspaces/{workspace_id}/pr-review-{number}-{timestamp}.md`

```markdown
# PR Review: #{number} - {title}

**Retrieved**: {ISO timestamp}
**PR Last Updated**: {ISO timestamp}
**Branch**: {branch}
**URL**: {url}

---

## Raw Data (for reference)

<details>
<summary>Click to expand raw JSON</summary>

```json
{raw gh pr view output}
```

</details>

---

## Analysis

### Summary

| Category | Count |
|----------|-------|
| Total Comments | {n} |
| Critical Issues | {n} |
| High Priority | {n} |
| Medium Priority | {n} |
| Low Priority | {n} |
| Informational | {n} |

### Issues by Priority

#### CRITICAL (P1) - {count}

##### Issue 1: {title}
- **File**: {file}:{line}
- **Author**: @{username}
- **Posted**: {timestamp}
- **Validity**: VALID | NEEDS_CLARIFICATION | INVALID | ALREADY_FIXED
- **Status**: TODO | IN_PROGRESS | DONE | WONT_FIX
- **Priority**: CRITICAL
- **Impact**: {description}

**Comment**:
> {original comment text}

**Analysis**:
{your analysis of whether this needs fixing, why, and how}

**Fix Required**: YES | NO | MAYBE

**Fix Approach** (if applicable):
{brief description of how to fix}

---

#### HIGH (P2) - {count}

... same format ...

---

#### MEDIUM (P3) - {count}

... same format ...

---

#### LOW (P4) - {count}

... same format ...

---

### Non-Actionable Comments

#### Informational
- Comment by @user: {text}

#### Already Fixed
- Comment by @user: Fixed in commit {sha}

#### Invalid/Not Applicable
- Comment by @user: {reason why not applicable}

---

## Previous Iterations

### Iteration 1 - {timestamp}
- Issues Found: {n}
- Issues Fixed: {n}
- Commit: {sha}

### Iteration 2 - {timestamp}
...

```

---

## Safety Mechanisms

### Rate Limiting
- Minimum 10 minutes between iterations
- Maximum 6 iterations per hour
- Exponential backoff if no changes detected

### Error Handling
- If `gh` command fails, retry once, then skip iteration
- If TypeScript compilation fails, stop and ask user
- If git push fails, stop and ask user
- If plan is rejected, skip implementation and wait

### User Control
- User can stop loop at any time (Ctrl+C)
- User must approve each plan before implementation
- User can choose to skip iterations

### Conflict Detection
- Before each iteration, check for local uncommitted changes
- If found, ask user to commit or stash before continuing
- Check if branch has diverged from remote

---

## Example Session

```
User: /pr-review-loop 9
Agent: 🔄 Starting PR Review Loop for PR #9

[Phase 1: Retrieve Comments]
Fetching PR data...
✅ Retrieved 36 comments and 2 reviews
Created review document: pr-review-9-2026-02-02T12-30-00.md

Analysis:
- 3 CRITICAL issues (P1)
- 10 HIGH priority issues (P2)
- 15 MEDIUM priority issues (P3)
- 8 LOW priority issues (P4)

[Phase 2: Plan Mode]
📋 Entering plan mode to design fixes for 28 actionable issues...

[Plan created - waiting for user approval]

User: Approve

Agent: ✅ Plan approved. Proceeding with implementation...

[Phase 3: Implementation]
Starting implementation with 5 parallel agents...
- Agent 1: P1 security fixes (files: security-utils.ts, command-executor.ts)
- Agent 2: P1 path traversal (files: file-utils.ts)
- Agent 3: P2 backend fixes (files: command-executor.ts, speckit.ts)
- Agent 4: P2 frontend memory leaks (files: use-command-output.ts)
- Agent 5: P2 frontend state bugs (files: 8 component files)

✅ All agents completed successfully
✅ TypeScript compilation: PASSING

[Phase 4: Commit and Push]
Staging 12 files...
Creating commit message...
✅ Committed: 035ba37
✅ Pushed to origin/001-speckit-ui-integration

💬 Posted comment on PR #9: "Addressed 28 review comments in commit 035ba37"

[Phase 5: Wait]
✅ Iteration 1 complete. Fixed 28 issues.

⏳ Waiting 10 minutes before next check...
Press Ctrl+C to stop the loop.

[10 minutes later...]

[Phase 1: Retrieve Comments]
Checking for new comments...
✅ PR updated: 2 new comments found
Created review document: pr-review-9-2026-02-02T12-40-00.md

Analysis:
- 0 CRITICAL issues
- 1 HIGH priority issue (P2)
- 1 MEDIUM priority issue (P3)

[Phase 2: Plan Mode]
📋 Entering plan mode...

...and so on...
```

---

## Configuration Options

The command supports these optional configurations:

### Environment Variables

Set in your shell before running:

```bash
export PR_REVIEW_LOOP_INTERVAL=600        # Seconds between checks (default: 600)
export PR_REVIEW_LOOP_MAX_ITERATIONS=100   # Max iterations before auto-stop (default: unlimited)
export PR_REVIEW_LOOP_AUTO_APPROVE=false   # Skip plan approval (DANGEROUS, default: false)
export PR_REVIEW_LOOP_VERBOSE=true         # Detailed logging (default: false)
```

### Inline Options

Pass options with the command:

```
/pr-review-loop 9 --interval=300 --max-iterations=10 --verbose
```

---

## Stopping the Loop

### Manual Stop
- Press `Ctrl+C` during the sleep phase
- Send `SIGTERM` to the process
- Close the terminal/session

### Automatic Stop Conditions
- PR is closed or merged
- Maximum iterations reached (if configured)
- Consecutive errors exceed threshold (3)
- No changes detected for 1 hour (exponential backoff)

### Graceful Shutdown
When stopped, the agent will:
1. Finish current phase (if mid-implementation)
2. Commit any pending changes (if user approves)
3. Save state to resume later
4. Create final report summarizing all iterations

---

## State Persistence

The loop maintains state across sessions in:

```
.ii/workspaces/{workspace_id}/pr-review-loop-state.json
```

**State includes**:
- PR number and branch
- Last check timestamp
- Iteration count
- Fixed issues (by commit SHA)
- Pending issues
- Error history

**Resume command**:
```
/pr-review-loop-resume 9
```

This continues from the last saved state.

---

## Advanced Features

### Smart Comment Tracking

The agent tracks which comments have been addressed:

```json
{
  "pr": 9,
  "comments": {
    "IC_kwDOQ9wyV87kgEht": {
      "status": "fixed",
      "commit": "035ba37",
      "iteration": 1,
      "timestamp": "2026-02-02T12:35:00Z"
    }
  }
}
```

This prevents re-fixing already addressed issues.

### Exponential Backoff

If no new comments are found:
- Iteration 1-3: 10 minutes
- Iteration 4-6: 20 minutes
- Iteration 7-9: 30 minutes
- Iteration 10+: 60 minutes (max)

Reset to 10 minutes when new comments appear.

### Batch Processing

If many issues are found (>20), offer to batch them:

```
Found 45 issues. Process as:
1. All at once (may take 2-3 hours)
2. Batch by priority (P1 first, then P2, etc.)
3. Batch by file/feature (related changes together)

Choose option:
```

---

## Error Recovery

### Compilation Errors
If TypeScript compilation fails:
1. Show errors to user
2. Ask: Retry fix | Skip this iteration | Stop loop
3. If retry: Create new plan focusing on errors

### Git Conflicts
If push fails due to conflicts:
1. Fetch latest changes
2. Attempt rebase
3. If conflicts, ask user to resolve manually
4. Pause loop until resolved

### API Rate Limits
If GitHub API rate limit hit:
1. Calculate time until reset
2. Sleep until reset + 1 minute
3. Resume loop

---

## Best Practices

### When to Use
✅ During active code review phase
✅ When expecting multiple review rounds
✅ For large PRs with many reviewers
✅ When working across timezones

### When NOT to Use
❌ For PRs with <5 comments
❌ When rapid iteration is needed (use manual workflow)
❌ During active development (conflicts likely)
❌ When PR is nearly ready to merge

### Tips
- Run in a dedicated terminal window
- Use tmux/screen for persistence
- Monitor the first 2-3 iterations manually
- Set reasonable max iterations
- Keep PR focused to minimize comment churn

---

## Troubleshooting

### Loop Not Starting
- Check PR number exists: `gh pr view 9`
- Verify gh CLI authentication: `gh auth status`
- Ensure on correct branch: `git branch --show-current`

### Changes Not Pushing
- Check git credentials
- Verify branch is not protected
- Check for uncommitted local changes

### Too Many Iterations
- Increase sleep interval
- Set max iterations limit
- Check if comments are being properly marked as fixed

### Plan Always Rejected
- Review plan quality
- Check if issues are actually valid
- Consider manual workflow for complex scenarios

---

## Related Commands

- `/pr-review` - One-time PR review (no loop)
- `/fix-review-comments` - Implement specific comment fixes
- `/pr-status` - Check current PR status
- `/pr-review-loop-resume` - Resume stopped loop

---

**Created**: 2026-02-02
**Version**: 1.0
**Model Required**: sonnet (for plan mode support)
**Experimental**: Yes - monitor first few iterations closely
