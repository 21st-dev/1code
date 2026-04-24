import type { AgentModel } from "./agent-utils"

/**
 * CLI-parity built-in subagents.
 *
 * The Claude Code CLI ships built-in subagents, but
 * `@anthropic-ai/claude-agent-sdk` does NOT — the SDK requires every subagent
 * to be declared via `options.agents`. This constant restores parity so that
 * Claude running inside the 1Code app can invoke the same subagent_types
 * (Explore, Plan, general-purpose, etc.) as CLI users.
 *
 * `buildAgentsOption()` in agent-utils.ts seeds this object first, then
 * overlays user/project/plugin-defined agents — so a user-authored `Explore.md`
 * correctly overrides the built-in (matches CLI behavior).
 *
 * Official sources:
 * - https://code.claude.com/docs/en/sub-agents
 * - https://code.claude.com/docs/en/agent-sdk/subagents
 *
 * Caveat: Anthropic's docs only formally document `general-purpose`, `Explore`,
 * `Plan`, and `statusline-setup` as built-ins. Their exact system prompts and
 * tool restrictions are undocumented implementation details that may change
 * between CLI versions. The descriptions below are taken from the CLI's Agent
 * tool schema at the time of writing (CLI ~v2.1.118). `claude-code-guide` is
 * observable in the CLI but not in the public docs — included here for
 * completeness.
 */

type BuiltinAgent = {
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  model?: AgentModel
}

/**
 * Tools that mutate state — disallowed for read-only subagents (Explore, Plan).
 * Using `disallowedTools` (rather than a hand-curated allowlist) keeps parity
 * with the CLI's "all tools except X" phrasing and auto-picks up any new tools
 * added in future SDK versions. Tool names verified against the SDK's
 * AgentDefinition type and 1Code's tool registry at
 * src/renderer/features/agents/ui/agent-tool-registry.tsx.
 */
const MUTATING_TOOLS = ["Edit", "Write", "NotebookEdit", "ExitPlanMode"]

export const BUILTIN_SUBAGENTS: Record<string, BuiltinAgent> = {
  Explore: {
    description:
      'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.',
    // Inherit all tools from parent, minus mutating ones — matches CLI's
    // "all tools except Agent, ExitPlanMode, Edit, Write, NotebookEdit".
    disallowedTools: MUTATING_TOOLS,
    // model omitted → inherits the user's selected model (matches 1Code UX).
    prompt: `You are a codebase exploration specialist. Use Glob, Grep, and Read to answer questions about the code. Scale depth to the thoroughness hint in the prompt (quick/medium/very thorough). Return concrete absolute file paths and minimal code excerpts that directly answer the question — no filler. You are READ-ONLY: never Edit, Write, or run mutating shell commands.`,
  },
  Plan: {
    description:
      "Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.",
    disallowedTools: MUTATING_TOOLS,
    prompt: `You are a software architect. Read the relevant code first, then produce a concrete step-by-step implementation plan. Consider trade-offs explicitly (simplicity vs. flexibility, perf vs. clarity, etc.). End with a "### Critical Files for Implementation" section listing 3-5 absolute paths the implementer will touch. You are READ-ONLY.`,
  },
  "general-purpose": {
    description:
      "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.",
    // No `tools` or `disallowedTools` → inherits all tools from parent.
    // Matches the CLI's "*" semantics for general-purpose.
    prompt: `You are a general-purpose agent. Use any available tool to complete the task end-to-end. Prefer doing the whole task rather than reporting partial progress. Return a concise summary of what you did, what you found, and any follow-ups.`,
  },
  "statusline-setup": {
    description:
      "Use this agent to configure the user's Claude Code status line setting.",
    tools: ["Read", "Edit"],
    prompt: `You help the user configure the statusLine property in ~/.claude/settings.json. Read the file, propose a concrete change, and apply it with Edit. Confirm the shape of the statusLine setting before writing.`,
  },
  "claude-code-guide": {
    description:
      'Use this agent when the user asks questions ("Can Claude...", "Does Claude...", "How do I...") about: (1) Claude Code (the CLI tool) - features, hooks, slash commands, MCP servers, settings, IDE integrations, keyboard shortcuts; (2) Claude Agent SDK - building custom agents; (3) Claude API (formerly Anthropic API) - API usage, tool use, Anthropic SDK usage.',
    tools: ["Glob", "Grep", "Read", "WebFetch", "WebSearch"],
    prompt: `You are a Claude Code / Agent SDK / Claude API reference expert. Use WebFetch against https://docs.claude.com/ and https://code.claude.com/docs/ for authoritative answers. Cite the URL of every doc page you rely on. If the answer isn't in the docs, say so — don't guess.`,
  },
}
