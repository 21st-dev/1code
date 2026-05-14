---
name: verification-before-completion
description: General completion checklist that requires evidence before claiming work is done, fixed, passing, or ready.
---

Use this skill before saying work is complete, fixed, passing, reviewed, or ready to merge.

Principle:
- Evidence before claims.
- If verification was not run, say so directly.

Checklist:
1. Identify what changed.
   - Files changed.
   - Behavior changed.
   - User-visible impact.
   - Data, auth, filesystem, network, or command-execution impact.

2. Choose targeted verification.
   - Use the smallest meaningful check first.
   - Prefer repo-native commands from `package.json`, build scripts, test docs, CI config, or project guidance.
   - Include formatting or whitespace checks when files were edited.
   - For frontend changes, verify the UI path when feasible.
   - For security-sensitive changes, verify secrets are not logged or exposed.

3. Run checks.
   - Record exact commands.
   - Note pass/fail.
   - Preserve the important failure lines.
   - If a command hangs, state where it hung and what remains unknown.

4. Inspect the diff.
   - Confirm the diff only includes intended changes.
   - Confirm no secrets, generated junk, debug logs, or unrelated edits were added.
   - Respect unrelated user-owned dirty files.

5. Summarize truthfully.
   - "Verified with ..." when checks ran and passed.
   - "Not verified ..." when checks were skipped, unavailable, or failed.
   - Mention remaining risk when there is meaningful uncertainty.

Recommended command categories:
- Static checks: typecheck, lint, format check.
- Tests: focused test first, then broader tests when risk justifies it.
- Build: only when the change needs build-level confidence.
- Runtime smoke: for UI, CLI, provider, database, or integration behavior.
- Diff hygiene: `git diff --check` where available.

Output format:
- Changes
- Verification run
- Result
- Not verified
- Residual risk

Default stance:
- Do not claim success from intuition.
- A clean explanation of unverified risk is better than a false pass.
