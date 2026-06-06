import * as fs from "fs/promises"
import path from "path"

export type ClaudeAgentSdkProjectAgentsMd = {
  path: string
  content: string
}

export async function readClaudeAgentSdkProjectAgentsMd(
  cwd: string,
  readFile: typeof fs.readFile = fs.readFile,
): Promise<ClaudeAgentSdkProjectAgentsMd | null> {
  const agentsMdPath = path.join(cwd, "AGENTS.md")
  try {
    const content = await readFile(agentsMdPath, "utf-8")
    if (!content.trim()) {
      return null
    }
    return { path: agentsMdPath, content }
  } catch {
    return null
  }
}

export function createClaudeAgentSdkSystemPromptConfig(
  agentsMdContent: string | undefined,
):
  | {
      type: "preset"
      preset: "claude_code"
      append: string
    }
  | {
      type: "preset"
      preset: "claude_code"
    } {
  if (!agentsMdContent) {
    return {
      type: "preset",
      preset: "claude_code",
    }
  }

  return {
    type: "preset",
    preset: "claude_code",
    append: `\n\n# AGENTS.md\nThe following are the project's AGENTS.md instructions:\n\n${agentsMdContent}`,
  }
}
