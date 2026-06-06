export type ClaudeOllamaPromptResult = {
  prompt: string
  historyMessageCount: number
  historyLength: number
}

export function createClaudeOllamaPrompt(input: {
  prompt: string
  existingMessages: any[]
  resolvedModel?: string | null
  projectPath?: string
  cwd: string
  agentsMdContent?: string
}): ClaudeOllamaPromptResult {
  const history = createClaudeOllamaHistory(input.existingMessages)
  const agentsSection = input.agentsMdContent
    ? `

[AGENTS.MD]
${input.agentsMdContent}
[/AGENTS.MD]`
    : ""

  return {
    prompt: `[CONTEXT]
You are a coding assistant in OFFLINE mode (Ollama model: ${input.resolvedModel || "unknown"}).
Project: ${input.projectPath || input.cwd}
Working directory: ${input.cwd}

IMPORTANT: When using tools, use these EXACT parameter names:
- Read: use "file_path" (not "file")
- Write: use "file_path" and "content"
- Edit: use "file_path", "old_string", "new_string"
- Glob: use "pattern" (e.g. "**/*.ts") and optionally "path"
- Grep: use "pattern" and optionally "path"
- Bash: use "command"

When asked about the project, use Glob to find files and Read to examine them.
Be concise and helpful.
[/CONTEXT]${agentsSection}

${history.text}[CURRENT REQUEST]
${input.prompt}
[/CURRENT REQUEST]`,
    historyMessageCount: history.messageCount,
    historyLength: history.historyLength,
  }
}

function createClaudeOllamaHistory(messages: any[]): {
  text: string
  messageCount: number
  historyLength: number
} {
  if (messages.length === 0) {
    return { text: "", messageCount: 0, historyLength: 0 }
  }

  const historyParts: string[] = []
  for (const message of messages) {
    if (message.role === "user") {
      const textParts =
        message.parts
          ?.filter((part: any) => part.type === "text")
          .map((part: any) => part.text) || []
      if (textParts.length > 0) {
        historyParts.push(`User: ${textParts.join("\n")}`)
      }
    } else if (message.role === "assistant") {
      const assistantContent = createClaudeOllamaAssistantHistoryContent(
        message.parts || [],
      )
      if (assistantContent) {
        historyParts.push(`Assistant: ${assistantContent}`)
      }
    }
  }

  if (historyParts.length === 0) {
    return { text: "", messageCount: 0, historyLength: 0 }
  }

  let history = historyParts.join("\n\n")
  if (history.length > 10000) {
    history =
      "...(earlier messages truncated)...\n\n" + history.slice(-10000)
  }

  return {
    text: `[CONVERSATION HISTORY]
${history}
[/CONVERSATION HISTORY]

`,
    messageCount: historyParts.length,
    historyLength: history.length,
  }
}

function createClaudeOllamaAssistantHistoryContent(parts: any[]): string {
  const textParts: string[] = []
  const toolSummaries: string[] = []

  for (const part of parts) {
    if (part.type === "text" && part.text) {
      textParts.push(part.text)
    } else if (part.type === "tool_use" || part.type === "tool-use") {
      const toolSummary = createClaudeOllamaToolSummary(part)
      if (toolSummary) {
        toolSummaries.push(toolSummary)
      }
    }
  }

  let assistantContent = ""
  if (textParts.length > 0) {
    assistantContent = textParts.join("\n")
  }
  if (toolSummaries.length > 0) {
    assistantContent = assistantContent
      ? `${assistantContent}\n${toolSummaries.join(" ")}`
      : toolSummaries.join(" ")
  }
  return assistantContent
}

function createClaudeOllamaToolSummary(part: any): string {
  const toolName = part.name || part.tool || "unknown"
  const toolInput = part.input || {}
  let toolInfo = `[Used ${toolName}`

  if (toolName === "Read" && (toolInput.file_path || toolInput.file)) {
    toolInfo += `: ${toolInput.file_path || toolInput.file}`
  } else if (toolName === "Edit" && toolInput.file_path) {
    toolInfo += `: ${toolInput.file_path}`
  } else if (toolName === "Write" && toolInput.file_path) {
    toolInfo += `: ${toolInput.file_path}`
  } else if (toolName === "Glob" && toolInput.pattern) {
    toolInfo += `: ${toolInput.pattern}`
  } else if (toolName === "Grep" && toolInput.pattern) {
    toolInfo += `: "${toolInput.pattern}"`
  } else if (toolName === "Bash" && toolInput.command) {
    const command = String(toolInput.command)
    const shortCommand = command.slice(0, 50)
    toolInfo += `: ${shortCommand}${command.length > 50 ? "..." : ""}`
  }

  return `${toolInfo}]`
}
