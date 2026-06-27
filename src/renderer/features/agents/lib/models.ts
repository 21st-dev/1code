export const CLAUDE_MODELS = [
  { id: "opus", name: "Opus", version: "4.6" },
  { id: "sonnet", name: "Sonnet", version: "4.6" },
  { id: "haiku", name: "Haiku", version: "4.5" },
]

export const CODEX_REASONING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const

export type CodexThinkingLevel = (typeof CODEX_REASONING_EFFORTS)[number]

export const CODEX_DEFAULT_REASONING_EFFORT = "medium" satisfies CodexThinkingLevel
export const CODEX_DEFAULT_MODEL_ID = `gpt-5.5/${CODEX_DEFAULT_REASONING_EFFORT}`

function createCodexThinkingLevels(): CodexThinkingLevel[] {
  return [...CODEX_REASONING_EFFORTS]
}

export function getCodexDefaultThinkingLevel(
  thinkings: readonly CodexThinkingLevel[],
): CodexThinkingLevel {
  return thinkings.includes(CODEX_DEFAULT_REASONING_EFFORT)
    ? CODEX_DEFAULT_REASONING_EFFORT
    : thinkings[0]!
}

export const CODEX_MODELS = [
  {
    id: "gpt-5.5",
    name: "GPT 5.5",
    thinkings: createCodexThinkingLevels(),
  },
  {
    id: "gpt-5.4",
    name: "GPT 5.4",
    thinkings: createCodexThinkingLevels(),
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT 5.4 Mini",
    thinkings: createCodexThinkingLevels(),
  },
  {
    id: "gpt-5.2",
    name: "GPT 5.2",
    thinkings: createCodexThinkingLevels(),
  },
]

export function isCodexThinkingLevel(value: unknown): value is CodexThinkingLevel {
  return (
    typeof value === "string" &&
    CODEX_REASONING_EFFORTS.includes(value as CodexThinkingLevel)
  )
}

export function formatCodexThinkingLabel(thinking: CodexThinkingLevel): string {
  switch (thinking) {
    case "minimal":
      return "Minimal"
    case "xhigh":
      return "Extra High"
    case "max":
      return "Max"
    default:
      return thinking.charAt(0).toUpperCase() + thinking.slice(1)
  }
}
