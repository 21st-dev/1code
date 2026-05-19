import type { BuiltinCommandAction, SlashCommandOption } from "./types"

/**
 * Prompt texts for prompt-based slash commands
 */
export const COMMAND_PROMPTS: Partial<
  Record<BuiltinCommandAction["type"], string>
> = {
  init: `Initialize this project for local coding agents.

Your task:
1. Inspect the repository structure and existing project instruction files first.
2. Check for AGENTS.md, CLAUDE.md, .claude/, .codex/, README, package/config files, and any existing contributor guidance.
3. If AGENTS.md and/or CLAUDE.md already exist, preserve them and only make narrow updates that are clearly needed.
4. If neither instruction file exists, create a concise AGENTS.md for Locus/Codex-style agents and a minimal CLAUDE.md that points Claude Code to the shared guidance when useful.

The output should help future local coding agents understand how to work in this repo.

Rules:
- Do not overwrite existing instructions wholesale.
- Keep guidance project-specific, short, and verifiable.
- Include setup, test, build, and safety notes only when the repo actually provides evidence for them.
- Prefer AGENTS.md as the shared cross-agent instruction file.
- Keep CLAUDE.md minimal if it can delegate to AGENTS.md.
- If you are in Plan mode or are unsure, propose the exact file changes before editing.

Now inspect the project and initialize or refine the project instruction files.`,
  doctor: `Run a read-only local diagnostics pass for this project and Locus agent workflow.

Your task:
1. Inspect the current project state without changing files.
2. Check git status, repository root, package manager files, available scripts, dependency/install hints, test/build commands, and obvious setup blockers.
3. Check for local agent instruction/config files such as AGENTS.md, CLAUDE.md, .claude/, .codex/, and .locus/worktree.json.
4. If relevant and safely available, inspect local Claude/Codex/MCP/plugin indicators from the project or user-visible config, but do not reveal secrets or tokens.
5. Separate findings into: OK, Warning, Broken/Blocked, and Suggested next actions.

Rules:
- Do not modify files.
- Do not run destructive commands.
- Do not print secrets, API keys, tokens, or full env values.
- Prefer lightweight commands first, such as pwd, git status --short, git rev-parse --show-toplevel, ls, package script inspection, and targeted config checks.
- If a command may be slow or risky, explain it instead of running it.

Now diagnose the local project and agent workflow health.`,
  diff: `Summarize the current working tree diff.

Your task:
1. Inspect git status for staged, unstaged, and untracked files.
2. Review the relevant diff summary and, when useful, targeted file diffs.
3. Explain what changed in plain language.
4. Call out behavioral risks, likely regressions, missing tests, and suggested verification.
5. Separate unrelated changes if the working tree appears mixed.

Rules:
- Do not modify files.
- Do not stage, commit, reset, checkout, or clean anything.
- Include untracked files in the summary, but do not dump huge file contents.
- If this is not a git repository, say so and summarize what can be inspected locally.

Now inspect and summarize the current changes.`,
  review:
    "Please review the code in the current context and provide feedback on code quality, potential bugs, and improvements.",
  "pr-comments":
    "Generate detailed PR review comments for the changes in the current context.",
  "release-notes":
    "Generate release notes summarizing the changes in this codebase.",
  "security-review":
    "Perform a security audit of the code in the current context. Identify vulnerabilities, security risks, and suggest fixes.",
  commit:
    "Закоммить это аккуратно, не трогая больше ничего. Сделай коммит только для staged изменений, не добавляй никакие другие файлы и не вноси дополнительных изменений.",
  "worktree-setup": `Create a worktree setup script for this project.

Your task:
1. Analyze the project to understand what's needed to set up a working copy
2. Create the file .locus/worktree.json with setup commands

The goal is to reproduce the EXACT same working state as the original repo in the new worktree.

Rules:
- Use only "setup-worktree" key (works on all platforms)
- Install dependencies using the project's package manager (check for bun.lockb, pnpm-lock.yaml, yarn.lock, package-lock.json)
- Copy ALL real env files that exist (.env, .env.local, .env.development, etc) - NOT example files
- Use $ROOT_WORKTREE_PATH to reference the main repo path
- Don't include build steps unless absolutely necessary for the project to work

Example output for .locus/worktree.json:
{
  "setup-worktree": [
    "bun install",
    "cp $ROOT_WORKTREE_PATH/.env .env",
    "cp $ROOT_WORKTREE_PATH/.env.local .env.local"
  ]
}

Now analyze this project and create .locus/worktree.json with the appropriate setup commands.`,
}

