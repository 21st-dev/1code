import * as fs from "fs/promises"
import path from "path"
import { createClaudeOllamaPrompt } from "./agent-sdk-ollama-prompt"
import type { ClaudeAgentSdkPrompt } from "./agent-sdk-query-options"

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

export type PrepareClaudeAgentSdkPromptContextResult = {
  prompt: ClaudeAgentSdkPrompt
  systemPrompt: ReturnType<typeof createClaudeAgentSdkSystemPromptConfig>
  agentsMdContent?: string
}

export async function prepareClaudeAgentSdkPromptContext(input: {
  prompt: ClaudeAgentSdkPrompt
  existingMessages: any[]
  isUsingOllama: boolean
  resolvedModel?: string | null
  projectPath?: string
  cwd: string
  readAgentsMd?: typeof readClaudeAgentSdkProjectAgentsMd
  log?: (...args: any[]) => void
}): Promise<PrepareClaudeAgentSdkPromptContextResult> {
  const log = input.log ?? console.log
  const readAgentsMd = input.readAgentsMd ?? readClaudeAgentSdkProjectAgentsMd
  const agentsMd = await readAgentsMd(input.cwd)
  const agentsMdContent = agentsMd?.content
  if (agentsMdContent) {
    log(
      `[claude] Found AGENTS.md at ${agentsMd.path} (${agentsMdContent.length} chars)`,
    )
  }

  let prompt = input.prompt
  if (input.isUsingOllama && typeof input.prompt === "string") {
    const ollamaPrompt = createClaudeOllamaPrompt({
      prompt: input.prompt,
      existingMessages: input.existingMessages,
      resolvedModel: input.resolvedModel,
      projectPath: input.projectPath,
      cwd: input.cwd,
      agentsMdContent,
    })
    prompt = ollamaPrompt.prompt
    if (ollamaPrompt.historyMessageCount > 0) {
      log(
        `[Ollama] Added ${ollamaPrompt.historyMessageCount} messages to history (${ollamaPrompt.historyLength} chars)`,
      )
    }
    log("[Ollama] Context prefix added to prompt")
  }

  return {
    prompt,
    systemPrompt: createClaudeAgentSdkSystemPromptConfig(agentsMdContent),
    agentsMdContent,
  }
}
