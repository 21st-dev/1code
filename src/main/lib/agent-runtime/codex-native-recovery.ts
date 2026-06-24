import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  codexJsonlEventToNativeToolEvent,
  extractCodexJsonlEventText,
  isCodexJsonlCommentaryTextEvent,
  isCodexJsonlDeltaTextEvent,
  isCodexJsonlFinalTextEvent,
  parseCodexJsonlEventLine,
  type CodexJsonlEvent,
} from "./codex-native-session"
import {
  createCodexNativeMessagePartsAccumulator,
  type CodexNativeMessagePart,
} from "./codex-native-message-parts"

export type CodexNativeRecoveredMessage = {
  role?: string
  parts?: CodexNativeMessagePart[]
  content?: unknown
  [key: string]: unknown
}

export type CodexNativeSessionTurn = {
  userText: string
  events: CodexJsonlEvent[]
}

export type CodexNativeMessageRecoveryResult<
  TMessage extends CodexNativeRecoveredMessage,
> = {
  messages: TMessage[]
  changed: boolean
  recoveredAssistantCount: number
}

function stableEventHash(event: CodexJsonlEvent): string {
  try {
    return createHash("sha1").update(JSON.stringify(event)).digest("hex")
  } catch {
    return createHash("sha1").update(String(event)).digest("hex")
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

function getToolInputCommand(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined

  const record = input as Record<string, unknown>
  return (
    stringValue(record.cmd) ??
    stringValue(record.command) ??
    stringValue(record.rawCommand)
  )
}

function getPartToolSignature(
  part: Pick<CodexNativeMessagePart, "type" | "toolName" | "input">,
): string | null {
  if (!part.type?.startsWith("tool-")) return null
  const toolName = stringValue(part.toolName) ?? part.type.slice("tool-".length)
  const command = getToolInputCommand(part.input)
  if (!toolName || !command) return null
  return `${toolName}:${normalizeText(command)}`
}

function areNativeMirrorCallIds(first: unknown, second: unknown): boolean {
  if (typeof first !== "string" || typeof second !== "string") return false
  return (
    (first.startsWith("call_") && second.startsWith("item_")) ||
    (first.startsWith("item_") && second.startsWith("call_"))
  )
}

function extractTextFromContent(content: unknown): string | undefined {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return undefined

  const text = content
    .map((item) => {
      if (!item || typeof item !== "object") return ""
      const record = item as Record<string, unknown>
      return stringValue(record.text) ?? stringValue(record.content) ?? ""
    })
    .join("")
    .trim()

  return text || undefined
}

function extractCodexUserEventText(event: CodexJsonlEvent): string {
  const payload = (event as any)?.payload
  const extractedText = extractCodexJsonlEventText(event)
  const text =
    extractedText ??
    stringValue(payload?.message) ??
    stringValue(payload?.text) ??
    extractTextFromContent(payload?.content) ??
    extractTextFromContent((event as any)?.content)

  return normalizeText(text)
}

export function isCodexJsonlUserEvent(event: CodexJsonlEvent): boolean {
  const payload = (event as any)?.payload
  if ((event as any)?.type === "event_msg" && payload?.type === "user_message") {
    return true
  }
  if ((event as any)?.type === "response_item" && payload?.role === "user") {
    return true
  }
  if (payload?.role === "user" || (event as any)?.role === "user") {
    return true
  }
  return false
}

export function buildNativePartsFromCodexEvents(events: CodexJsonlEvent[]) {
  const parts = createCodexNativeMessagePartsAccumulator()
  const handledEventHashes = new Set<string>()
  const seenFinalTexts = new Set<string>()

  for (const event of events) {
    const eventHash = stableEventHash(event)
    if (handledEventHashes.has(eventHash)) continue
    handledEventHashes.add(eventHash)

    if (isCodexJsonlUserEvent(event)) continue

    const text = extractCodexJsonlEventText(event)
    if (text && isCodexJsonlCommentaryTextEvent(event)) {
      parts.appendCommentaryText(text)
      continue
    }

    const toolEvent = codexJsonlEventToNativeToolEvent(event)
    if (toolEvent?.kind === "tool-input") {
      parts.startTool({
        callId: toolEvent.callId,
        toolName: toolEvent.toolName,
        input: toolEvent.input,
        ...(toolEvent.title ? { title: toolEvent.title } : {}),
      })
    } else if (toolEvent?.kind === "tool-output") {
      parts.updateToolResult(toolEvent.callId, {
        output: toolEvent.output,
        ...(toolEvent.input !== undefined ? { input: toolEvent.input } : {}),
        ...(toolEvent.isError ? { isError: true } : {}),
      })
    }

    if (!text) continue

    if (isCodexJsonlFinalTextEvent(event)) {
      const finalText = text.trim()
      if (finalText && !seenFinalTexts.has(finalText)) {
        seenFinalTexts.add(finalText)
        parts.appendFinalTextDelta(text)
      }
      continue
    }

    if (isCodexJsonlDeltaTextEvent(event)) {
      parts.appendTextDelta(text)
    }
  }

  return parts.snapshot()
}

export function getCodexNativePartsRichness(snapshot: {
  parts: Array<{
    type: string
    text?: string
    result?: unknown
    output?: unknown
  }>
  toolParts: Array<{ result?: unknown; output?: unknown }>
}): number {
  const textParts = snapshot.parts.filter(
    (part) =>
      part.type === "text" &&
      typeof part.text === "string" &&
      part.text.trim(),
  ).length
  const toolParts = snapshot.toolParts.length
  const toolOutputs = snapshot.toolParts.filter(
    (part) => part.result !== undefined || part.output !== undefined,
  ).length
  return textParts * 10 + toolParts * 3 + toolOutputs
}

function isCodexNativeSetupLeakText(text: string): boolean {
  if (!text) return false
  return (
    text.startsWith("<permissions instructions>") ||
    text.startsWith("<skills_instructions>") ||
    text.startsWith("# AGENTS.md instructions") ||
    text.includes("Filesystem sandboxing defines which files can be read or written") ||
    text.includes("A skill is a set of local instructions to follow") ||
    text.includes("Approval policy is currently")
  )
}

function getCodexNativePartsDuplicatePenalty(snapshot: {
  parts: CodexNativeMessagePart[]
}): number {
  let penalty = 0
  let previousText = ""
  let toolCallIdBySignature = new Map<string, unknown>()

  for (const part of snapshot.parts) {
    if (part.type === "text") {
      const text = normalizeText(part.text)
      if (isCodexNativeSetupLeakText(text)) penalty += 100
      if (text && text === previousText) penalty += 1
      previousText = text
      toolCallIdBySignature = new Map()
      continue
    }

    previousText = ""
    if (!part.type?.startsWith("tool-")) continue

    const signature = getPartToolSignature(part)
    if (!signature) continue

    const previousCallId = toolCallIdBySignature.get(signature)
    if (areNativeMirrorCallIds(previousCallId, part.toolCallId)) {
      penalty += 1
      continue
    }

    toolCallIdBySignature.set(signature, part.toolCallId)
  }

  return penalty
}

function getCodexNativePartsReplayScore(snapshot: {
  parts: CodexNativeMessagePart[]
  toolParts: Array<{ result?: unknown; output?: unknown }>
}): number {
  return (
    getCodexNativePartsRichness(snapshot) -
    getCodexNativePartsDuplicatePenalty(snapshot) * 20
  )
}

export function splitCodexSessionEventsIntoTurns(
  events: CodexJsonlEvent[],
): CodexNativeSessionTurn[] {
  const turns: CodexNativeSessionTurn[] = []
  let currentTurn: CodexNativeSessionTurn | null = null

  for (const event of events) {
    if (isCodexJsonlUserEvent(event)) {
      const userText = extractCodexUserEventText(event)
      if (
        currentTurn &&
        currentTurn.events.length === 0 &&
        normalizeText(currentTurn.userText) === userText
      ) {
        continue
      }

      currentTurn = { userText, events: [] }
      turns.push(currentTurn)
      continue
    }

    currentTurn?.events.push(event)
  }

  return turns.filter((turn) => turn.events.length > 0)
}

function getMessageText(message: CodexNativeRecoveredMessage): string {
  if (Array.isArray(message.parts)) {
    const text = message.parts
      .map((part) => {
        if (!part || typeof part !== "object") return ""
        if (part.type === "text" && typeof part.text === "string") {
          return part.text
        }
        return ""
      })
      .join("")
      .trim()
    if (text) return normalizeText(text)
  }

  if (typeof message.content === "string") {
    return normalizeText(message.content)
  }

  return ""
}

function getMessageSnapshot(message: CodexNativeRecoveredMessage) {
  const parts = Array.isArray(message.parts) ? message.parts : []
  const toolParts = parts.filter((part) => part.type?.startsWith("tool-"))
  return { parts, toolParts }
}

function userTextsMatch(storedText: string, turnText: string): boolean {
  if (!storedText || !turnText) return false
  if (storedText === turnText) return true
  return storedText.includes(turnText) || turnText.includes(storedText)
}

function findMatchingTurnIndex(
  turns: CodexNativeSessionTurn[],
  turnCursor: number,
  userText: string,
): number {
  const normalizedUserText = normalizeText(userText)
  if (!normalizedUserText) return turnCursor

  for (let index = turnCursor; index < turns.length; index += 1) {
    if (userTextsMatch(normalizedUserText, normalizeText(turns[index].userText))) {
      return index
    }
  }

  return turnCursor
}

export function recoverCodexNativeMessagesFromSessionEvents<
  TMessage extends CodexNativeRecoveredMessage,
>(
  messages: TMessage[],
  events: CodexJsonlEvent[],
): CodexNativeMessageRecoveryResult<TMessage> {
  const turns = splitCodexSessionEventsIntoTurns(events)
  if (turns.length === 0 || messages.length === 0) {
    return { messages, changed: false, recoveredAssistantCount: 0 }
  }

  let changed = false
  let recoveredAssistantCount = 0
  let turnCursor = 0
  const nextMessages = [...messages]

  for (let index = 0; index < nextMessages.length; index += 1) {
    const userMessage = nextMessages[index]
    if (userMessage.role !== "user") continue

    const assistantIndex = nextMessages.findIndex(
      (message, candidateIndex) =>
        candidateIndex > index && message.role === "assistant",
    )
    if (assistantIndex === -1 || turnCursor >= turns.length) continue

    const turnIndex = findMatchingTurnIndex(
      turns,
      turnCursor,
      getMessageText(userMessage),
    )
    const turn = turns[turnIndex]
    if (!turn) continue

    const replaySnapshot = buildNativePartsFromCodexEvents(turn.events)
    const existingSnapshot = getMessageSnapshot(nextMessages[assistantIndex])
    if (
      getCodexNativePartsReplayScore(replaySnapshot) >
      getCodexNativePartsReplayScore(existingSnapshot)
    ) {
      nextMessages[assistantIndex] = {
        ...nextMessages[assistantIndex],
        parts: replaySnapshot.parts,
      }
      changed = true
      recoveredAssistantCount += 1
    }

    turnCursor = turnIndex + 1
    index = assistantIndex
  }

  return {
    messages: changed ? nextMessages : messages,
    changed,
    recoveredAssistantCount,
  }
}

export async function findCodexNativeSessionFileById(
  sessionId: string,
): Promise<string | null> {
  const cleanedSessionId = sessionId.trim()
  if (!cleanedSessionId) return null

  const sessionsRoot = join(
    process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"),
    "sessions",
  )
  const fileSuffix = `-${cleanedSessionId}.jsonl`
  const sortDesc = (values: string[]) =>
    values.sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true }),
    )
  const listNames = async (dirPath: string): Promise<string[]> => {
    try {
      return await readdir(dirPath, { encoding: "utf8" })
    } catch {
      return []
    }
  }

  const years = sortDesc(
    (await listNames(sessionsRoot)).filter((name) => /^\d{4}$/.test(name)),
  )
  for (const year of years) {
    const yearPath = join(sessionsRoot, year)
    const months = sortDesc(
      (await listNames(yearPath)).filter((name) => /^\d{2}$/.test(name)),
    )
    for (const month of months) {
      const monthPath = join(yearPath, month)
      const days = sortDesc(
        (await listNames(monthPath)).filter((name) => /^\d{2}$/.test(name)),
      )
      for (const day of days) {
        const dayPath = join(monthPath, day)
        const fileName = (await listNames(dayPath)).find((name) =>
          name.endsWith(fileSuffix),
        )
        if (fileName) return join(dayPath, fileName)
      }
    }
  }

  return null
}

export async function readCodexNativeSessionEventsById(
  sessionId: string,
): Promise<CodexJsonlEvent[]> {
  const sessionFile = await findCodexNativeSessionFileById(sessionId)
  if (!sessionFile) return []

  let rawContent = ""
  try {
    rawContent = await readFile(sessionFile, "utf8")
  } catch {
    return []
  }

  const events: CodexJsonlEvent[] = []
  for (const line of rawContent.split(/\r?\n/)) {
    const event = parseCodexJsonlEventLine(line)
    if (event) events.push(event)
  }
  return events
}