/**
 * Check if a command is a prompt-based command
 */
export function isPromptCommand(
  type: BuiltinCommandAction["type"],
): type is "init" | "doctor" | "diff" | "review" | "pr-comments" | "release-notes" | "security-review" | "commit" | "worktree-setup" {
  return type in COMMAND_PROMPTS
}

export function getBuiltinCommandPrompt(
  commandName: string,
  args = "",
): string | null {
  const commandKey = commandName.toLowerCase() as BuiltinCommandAction["type"]
  const prompt = COMMAND_PROMPTS[commandKey]
  if (!prompt) return null

  const trimmedArgs = args.trim()
  if (!trimmedArgs) return prompt

  return `${prompt}

Additional user instructions:
${trimmedArgs}`
}

/**
 * Built-in slash commands that are handled client-side
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  {
    id: "builtin:clear",
    name: "clear",
    command: "/clear",
    description: "Start a new conversation (creates new sub-chat)",
    category: "builtin",
  },
  {
    id: "builtin:plan",
    name: "plan",
    command: "/plan",
    description: "Switch to Plan mode (creates plan before making changes)",
    category: "builtin",
  },
  {
    id: "builtin:agent",
    name: "agent",
    command: "/agent",
    description: "Switch to Agent mode (applies changes directly)",
    category: "builtin",
  },
  {
    id: "builtin:compact",
    name: "compact",
    command: "/compact",
    description: "Compact conversation context to reduce token usage",
    category: "builtin",
  },
  // Prompt-based commands
  {
    id: "builtin:init",
    name: "init",
    command: "/init",
    description: "Initialize project instruction files for local agents",
    category: "builtin",
  },
  {
    id: "builtin:doctor",
    name: "doctor",
    command: "/doctor",
    description: "Diagnose local project and agent workflow health",
    category: "builtin",
  },
  {
    id: "builtin:diff",
    name: "diff",
    command: "/diff",
    description: "Summarize current working tree changes",
    category: "builtin",
  },
  {
    id: "builtin:review",
    name: "review",
    command: "/review",
    description: "Ask agent to review your code",
    category: "builtin",
  },
  {
    id: "builtin:pr-comments",
    name: "pr-comments",
    command: "/pr-comments",
    description: "Ask agent to generate PR review comments",
    category: "builtin",
  },
  {
    id: "builtin:release-notes",
    name: "release-notes",
    command: "/release-notes",
    description: "Ask agent to generate release notes",
    category: "builtin",
  },
  {
    id: "builtin:security-review",
    name: "security-review",
    command: "/security-review",
    description: "Ask agent to perform a security audit",
    category: "builtin",
  },
  {
    id: "builtin:commit",
    name: "commit",
    command: "/commit",
    description: "Commit staged changes carefully without touching anything else",
    category: "builtin",
  },
  {
    id: "builtin:worktree-setup",
    name: "worktree-setup",
    command: "/worktree-setup",
    description: "Generate worktree setup config with AI",
    category: "builtin",
  },
]

/**
 * Filter builtin commands by search text
 */
export function filterBuiltinCommands(
  searchText: string,
): SlashCommandOption[] {
  if (!searchText) return BUILTIN_SLASH_COMMANDS

  const query = searchText.toLowerCase()
  return BUILTIN_SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query),
  )
}
