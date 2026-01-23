import type { BuiltinCommandAction, SlashCommandOption } from "./types"

/**
 * Prompt texts for prompt-based slash commands
 */
export const COMMAND_PROMPTS: Partial<
  Record<BuiltinCommandAction["type"], string>
> = {
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
  init: `Initialize a CLAUDE.md file for this project.

Analyze the codebase structure and create a comprehensive CLAUDE.md file that includes:
1. Project overview - what the project does
2. Tech stack and dependencies
3. Key commands (build, test, run, lint)
4. Architecture overview with folder structure
5. Important files and their purposes
6. Code conventions and patterns used
7. Any environment setup requirements

Make the CLAUDE.md concise but informative, focusing on what an AI assistant needs to know to work effectively with this codebase.`,
  memory: `I want to save some information about this project for future reference.

Please help me create a memory/note about this project that captures:
- Key decisions made
- Important context
- Patterns or conventions to follow
- Any gotchas or things to remember

Ask me what specific information I'd like to remember, then format it clearly for future reference.`,
  think: `I need you to think deeply about this problem before responding.

Take your time to:
1. Understand the full context and requirements
2. Consider multiple approaches and their trade-offs
3. Identify potential edge cases and issues
4. Form a comprehensive plan before taking action

Please think step by step and explain your reasoning thoroughly.`,
  "worktree-setup": `Create a worktree setup script for this project.

Your task:
1. Analyze the project to understand what's needed to set up a working copy
2. Create the file .1code/worktree.json with setup commands

The goal is to reproduce the EXACT same working state as the original repo in the new worktree.

Rules:
- Use only "setup-worktree" key (works on all platforms)
- Install dependencies using the project's package manager (check for bun.lockb, pnpm-lock.yaml, yarn.lock, package-lock.json)
- Copy ALL real env files that exist (.env, .env.local, .env.development, etc) - NOT example files
- Use $ROOT_WORKTREE_PATH to reference the main repo path
- Don't include build steps unless absolutely necessary for the project to work

Example output for .1code/worktree.json:
{
  "setup-worktree": [
    "bun install",
    "cp $ROOT_WORKTREE_PATH/.env .env",
    "cp $ROOT_WORKTREE_PATH/.env.local .env.local"
  ]
}

Now analyze this project and create .1code/worktree.json with the appropriate setup commands.`,
}

/**
 * Check if a command is a prompt-based command
 */
export function isPromptCommand(
  type: BuiltinCommandAction["type"],
): type is "review" | "pr-comments" | "release-notes" | "security-review" | "commit" | "worktree-setup" | "init" | "memory" | "think" {
  return type in COMMAND_PROMPTS
}

/**
 * Built-in slash commands that are handled client-side
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  // UI commands
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
  {
    id: "builtin:help",
    name: "help",
    command: "/help",
    description: "Show available commands and their descriptions",
    category: "builtin",
  },
  {
    id: "builtin:config",
    name: "config",
    command: "/config",
    description: "Open settings and configuration",
    category: "builtin",
  },
  {
    id: "builtin:bug",
    name: "bug",
    command: "/bug",
    description: "Report a bug or issue",
    category: "builtin",
  },
  {
    id: "builtin:cost",
    name: "cost",
    command: "/cost",
    description: "Show token usage for current session",
    category: "builtin",
  },
  // Prompt-based commands
  {
    id: "builtin:init",
    name: "init",
    command: "/init",
    description: "Initialize CLAUDE.md for this project",
    category: "builtin",
  },
  {
    id: "builtin:memory",
    name: "memory",
    command: "/memory",
    description: "Save project information for future reference",
    category: "builtin",
  },
  {
    id: "builtin:think",
    name: "think",
    command: "/think",
    description: "Ask agent to think deeply before responding",
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
