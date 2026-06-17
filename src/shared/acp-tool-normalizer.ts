type AnyRecord = Record<string, any>

// Map first word of an ACP tool title to a canonical Claude Code tool type.
// Codex tool calls arrive with titles like "Read README.md" or "Run echo hi".
export const ACP_VERB_TO_TOOL_TYPE: Record<string, string> = {
  Read: "Read",
  Run: "Bash",
  List: "Glob",
  Search: "Grep",
  Grep: "Grep",
  Glob: "Glob",
  Edit: "Edit",
  Write: "Write",
  Thought: "Thinking",
  Fetch: "WebFetch",
}

// Check if a part.type looks like an ACP title-based type
// such as "tool-Read README.md".
export function getAcpVerb(partType: string): string | null {
  if (!partType.startsWith("tool-")) return null
  const afterTool = partType.slice(5)
  for (const verb of Object.keys(ACP_VERB_TO_TOOL_TYPE)) {
    if (afterTool === verb || afterTool.startsWith(verb + " ")) {
      return verb
    }
  }
  return null
}

// Normalize ACP/codex tool parts into canonical types so grouping and rendering work.
// Handles:
// 1. Streaming: type="tool-acp.acp_provider_agent_dynamic_tool", input={toolName,args}
// 2. Persisted/live: type="tool-Read README.md", input={toolName,args}
export function normalizeAcpParts(parts: any[]): any[] {
  return parts.map((part) => {
    if (!part.type?.startsWith("tool-")) return part

    // Guard: only process ACP parts, not Claude Code parts.
    // ACP parts have input.toolName, a space in type, or the proxy tool name.
    const isAcpPart =
      part.input?.toolName ||
      part.type.includes(" ") ||
      part.type === "tool-acp.acp_provider_agent_dynamic_tool"
    if (!isAcpPart) return part

    const partInput =
      part.input && typeof part.input === "object"
        ? (part.input as AnyRecord)
        : {}

    let title: string | null = null
    let args: AnyRecord = {}

    const verb = getAcpVerb(part.type)
    if (verb) {
      title = partInput.toolName || part.type.slice(5)
      args =
        partInput.args && typeof partInput.args === "object"
          ? (partInput.args as AnyRecord)
          : partInput
    }

    if (!verb && part.type === "tool-acp.acp_provider_agent_dynamic_tool") {
      let input = part.input
      if (typeof input === "string") {
        try {
          input = JSON.parse(input)
        } catch {
          return part
        }
      }
      const parsedInput =
        input && typeof input === "object" ? (input as AnyRecord) : {}
      if (parsedInput.toolName) {
        title = parsedInput.toolName
        args =
          parsedInput.args && typeof parsedInput.args === "object"
            ? (parsedInput.args as AnyRecord)
            : parsedInput
      }
    }

    if (!title) return part

    const spaceIdx = title.indexOf(" ")
    const titleVerb = spaceIdx === -1 ? title : title.slice(0, spaceIdx)
    const detail = spaceIdx === -1 ? "" : title.slice(spaceIdx + 1)
    const canonicalType = ACP_VERB_TO_TOOL_TYPE[titleVerb]

    if (!canonicalType) return part

    const enrichedInput: AnyRecord = {
      ...args,
      _acpTitle: title,
      _acpDetail: detail,
    }
    if (canonicalType === "Read" && !enrichedInput.file_path && detail) {
      enrichedInput.file_path = detail
    }
    if (canonicalType === "Bash") {
      if (Array.isArray(enrichedInput.command)) {
        enrichedInput.command =
          enrichedInput.command[enrichedInput.command.length - 1] || detail
      } else if (!enrichedInput.command && detail) {
        enrichedInput.command = detail
      }
    }
    if (canonicalType === "Grep" && !enrichedInput.pattern && detail) {
      enrichedInput.pattern = detail
    }
    if (canonicalType === "Glob" && !enrichedInput.pattern && detail) {
      enrichedInput.pattern = detail
    }

    return {
      ...part,
      type: `tool-${canonicalType}`,
      input: enrichedInput,
      output: part.output,
    }
  })
}
