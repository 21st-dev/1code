type AnyRecord = Record<string, any>

const CODEX_VERB_TO_TOOL_TYPE: Record<string, string> = {
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

type CodexToolDescriptor = {
  canonicalToolName: string
  detail: string
  isMcp: boolean
}

type NormalizeCodexToolPartOptions = {
  normalizeState?: boolean
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null
}

function isShallowEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!isRecord(left) || !isRecord(right)) return false

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false
  }

  return true
}

function getParsedCmdEntries(rawInput: AnyRecord, args: AnyRecord): AnyRecord[] {
  const parsedCmdRaw = Array.isArray(args.parsed_cmd)
    ? args.parsed_cmd
    : Array.isArray(rawInput.parsed_cmd)
      ? rawInput.parsed_cmd
      : []
  return parsedCmdRaw.filter(isRecord)
}

function getParsedCmdEntriesFromPayload(payload: unknown): AnyRecord[] {
  if (!isRecord(payload)) return []
  if (!Array.isArray(payload.parsed_cmd)) return []
  return payload.parsed_cmd.filter(isRecord)
}

function getFirstParsedCmdValue(
  entries: AnyRecord[],
  key: string,
): string | undefined {
  const match = entries.find(
    (entry) => typeof entry[key] === "string" && entry[key].trim().length > 0,
  )
  if (!match) return undefined
  return match[key].trim()
}

function normalizeReadInputFromPayload(
  input: unknown,
  payload: unknown,
): unknown {
  const normalizedInput = isRecord(input) ? { ...input } : {}
  const existingPath =
    typeof normalizedInput.file_path === "string" &&
    normalizedInput.file_path.trim().length > 0
      ? normalizedInput.file_path.trim()
      : ""
  if (existingPath) {
    return input
  }

  const payloadEntries = getParsedCmdEntriesFromPayload(payload)
  const payloadPath = getFirstParsedCmdValue(payloadEntries, "path")
  const payloadName = getFirstParsedCmdValue(payloadEntries, "name")
  const directPayloadPath =
    isRecord(payload) && typeof payload.path === "string" && payload.path.trim().length > 0
      ? payload.path.trim()
      : ""
  const directPayloadFilePath =
    isRecord(payload) &&
    typeof payload.file_path === "string" &&
    payload.file_path.trim().length > 0
      ? payload.file_path.trim()
      : ""

  const resolvedPath =
    directPayloadFilePath || directPayloadPath || payloadPath || payloadName

  if (!resolvedPath) {
    return input
  }

  normalizedInput.file_path = resolvedPath

  if (isRecord(input) && isShallowEqual(normalizedInput, input)) {
    return input
  }

  return normalizedInput
}

function toCanonicalToolState(state: unknown): string | undefined {
  if (state === "input-available") return "call"
  if (state === "output-available") return "result"
  return typeof state === "string" ? state : undefined
}

function parseCodexToolDescriptor(rawToolName: string): CodexToolDescriptor | null {
  const normalizedName = rawToolName.trim()
  if (!normalizedName) return null

  if (normalizedName === "AskUserQuestion") {
    return {
      canonicalToolName: "AskUserQuestion",
      detail: "",
      isMcp: false,
    }
  }

  if (normalizedName.startsWith("Tool:")) {
    const payload = normalizedName.slice("Tool:".length).trim()
    const separatorIndex = payload.indexOf("/")
    if (separatorIndex === -1) return null

    const serverName = payload.slice(0, separatorIndex).trim()
    const toolName = payload.slice(separatorIndex + 1).trim().replaceAll("/", "__")
    if (!serverName || !toolName) return null

    if (
      serverName === "acp-ai-sdk-tools" &&
      toolName === "AskUserQuestion"
    ) {
      return {
        canonicalToolName: "AskUserQuestion",
        detail: "",
        isMcp: false,
      }
    }

    return {
      canonicalToolName: `mcp__${serverName}__${toolName}`,
      detail: "",
      isMcp: true,
    }
  }

  const spaceIndex = normalizedName.indexOf(" ")
  const verb = spaceIndex === -1 ? normalizedName : normalizedName.slice(0, spaceIndex)
  const detail = spaceIndex === -1 ? "" : normalizedName.slice(spaceIndex + 1).trim()
  const canonicalToolName = CODEX_VERB_TO_TOOL_TYPE[verb]
  if (!canonicalToolName) return null

  return {
    canonicalToolName,
    detail,
    isMcp: false,
  }
}

