---
name: find-skills
description: Find, compare, and recommend agent skills to install or use. Use when the user asks to discover useful skills, compare skill collections, decide which skills are worth installing, or choose a small high-value shortlist instead of a broad bundle.
---

# Find Skills

Use this skill to help the user discover skills without turning the session into a broad package hunt. The goal is to identify a few high-value skills that match the user's actual stack and workflow.

## Workflow

1. Clarify the target only when it is genuinely unclear:
   - Current repo or technology stack.
   - Task type: debugging, UI, security, docs, database, deployment, agent workflows, or skill authoring.
   - Target runtime: Claude, Codex, or both.

2. Inventory local and registry skills first:
   - User Claude skills usually live in `~/.claude/skills/<skill-name>/SKILL.md`.
   - User Codex skills usually live in `~/.codex/skills/<skill-name>/SKILL.md`.
   - Registry skills may already be installable in the host app. Prefer those before asking the user to copy random GitHub content.

3. Evaluate candidates:
   - Prefer official or well-maintained single skills before large generic bundles.
   - Treat third-party collections as directories to cherry-pick from, not bundles to install wholesale.
   - Check whether the source has real `SKILL.md` files, useful bundled resources, recent maintenance, a clear license, and install instructions.
   - Be cautious with skills that run scripts, add hooks, write telemetry, or modify global agent configuration.

4. Recommend conservatively:
   - Give a concrete verdict.
   - Prefer 1-3 best-fit skills over a long list.
   - Say which candidates are already installed.
   - Explain the practical use case for each recommendation.

5. Before installation:
   - Ask for confirmation unless the user has already explicitly said to install.
   - If the host app supports verified registry installation, use that instead of manual filesystem copying.
   - After installation, verify the directory tree and `SKILL.md` frontmatter.
   - Tell the user whether they need to restart the target CLI/app before new skills load.

## Output Style

Keep the recommendation decision-oriented:

```text
Best matches:
1. skill-name - why it fits
2. skill-name - why it fits

Already installed:
- skill-name

Recommendation:
Install X, skip Y for now because ...
```

If no new skill is worth installing, say that directly.
