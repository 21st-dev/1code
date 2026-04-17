export type ClaudeThinkingLevel =
  | "off"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"

export const CLAUDE_MODELS = [
  {
    id: "opus",
    name: "Opus",
    version: "4.6",
    thinkings: ["off", "low", "medium", "high", "xhigh", "max"] as ClaudeThinkingLevel[],
  },
  {
    id: "sonnet",
    name: "Sonnet",
    version: "4.6",
    thinkings: ["off", "low", "medium", "high"] as ClaudeThinkingLevel[],
  },
  {
    id: "haiku",
    name: "Haiku",
    version: "4.5",
    thinkings: ["off", "low", "medium", "high"] as ClaudeThinkingLevel[],
  },
]

export function formatClaudeThinkingLabel(thinking: ClaudeThinkingLevel): string {
  if (thinking === "off") return "Off"
  if (thinking === "xhigh") return "Extra High"
  if (thinking === "max") return "Max"
  return thinking.charAt(0).toUpperCase() + thinking.slice(1)
}

export type CodexThinkingLevel = "low" | "medium" | "high" | "xhigh"

export const CODEX_MODELS = [
  {
    id: "gpt-5.3-codex",
    name: "Codex 5.3",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.2-codex",
    name: "Codex 5.2",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.1-codex-max",
    name: "Codex 5.1 Max",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "Codex 5.1 Mini",
    thinkings: ["medium", "high"] as CodexThinkingLevel[],
  },
]

export function formatCodexThinkingLabel(thinking: CodexThinkingLevel): string {
  if (thinking === "xhigh") return "Extra High"
  return thinking.charAt(0).toUpperCase() + thinking.slice(1)
}