function stripExecutionBookkeeping(input: AnyRecord): AnyRecord {
  const cleaned: AnyRecord = { ...input }
  delete cleaned.call_id
  delete cleaned.process_id
  delete cleaned.turn_id
  delete cleaned.command
  delete cleaned.cwd
  delete cleaned.parsed_cmd
  delete cleaned.source
  delete cleaned.server
  delete cleaned.tool
  return cleaned
}

function getContentText(item: unknown): string {
  if (!isRecord(item)) return ""
  if (typeof item.text === "string") return item.text
  if (isRecord(item.content) && typeof item.content.text === "string") {
    return item.content.text
  }
  return ""
}

function normalizeAskUserQuestionResult(value: unknown): unknown {
  const content = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.content)
      ? value.content
      : []
  const firstText = content
    .map(getContentText)
    .find((text) => text.trim().length > 0)

  if (!firstText) return value

  try {
    return JSON.parse(firstText)
  } catch {
    return firstText
  }
}

function normalizeCodexToolInput(
  rawInput: unknown,
  descriptor: CodexToolDescriptor,
): unknown {
  if (!isRecord(rawInput)) {
    if (typeof rawInput === "string") {
      const trimmedInput = rawInput.trim()
      if (trimmedInput.length > 0) {
        try {
          const parsedInput = JSON.parse(trimmedInput)
          if (isRecord(parsedInput)) {
            return normalizeCodexToolInput(parsedInput, descriptor)
          }
        } catch {
          // Keep the original string input for downstream consumers.
        }
      }
    }

    if (descriptor.canonicalToolName === "Read" && descriptor.detail) {
      return { file_path: descriptor.detail }
    }
    if (descriptor.canonicalToolName === "Bash" && descriptor.detail) {
      return { command: descriptor.detail }
    }
    if (
      (descriptor.canonicalToolName === "Grep" || descriptor.canonicalToolName === "Glob") &&
      descriptor.detail
    ) {
      return { pattern: descriptor.detail }
    }
    return rawInput
  }

  const hasArgsWrapper = isRecord(rawInput.args)
  const args = hasArgsWrapper ? (rawInput.args as AnyRecord) : rawInput

  if (descriptor.isMcp) {
    const mcpArguments = isRecord(args.arguments)
      ? { ...(args.arguments as AnyRecord) }
      : stripExecutionBookkeeping(args)
    return mcpArguments
  }

  const normalizedInput: AnyRecord = { ...args }
  const parsedCmdEntries = getParsedCmdEntries(rawInput, args)
  const parsedPath = getFirstParsedCmdValue(parsedCmdEntries, "path")
  const parsedName = getFirstParsedCmdValue(parsedCmdEntries, "name")
  const parsedPattern = getFirstParsedCmdValue(parsedCmdEntries, "pattern")
  const parsedTargetDirectory =
    getFirstParsedCmdValue(parsedCmdEntries, "target_directory") || parsedPath

  if (
    !Array.isArray(normalizedInput.parsed_cmd) &&
    Array.isArray(rawInput.parsed_cmd)
  ) {
    normalizedInput.parsed_cmd = rawInput.parsed_cmd
  }
  if (
    normalizedInput.command === undefined &&
    rawInput.command !== undefined
  ) {
    normalizedInput.command = rawInput.command
  }

  if (descriptor.canonicalToolName === "Read") {
    if (!normalizedInput.file_path) {
      if (typeof normalizedInput.path === "string" && normalizedInput.path.length > 0) {
        normalizedInput.file_path = normalizedInput.path
      } else if (parsedPath) {
        normalizedInput.file_path = parsedPath
      } else if (parsedName) {
        normalizedInput.file_path = parsedName
      } else if (descriptor.detail) {
        normalizedInput.file_path = descriptor.detail
      }
    }
  }

  if (descriptor.canonicalToolName === "Bash") {
    if (Array.isArray(normalizedInput.command)) {
      normalizedInput.command =
        normalizedInput.command[normalizedInput.command.length - 1] || descriptor.detail
    } else if (!normalizedInput.command && descriptor.detail) {
      normalizedInput.command = descriptor.detail
    }
  }

  if (descriptor.canonicalToolName === "Grep" || descriptor.canonicalToolName === "Glob") {
    if (!normalizedInput.pattern) {
      if (parsedPattern) {
        normalizedInput.pattern = parsedPattern
      } else if (descriptor.detail) {
        normalizedInput.pattern = descriptor.detail
      }
    }
  }

  if (descriptor.canonicalToolName === "Grep") {
    if (!normalizedInput.path && parsedPath) {
      normalizedInput.path = parsedPath
    }
  }

  if (descriptor.canonicalToolName === "Glob") {
    if (!normalizedInput.target_directory && parsedTargetDirectory) {
      normalizedInput.target_directory = parsedTargetDirectory
    }
  }

  if (descriptor.canonicalToolName === "WebFetch") {
    if (!normalizedInput.url && descriptor.detail.startsWith("http")) {
      normalizedInput.url = descriptor.detail
    }
  }

  return normalizedInput
}

