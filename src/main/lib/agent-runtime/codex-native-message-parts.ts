import { isCodexRuntimeNoticeText } from "../../../shared/codex-runtime-notices"

export type CodexNativeMessagePart = {
  type: string
  text?: string
  state?: string
  toolCallId?: string
  toolName?: string
  input?: unknown
  result?: unknown
  output?: unknown
  startedAt?: number
  title?: string
  [key: string]: unknown
}

export type CodexNativeToolResultUpdate = {
  output: unknown
  input?: unknown
  isError?: boolean
}

export type CodexNativeMessagePartChange = {
  part: CodexNativeMessagePart
  didStart: boolean
}

function mergeToolInput(
  existingInput: unknown,
  nextInput: unknown,
): unknown {
  const canMergeInput =
    existingInput &&
    typeof existingInput === "object" &&
    !Array.isArray(existingInput) &&
    nextInput &&
    typeof nextInput === "object" &&
    !Array.isArray(nextInput)

  if (!canMergeInput) return nextInput

  return {
    ...(existingInput as Record<string, unknown>),
    ...(nextInput as Record<string, unknown>),
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function normalizeToolCommand(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeComparableText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

export const isCodexNativeRuntimeNoticeText = isCodexRuntimeNoticeText

function getLastTextPart(parts: CodexNativeMessagePart[]) {
  const lastPart = parts.at(-1)
  return lastPart?.type === "text" ? lastPart : null
}

function isDuplicateAdjacentText(
  parts: CodexNativeMessagePart[],
  nextText: string,
): boolean {
  const lastTextPart = getLastTextPart(parts)
  if (!lastTextPart) return false
  const normalizedNextText = normalizeComparableText(nextText)
  return (
    Boolean(normalizedNextText) &&
    normalizeComparableText(lastTextPart.text) === normalizedNextText
  )
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

function getToolSignature(toolName: string | undefined, input: unknown): string | null {
  if (!toolName) return null
  const command = getToolInputCommand(input)
  if (!command) return null
  return `${toolName}:${normalizeToolCommand(command)}`
}

function areNativeMirrorCallIds(first: string, second: string): boolean {
  return (
    (first.startsWith("call_") && second.startsWith("item_")) ||
    (first.startsWith("item_") && second.startsWith("call_"))
  )
}

export function createCodexNativeMessagePartsAccumulator() {
  const messageParts: CodexNativeMessagePart[] = []
  const toolParts: CodexNativeMessagePart[] = []
  const toolPartIndexByCallId = new Map<string, number>()
  const recentToolPartIndexBySignature = new Map<string, number>()
  let activeTextPart: CodexNativeMessagePart | null = null
  let finalTextPart: CodexNativeMessagePart | null = null
  let lastStandaloneCommentaryText: string | null = null

  const resetRecentToolSignatures = () => {
    recentToolPartIndexBySignature.clear()
  }

  const closeActiveTextPart = () => {
    activeTextPart = null
  }

  const closeFinalTextPart = () => {
    finalTextPart = null
  }

  return {
    get parts() {
      return messageParts
    },
    get toolParts() {
      return toolParts
    },
    replaceWith(snapshot: {
      parts: CodexNativeMessagePart[]
      toolParts: CodexNativeMessagePart[]
    }) {
      messageParts.splice(0, messageParts.length, ...snapshot.parts)
      toolParts.splice(0, toolParts.length, ...snapshot.toolParts)
      toolPartIndexByCallId.clear()
      for (const [index, part] of toolParts.entries()) {
        if (typeof part.toolCallId === "string") {
          toolPartIndexByCallId.set(part.toolCallId, index)
        }
      }
      resetRecentToolSignatures()
      activeTextPart = null
      finalTextPart = null
      lastStandaloneCommentaryText = null
    },
    closeActiveTextPart,
    closeFinalTextPart,
    closeTextParts() {
      closeActiveTextPart()
      closeFinalTextPart()
    },
    appendTextDelta(delta: string): CodexNativeMessagePartChange | null {
      if (!delta) return null
      if (isCodexNativeRuntimeNoticeText(delta)) return null
      lastStandaloneCommentaryText = null
      resetRecentToolSignatures()
      if (!activeTextPart) {
        if (isDuplicateAdjacentText(messageParts, delta)) return null
        activeTextPart = {
          type: "text",
          text: "",
          state: "done",
        }
        messageParts.push(activeTextPart)
        activeTextPart.text = delta
        return { part: activeTextPart, didStart: true }
      }

      activeTextPart.text = `${activeTextPart.text ?? ""}${delta}`
      return { part: activeTextPart, didStart: false }
    },
    appendFinalTextDelta(delta: string): CodexNativeMessagePartChange | null {
      if (!delta) return null
      if (isCodexNativeRuntimeNoticeText(delta)) return null
      lastStandaloneCommentaryText = null
      resetRecentToolSignatures()
      closeActiveTextPart()
      if (!finalTextPart) {
        if (isDuplicateAdjacentText(messageParts, delta)) return null
        finalTextPart = {
          type: "text",
          text: "",
          state: "done",
        }
        messageParts.push(finalTextPart)
        finalTextPart.text = delta
        return { part: finalTextPart, didStart: true }
      }

      finalTextPart.text = `${finalTextPart.text ?? ""}${delta}`
      return { part: finalTextPart, didStart: false }
    },
    appendCommentaryText(text: string): CodexNativeMessagePart | null {
      const commentaryText = text.trim()
      if (!commentaryText) return null
      if (isCodexNativeRuntimeNoticeText(commentaryText)) return null
      if (commentaryText === lastStandaloneCommentaryText) return null
      if (isDuplicateAdjacentText(messageParts, commentaryText)) return null

      resetRecentToolSignatures()
      closeActiveTextPart()
      const commentaryPart: CodexNativeMessagePart = {
        type: "text",
        text: commentaryText,
        state: "done",
      }
      messageParts.push(commentaryPart)
      lastStandaloneCommentaryText = commentaryText
      return commentaryPart
    },
    startTool(params: {
      callId: string
      toolName: string
      input: unknown
      title?: string
      startedAt?: number
    }): CodexNativeMessagePartChange {
      lastStandaloneCommentaryText = null
      closeActiveTextPart()
      closeFinalTextPart()

      const existingIndex = toolPartIndexByCallId.get(params.callId)
      if (typeof existingIndex === "number") {
        return {
          part: toolParts[existingIndex],
          didStart: false,
        }
      }

      const signature = getToolSignature(params.toolName, params.input)
      const duplicateIndex = signature
        ? recentToolPartIndexBySignature.get(signature)
        : undefined
      const duplicatePart =
        typeof duplicateIndex === "number" ? toolParts[duplicateIndex] : null
      if (
        typeof duplicateIndex === "number" &&
        duplicatePart &&
        typeof duplicatePart.toolCallId === "string" &&
        areNativeMirrorCallIds(duplicatePart.toolCallId, params.callId)
      ) {
        duplicatePart.input = mergeToolInput(duplicatePart.input, params.input)
        if (params.title && !duplicatePart.title) duplicatePart.title = params.title
        toolPartIndexByCallId.set(params.callId, duplicateIndex)
        return {
          part: duplicatePart,
          didStart: false,
        }
      }

      toolPartIndexByCallId.set(params.callId, toolParts.length)
      const toolPart: CodexNativeMessagePart = {
        type: `tool-${params.toolName}`,
        toolCallId: params.callId,
        toolName: params.toolName,
        input: params.input,
        state: "call",
        startedAt: params.startedAt ?? Date.now(),
        ...(params.title ? { title: params.title } : {}),
      }
      toolParts.push(toolPart)
      messageParts.push(toolPart)
      if (signature) {
        recentToolPartIndexBySignature.set(signature, toolParts.length - 1)
      }

      return {
        part: toolPart,
        didStart: true,
      }
    },
    updateToolResult(
      callId: string,
      update: CodexNativeToolResultUpdate,
    ): CodexNativeMessagePart | null {
      const partIndex = toolPartIndexByCallId.get(callId)
      if (typeof partIndex !== "number") return null

      const toolPart = toolParts[partIndex]
      toolPart.result = update.output
      toolPart.output = update.output
      toolPart.state = update.isError ? "output-error" : "result"
      if (update.input !== undefined) {
        toolPart.input = mergeToolInput(toolPart.input, update.input)
      }

      return toolPart
    },
    snapshot() {
      return {
        parts: messageParts,
        toolParts,
      }
    },
  }
}
