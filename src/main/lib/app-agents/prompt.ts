import { eq } from "drizzle-orm"
import { appAgents, getDatabase } from "../db"
import { normalizeAppAgentName, toAppAgentDTO, type AppAgentDTO } from "./shared"

const APP_AGENT_MENTION_REGEX = /@\[agent:([^\]]+)\]/g

export type AppAgentPromptResult = {
  prompt: string
  appAgentMentions: string[]
  resolvedAppAgents: AppAgentDTO[]
  missingAppAgents: string[]
}

export function extractAppAgentMentionNames(prompt: string) {
  const names: string[] = []
  let match: RegExpExecArray | null

  while ((match = APP_AGENT_MENTION_REGEX.exec(prompt)) !== null) {
    const normalized = normalizeAppAgentName(match[1])
    if (normalized && !names.includes(normalized)) {
      names.push(normalized)
    }
  }

  return names
}

export function stripAppAgentMentions(prompt: string) {
  return prompt.replace(APP_AGENT_MENTION_REGEX, "").trim()
}

function buildToolGuidance(agent: AppAgentDTO) {
  const guidance: string[] = []
  if (agent.tools.length > 0) {
    guidance.push(`Prefer these tools when they fit: ${agent.tools.join(", ")}.`)
  }
  if (agent.disallowedTools.length > 0) {
    guidance.push(
      `Avoid these tools unless the user explicitly asks for them: ${agent.disallowedTools.join(", ")}.`,
    )
  }
  return guidance
}

function formatAgentContext(agent: AppAgentDTO) {
  const lines = [
    `## ${agent.name}`,
    `Description: ${agent.description}`,
    "",
    "Instructions:",
    agent.prompt.trim(),
  ]
  const toolGuidance = buildToolGuidance(agent)
  if (toolGuidance.length > 0) {
    lines.push("", "Tool guidance:", ...toolGuidance.map((item) => `- ${item}`))
  }
  return lines.join("\n")
}

export async function preparePromptWithAppAgents(
  prompt: string,
  appAgentNames?: string[],
): Promise<AppAgentPromptResult> {
  const cleanedPrompt = stripAppAgentMentions(prompt)
  const mentionNames = appAgentNames?.length
    ? Array.from(
        new Set(
          appAgentNames
            .map((name) => normalizeAppAgentName(name))
            .filter(Boolean),
        ),
      )
    : extractAppAgentMentionNames(prompt)

  if (mentionNames.length === 0) {
    return {
      prompt: cleanedPrompt,
      appAgentMentions: [],
      resolvedAppAgents: [],
      missingAppAgents: [],
    }
  }

  const db = getDatabase()
  const resolvedAppAgents: AppAgentDTO[] = []
  const missingAppAgents: string[] = []

  for (const name of mentionNames) {
    const row = db
      .select()
      .from(appAgents)
      .where(eq(appAgents.name, name))
      .get()
    if (row) {
      resolvedAppAgents.push(toAppAgentDTO(row))
    } else {
      missingAppAgents.push(name)
    }
  }

  const contextBlocks = resolvedAppAgents.map(formatAgentContext)
  if (missingAppAgents.length > 0) {
    contextBlocks.push(
      [
        "## Missing Locus Agents",
        `The following selected profiles were not found: ${missingAppAgents.join(", ")}.`,
      ].join("\n"),
    )
  }

  const userRequest =
    cleanedPrompt.trim() || "Apply the Locus Agent context to this request."

  return {
    prompt: [
      "# Locus Agent Context",
      "Use the following Locus-managed agent profile(s) for this request.",
      "",
      contextBlocks.join("\n\n"),
      "",
      "# User Request",
      userRequest,
    ].join("\n"),
    appAgentMentions: mentionNames,
    resolvedAppAgents,
    missingAppAgents,
  }
}