function getPartToolName(part: AnyRecord): string | null {
  if (typeof part.toolName === "string" && part.toolName.length > 0) {
    return part.toolName
  }
  if (isRecord(part.input) && typeof part.input.toolName === "string") {
    return part.input.toolName
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length)
  }
  return null
}

export function normalizeCodexToolPart(
  part: unknown,
  options?: NormalizeCodexToolPartOptions,
): unknown {
  if (!isRecord(part)) return part
  if (typeof part.type !== "string" || !part.type.startsWith("tool-")) return part

  const rawToolName = getPartToolName(part)
  const descriptor = rawToolName ? parseCodexToolDescriptor(rawToolName) : null
  const shouldNormalizeState =
    options?.normalizeState === true &&
    (part.state === "input-available" || part.state === "output-available")

  const hasCodexArgsWrapper =
    isRecord(part.input) &&
    (isRecord(part.input.args) || typeof part.input.toolName === "string")

  if (!descriptor && !hasCodexArgsWrapper && !shouldNormalizeState) {
    return part
  }

  const normalizedType = descriptor ? `tool-${descriptor.canonicalToolName}` : part.type
  const fallbackDescriptor: CodexToolDescriptor = {
    canonicalToolName: normalizedType.startsWith("tool-")
      ? normalizedType.slice("tool-".length)
      : normalizedType,
    detail: "",
    isMcp: normalizedType.startsWith("tool-mcp__"),
  }
  const normalizedInput =
    descriptor
      ? normalizeCodexToolInput(part.input, descriptor)
      : hasCodexArgsWrapper
        ? normalizeCodexToolInput(part.input, fallbackDescriptor)
        : part.input
  const rawOutput = part.output !== undefined ? part.output : part.result
  const rawResult = part.result !== undefined ? part.result : part.output
  const normalizedOutput =
    fallbackDescriptor.canonicalToolName === "AskUserQuestion"
      ? normalizeAskUserQuestionResult(rawOutput)
      : rawOutput
  const normalizedResult =
    fallbackDescriptor.canonicalToolName === "AskUserQuestion"
      ? normalizeAskUserQuestionResult(rawResult)
      : rawResult
  const outputPayload =
    normalizedOutput !== undefined ? normalizedOutput : normalizedResult
  const outputEnrichedInput =
    fallbackDescriptor.canonicalToolName === "Read"
      ? normalizeReadInputFromPayload(normalizedInput, outputPayload)
      : normalizedInput
  const finalInput =
    outputEnrichedInput !== part.input && isShallowEqual(outputEnrichedInput, part.input)
      ? part.input
      : outputEnrichedInput

  const normalizedState = shouldNormalizeState
    ? toCanonicalToolState(part.state)
    : part.state

  const typeChanged = normalizedType !== part.type
  const inputChanged = finalInput !== part.input
  const stateChanged = normalizedState !== part.state
  const outputChanged = normalizedOutput !== part.output
  const resultChanged = normalizedResult !== part.result

  if (!typeChanged && !inputChanged && !stateChanged && !outputChanged && !resultChanged) {
    return part
  }

  const normalizedPart: AnyRecord = { ...part }
  if (typeChanged) normalizedPart.type = normalizedType
  if (inputChanged) normalizedPart.input = finalInput
  if (stateChanged) normalizedPart.state = normalizedState
  if (normalizedOutput !== undefined) normalizedPart.output = normalizedOutput
  if (normalizedResult !== undefined) normalizedPart.result = normalizedResult

  return normalizedPart
}

