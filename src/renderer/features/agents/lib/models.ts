export interface ClaudeModel {
  id: string
  name: string
  supportsThinking: boolean
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: "default", name: "Default", supportsThinking: true },
  { id: "opus", name: "Opus", supportsThinking: true },
  { id: "sonnet", name: "Sonnet", supportsThinking: true },
  { id: "haiku", name: "Haiku", supportsThinking: false },
]
