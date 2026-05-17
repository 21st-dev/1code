---
name: skill-creator
description: Create new skills or improve existing SKILL.md packages. Use when the user wants to turn a repeated workflow into a reusable skill, draft a new skill, refine trigger descriptions, evaluate whether a skill should exist, or package instructions for Claude, Codex, or another SKILL.md-compatible agent.
---

# Skill Creator

Use this skill to turn repeated agent workflows into small, maintainable skill packages. Favor a simple, useful skill over a large framework.

## Capture Intent

Start by understanding what the skill should make easier:

1. What should the skill help the agent do?
2. When should it trigger?
3. What inputs does it need?
4. What output should it produce?
5. Does it need scripts, references, assets, or can it be a single `SKILL.md`?
6. Which runtime should load it: Claude, Codex, or both?

If the conversation already contains the workflow, extract the sequence first and ask the user only about missing pieces.

## Recommended Package Shape

Use this structure unless there is a clear reason to add more:

```text
skill-name/
├── SKILL.md
├── scripts/
├── references/
└── assets/
```

Only create `scripts/`, `references/`, or `assets/` when they remove real repeated work. A lightweight skill should usually start with just `SKILL.md`.

## Write The Skill

`SKILL.md` should include YAML frontmatter:

```markdown
---
name: skill-name
description: Clear trigger description. Include what the skill does and when it should be used.
---
```

Then write concise instructions:

- Use imperative steps.
- Keep the main file focused.
- Explain why constraints matter when they are not obvious.
- Point to specific reference files only when needed.
- Avoid broad "always/never" rules unless they prevent a real failure mode.
- Avoid hidden side effects, network calls, or filesystem writes that would surprise the user.

## Trigger Description

The description is the main trigger surface. Make it specific enough that the agent uses the skill for the right tasks and ignores it for adjacent work.

Good descriptions include:

- The core action.
- The context where it applies.
- Important exclusions if it might be confused with another skill.
- Runtime or dependency requirements if relevant.

## Test The Skill

Before calling the skill done, create 2-3 realistic prompts:

```json
[
  {
    "prompt": "User-style request that should trigger the skill",
    "expected": "What a good output should contain"
  }
]
```

Run through the prompts mentally or with the target agent if available. Look for:

- Does the skill trigger for the right task?
- Does it add useful behavior compared with a normal prompt?
- Does it avoid over-triggering?
- Does it produce work the user can verify?

## Improve Existing Skills

When improving a skill:

1. Preserve the existing `name` unless the user explicitly wants a rename.
2. Identify the failure mode: under-triggering, over-triggering, vague output, missing reference, unsafe side effect, or too much context.
3. Make the smallest change that fixes the failure.
4. Re-run the same test prompts before adding new ones.

## Installation Guidance

For Claude Code, user skills usually install under `~/.claude/skills/<skill-name>/SKILL.md`.

For Codex, user skills usually install under `~/.codex/skills/<skill-name>/SKILL.md`.

If the host app has a verified registry installer, prefer it over manual copying so hashes, backups, and runtime status stay accurate.