export function normalizeCodexAssistantMessage(
  message: unknown,
  options?: NormalizeCodexToolPartOptions,
): unknown {
  if (!isRecord(message)) return message
  if (message.role !== "assistant" || !Array.isArray(message.parts)) return message

  let changed = false
  const normalizedParts = message.parts.map((part) => {
    const normalizedPart = normalizeCodexToolPart(part, options)
    if (normalizedPart !== part) changed = true
    return normalizedPart
  })

  if (!changed) return message
  return {
    ...message,
    parts: normalizedParts,
  }
}

export function normalizeCodexStreamChunk(chunk: unknown): unknown {
  if (!isRecord(chunk)) return chunk
  if (chunk.type !== "tool-input-start" && chunk.type !== "tool-input-available") {
    return chunk
  }
  if (typeof chunk.toolName !== "string" || chunk.toolName.length === 0) return chunk

  const descriptor = parseCodexToolDescriptor(chunk.toolName)
  const hasCodexArgsWrapper =
    chunk.type === "tool-input-available" &&
    isRecord(chunk.input) &&
    (isRecord(chunk.input.args) || typeof chunk.input.toolName === "string")

  if (!descriptor && !hasCodexArgsWrapper) {
    return chunk
  }

  const canonicalToolName = descriptor?.canonicalToolName || chunk.toolName
  const fallbackDescriptor: CodexToolDescriptor = {
    canonicalToolName,
    detail: "",
    isMcp: canonicalToolName.startsWith("mcp__"),
  }
  const normalizedInput =
    chunk.type === "tool-input-available"
      ? normalizeCodexToolInput(chunk.input, descriptor || fallbackDescriptor)
      : undefined
  const normalizedTitle =
    typeof chunk.title === "string" && chunk.title.trim().length > 0
      ? chunk.title
      : typeof descriptor?.detail === "string" && descriptor.detail.trim().length > 0
        ? descriptor.detail
        : undefined
  const finalInput =
    chunk.type === "tool-input-available" &&
    normalizedInput !== chunk.input &&
    isShallowEqual(normalizedInput, chunk.input)
      ? chunk.input
      : normalizedInput

  const toolNameChanged = canonicalToolName !== chunk.toolName
  const titleChanged = normalizedTitle !== undefined && normalizedTitle !== chunk.title
  const inputChanged =
    chunk.type === "tool-input-available" && finalInput !== chunk.input

  if (!toolNameChanged && !inputChanged && !titleChanged) {
    return chunk
  }

  if (chunk.type === "tool-input-available") {
    const normalizedChunk: AnyRecord = {
      ...chunk,
      toolName: canonicalToolName,
      input: finalInput,
    }
    if (normalizedTitle !== undefined) {
      normalizedChunk.title = normalizedTitle
    }
    return normalizedChunk
  }

  const normalizedChunk: AnyRecord = {
    ...chunk,
    toolName: canonicalToolName,
  }
  if (normalizedTitle !== undefined) {
    normalizedChunk.title = normalizedTitle
  }
  return normalizedChunk
}
