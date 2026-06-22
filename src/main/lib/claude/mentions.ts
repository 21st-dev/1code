export type ClaudePromptMentions = {
  cleanedPrompt: string
  agentMentions: string[]
  skillMentions: string[]
  fileMentions: string[]
  folderMentions: string[]
  toolMentions: string[]
}

/**
 * Parse @[agent:name], @[skill:name], and @[tool:servername] mentions from
 * prompt text. Agent mentions are resolved as Locus Agents before the request is
 * sent. File and folder mentions remain as readable paths for the runtime.
 */
export function parseClaudePromptMentions(prompt: string): ClaudePromptMentions {
  const agentMentions: string[] = []
  const skillMentions: string[] = []
  const fileMentions: string[] = []
  const folderMentions: string[] = []
  const toolMentions: string[] = []

  const mentionRegex = /@\[(file|folder|skill|agent|tool):([^\]]+)\]/g
  let match

  while ((match = mentionRegex.exec(prompt)) !== null) {
    const [, type, name] = match
    switch (type) {
      case "agent":
        agentMentions.push(name)
        break
      case "skill":
        skillMentions.push(name)
        break
      case "file":
        fileMentions.push(name)
        break
      case "folder":
        folderMentions.push(name)
        break
      case "tool":
        if (
          /^[a-zA-Z0-9_-]+$/.test(name) ||
          /^mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$/.test(name)
        ) {
          toolMentions.push(name)
        }
        break
    }
  }

  let cleanedPrompt = prompt
    .replace(/@\[agent:[^\]]+\]/g, "")
    .replace(/@\[skill:[^\]]+\]/g, "")
    .replace(/@\[tool:[^\]]+\]/g, "")
    .trim()

  cleanedPrompt = cleanedPrompt
    .replace(/@\[file:local:([^\]]+)\]/g, "$1")
    .replace(/@\[file:external:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:local:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:external:([^\]]+)\]/g, "$1")

  if (toolMentions.length > 0) {
    const toolHints = toolMentions
      .map((toolMention) => {
        if (toolMention.startsWith("mcp__")) {
          return `Use the ${toolMention} tool for this request.`
        }
        return `Use tools from the ${toolMention} MCP server for this request.`
      })
      .join(" ")
    cleanedPrompt = `${toolHints}\n\n${cleanedPrompt}`
  }

  return {
    cleanedPrompt,
    agentMentions,
    skillMentions,
    fileMentions,
    folderMentions,
    toolMentions,
  }
}
