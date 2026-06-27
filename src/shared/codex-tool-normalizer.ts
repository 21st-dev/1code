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
  TodoWrite: "TodoWrite",
  PlanWrite: "PlanWrite",
  ExitPlanMode: "ExitPlanMode",
  AskUserQuestion: "AskUserQuestion",
  PermissionRequest: "PermissionRequest",
  ApprovalRequest: "ApprovalRequest",
}

const ACP_VERB_ALIAS_TO_TOOL_TYPE: Record<string, string> = {
  terminal: "Bash",
  run: "Bash",
  write: "Write",
  patch: "Edit",
  todo: "TodoWrite",
}

const BUILTIN_MCP_TOOL_NAMES: Record<string, { server: string; tool: string }> = {
  ListMcpResources: { server: "mcp", tool: "list_resources" },
  ListMcpResourcesTool: { server: "mcp", tool: "list_resources" },
  ReadMcpResource: { server: "mcp", tool: "read_resource" },
  ReadMcpResourceTool: { server: "mcp", tool: "read_resource" },
}

type CodexToolDescriptor = {
  canonicalToolName: string
  detail: string
  isMcp: boolean
}

export type NormalizeCodexToolPartOptions = {
  normalizeState?: boolean
}

export type CodexBlockStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"

export type CodexParsedCommandType =
  | "read"
  | "search"
  | "list_files"
  | "format"
  | "test"
  | "lint"
  | "noop"
  | "unknown"
  | (string & {})

export type CodexParsedCommand = {
  type: CodexParsedCommandType
  isFinished: boolean
  fileName?: string
  skillName?: string
  query?: string
  path?: string
}

export type CodexBaseConversationBlock = {
  id: string
  type: string
  turnId?: string
  status?: CodexBlockStatus
  sourcePart?: unknown
}

export type CodexExecBlock = CodexBaseConversationBlock & {
  type: "exec"
  command: string
  cwd?: string
  processId?: string | number | null
  executionStatus: "running" | "completed" | "interrupted" | "failed"
  parsedCmd: CodexParsedCommand
  output?: {
    stdout?: string
    stderr?: string
    combined?: string
    exitCode?: number | null
  }
  status: CodexBlockStatus
}

export type CodexMcpToolBlock = CodexBaseConversationBlock & {
  type: "mcp-tool-call"
  server: string
  tool: string
  callId: string
  input?: unknown
  result?: unknown
  rawOutput?: unknown
  appResourceUri?: string
  status: CodexBlockStatus
}

export type CodexPatchBlock = CodexBaseConversationBlock & {
  type: "patch"
  toolName: string
  input?: unknown
  output?: unknown
  status: CodexBlockStatus
}

export type CodexPatchSummaryStatus =
  | "applied"
  | "pending"
  | "streaming"
  | "rejected"
  | "stopped"

export type CodexPatchSummaryFile = {
  path: string
  added?: number
  removed?: number
  status?: CodexPatchSummaryStatus
}

export type CodexPatchSummaryOptions = {
  chatStatus?: string
  displayPath?: (path: string) => string
  excludePath?: (path: string) => boolean
}

export type CodexGeneratedImageBlock = CodexBaseConversationBlock & {
  type: "generated-image"
  data?: unknown
  url?: string
  mimeType?: string
  prompt?: string
  status: CodexBlockStatus
}

export type CodexTextOutputBlock = CodexBaseConversationBlock & {
  type: "text-output"
  title?: string
  content: string
  mimeType?: string
  status: CodexBlockStatus
}

export type CodexTodoListBlock = CodexBaseConversationBlock & {
  type: "todo-list"
  todos: unknown[]
  previousTodos?: unknown[]
  input?: unknown
  output?: unknown
  status: CodexBlockStatus
}

export type CodexProposedPlanBlock = CodexBaseConversationBlock & {
  type: "proposed-plan"
  action?: string
  plan?: unknown
  input?: unknown
  output?: unknown
  status: CodexBlockStatus
}

export type CodexActiveGoalBlock = CodexBaseConversationBlock & {
  type: "active-goal"
  title: string
  prompt?: string
  elapsed?: string
  agentLabel?: string
  changedFiles?: number
  addedLines?: number
  removedLines?: number
  status: CodexBlockStatus
}

export type CodexPermissionRequestBlock = CodexBaseConversationBlock & {
  type: "permission-request"
  input?: unknown
  result?: unknown
  status: CodexBlockStatus
}

export type CodexUserInputAutoResolutionStatus =
  | "scheduled"
  | "snoozed"
  | "resolved"
  | "removed"
  | "expired"
  | (string & {})

export type CodexUserInputAutoResolutionState = {
  requestId?: string
  status?: CodexUserInputAutoResolutionStatus
  deadlineMs?: number
  durationMs?: number
  remainingMs?: number
  defaultResponseLabel?: string
  reason?: string
}

export type CodexUserInputBlock = CodexBaseConversationBlock & {
  type: "user-input"
  prompt?: string
  input?: unknown
  result?: unknown
  autoResolution?: CodexUserInputAutoResolutionState
  status: CodexBlockStatus
}

export type CodexStatusBlock = CodexBaseConversationBlock & {
  type: "status"
  level: "info" | "warning" | "error"
  title?: string
  message?: string
  data?: unknown
  status: CodexBlockStatus
}

export type CodexDynamicToolBlock = CodexBaseConversationBlock & {
  type: "dynamic-tool-call"
  toolName: string
  input?: unknown
  output?: unknown
  status: CodexBlockStatus
}

export type CodexConversationBlock =
  | CodexExecBlock
  | CodexMcpToolBlock
  | CodexPatchBlock
  | CodexGeneratedImageBlock
  | CodexTextOutputBlock
  | CodexTodoListBlock
  | CodexProposedPlanBlock
  | CodexActiveGoalBlock
  | CodexPermissionRequestBlock
  | CodexUserInputBlock
  | CodexStatusBlock
  | CodexDynamicToolBlock

export type CodexOutputArtifactKind =
  | "image"
  | "file"
  | "text"
  | "resource"
  | "website"

export type CodexOutputArtifact = {
  id: string
  kind: CodexOutputArtifactKind
  label: string
  sourceBlockId: string
  turnId?: string
  status: CodexBlockStatus
  path?: string
  url?: string
  mimeType?: string
  prompt?: string
  content?: string
}

export function hasPrimaryCodexOutputArtifact(
  artifacts: readonly CodexOutputArtifact[],
): boolean {
  return artifacts.some((artifact) =>
    artifact.kind === "image" ||
      artifact.kind === "text" ||
      artifact.kind === "resource" ||
      artifact.kind === "website"
  )
}

export type NormalizeCodexConversationBlockOptions =
  NormalizeCodexToolPartOptions & {
    chatStatus?: string
    fallbackId?: string
    messageRole?: string
    partIndex?: number
    turnId?: string
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

  if (normalizedName.startsWith("Tool:")) {
    const payload = normalizedName.slice("Tool:".length).trim()
    const separatorIndex = payload.indexOf("/")
    if (separatorIndex === -1) return null

    const serverName = payload.slice(0, separatorIndex).trim()
    const toolName = payload.slice(separatorIndex + 1).trim().replaceAll("/", "__")
    if (!serverName || !toolName) return null

    return {
      canonicalToolName: `mcp__${serverName}__${toolName}`,
      detail: "",
      isMcp: true,
    }
  }

  const colonIndex = normalizedName.indexOf(":")
  const hasToolDetailSeparator =
    colonIndex > 0 && !/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedName)
  const label = hasToolDetailSeparator
    ? normalizedName.slice(0, colonIndex).trim()
    : normalizedName
  const detail = hasToolDetailSeparator
    ? normalizedName.slice(colonIndex + 1).trim()
    : (() => {
        const spaceIndex = normalizedName.indexOf(" ")
        return spaceIndex === -1 ? "" : normalizedName.slice(spaceIndex + 1).trim()
      })()
  const spaceIndex = label.indexOf(" ")
  const verb = spaceIndex === -1 ? label : label.slice(0, spaceIndex)
  const canonicalToolName =
    CODEX_VERB_TO_TOOL_TYPE[verb] ??
    ACP_VERB_ALIAS_TO_TOOL_TYPE[verb.toLowerCase()]
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

  if (descriptor.canonicalToolName === "Write" || descriptor.canonicalToolName === "Edit") {
    if (!normalizedInput.file_path && descriptor.detail) {
      normalizedInput.file_path = descriptor.detail
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

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const RUNTIME_STATUS_BLOCK_TITLES: Record<string, string> = {
  "realtime-state": "Realtime voice",
  "dictation-state": "Global dictation",
  "queued-follow-up": "Queued follow-up",
  "rate-limit-status": "Rate limit",
  "usage-status": "Usage",
  "project-event": "Project",
  "library-artifact": "Library artifact",
  "pull-request-status": "Pull request",
  "diagnostic-snapshot": "Diagnostics",
}

function normalizeExitCode(value: unknown): number | null | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (value === null) return null
  return undefined
}

function getNestedRecord(source: AnyRecord, key: string): AnyRecord | undefined {
  return isRecord(source[key]) ? source[key] : undefined
}

function getFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function getFirstFiniteNumber(
  source: AnyRecord | undefined,
  keys: string[],
): number | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = getFiniteNumber(source[key])
    if (value !== undefined) return value
  }
  return undefined
}

function getFirstNonEmptyStringFromRecord(
  source: AnyRecord | undefined,
  keys: string[],
): string | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = getNonEmptyString(source[key])
    if (value) return value
  }
  return undefined
}

function getUserInputAutoResolutionCandidate(
  source: AnyRecord | undefined,
): AnyRecord | undefined {
  if (!source) return undefined
  return (
    getNestedRecord(source, "autoResolution") ??
    getNestedRecord(source, "auto_resolution") ??
    getNestedRecord(source, "resolutionState") ??
    getNestedRecord(source, "resolution_state")
  )
}

function normalizeUserInputAutoResolutionState(
  part: AnyRecord,
  payloadRecord: AnyRecord,
): CodexUserInputAutoResolutionState | undefined {
  const inputRecord = isRecord(part.input) ? part.input : undefined
  const payloadInputRecord = isRecord(payloadRecord.input)
    ? payloadRecord.input
    : undefined
  const stateRecord =
    getUserInputAutoResolutionCandidate(payloadRecord) ??
    getUserInputAutoResolutionCandidate(payloadInputRecord) ??
    getUserInputAutoResolutionCandidate(part) ??
    getUserInputAutoResolutionCandidate(inputRecord)

  if (!stateRecord) return undefined

  const status =
    getFirstNonEmptyStringFromRecord(stateRecord, ["status", "state"]) ??
    getFirstNonEmptyStringFromRecord(payloadRecord, [
      "autoResolutionStatus",
      "auto_resolution_status",
    ])
  const deadlineMs = getFirstFiniteNumber(stateRecord, [
    "deadlineMs",
    "deadline_ms",
    "expiresAtMs",
    "expires_at_ms",
    "resolveAtMs",
    "resolve_at_ms",
  ])
  const durationMs = getFirstFiniteNumber(stateRecord, [
    "durationMs",
    "duration_ms",
    "timeoutMs",
    "timeout_ms",
  ])
  const remainingMs = getFirstFiniteNumber(stateRecord, [
    "remainingMs",
    "remaining_ms",
  ])

  if (!status && deadlineMs === undefined && durationMs === undefined && remainingMs === undefined) {
    return undefined
  }

  const normalized: CodexUserInputAutoResolutionState = {}
  const requestId =
    getFirstNonEmptyStringFromRecord(stateRecord, ["requestId", "request_id"]) ??
    getFirstNonEmptyStringFromRecord(payloadRecord, ["requestId", "request_id", "id"]) ??
    getFirstNonEmptyStringFromRecord(part, ["requestId", "request_id", "id"])
  if (requestId) normalized.requestId = requestId
  if (status) normalized.status = status as CodexUserInputAutoResolutionStatus
  if (deadlineMs !== undefined) normalized.deadlineMs = deadlineMs
  if (durationMs !== undefined) normalized.durationMs = durationMs
  if (remainingMs !== undefined) normalized.remainingMs = remainingMs

  const defaultResponseLabel = getFirstNonEmptyStringFromRecord(stateRecord, [
    "defaultResponseLabel",
    "default_response_label",
    "defaultLabel",
    "default_label",
    "label",
  ])
  if (defaultResponseLabel) normalized.defaultResponseLabel = defaultResponseLabel

  const reason = getFirstNonEmptyStringFromRecord(stateRecord, [
    "reason",
    "message",
  ])
  if (reason) normalized.reason = reason

  return normalized
}

function parseJsonLikeOutput(value: unknown): unknown | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function getOutputPayload(part: AnyRecord): unknown {
  if (part.output !== undefined) return part.output
  if (part.result !== undefined) return part.result
  const parsedErrorText = parseJsonLikeOutput(part.errorText)
  if (parsedErrorText !== undefined) return parsedErrorText
  const errorText = getNonEmptyString(part.errorText)
  if (errorText) {
    return {
      stderr: errorText,
      combined: errorText,
      success: false,
      status: "failed",
    }
  }
  return undefined
}

function getExitCodeFromPayload(payload: unknown): number | null | undefined {
  if (!isRecord(payload)) return undefined
  return (
    normalizeExitCode(payload.exitCode) ??
    normalizeExitCode(payload.exit_code) ??
    normalizeExitCode(payload.code)
  )
}

function getTextFromContentPayload(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim()
    return trimmed.length > 0 ? payload : undefined
  }

  if (Array.isArray(payload)) {
    const parts = payload
      .map((entry) => getTextFromContentPayload(entry))
      .filter((entry): entry is string => Boolean(entry?.trim()))
    return parts.length > 0 ? parts.join("\n") : undefined
  }

  if (!isRecord(payload)) return undefined

  const direct =
    getNonEmptyString(payload.text) ??
    getNonEmptyString(payload.output) ??
    getNonEmptyString(payload.stdout) ??
    getNonEmptyString(payload.stderr) ??
    getNonEmptyString(payload.result) ??
    getNonEmptyString(payload.value)
  if (direct) return direct

  if (payload.content !== undefined) {
    const nestedContent = getTextFromContentPayload(payload.content)
    if (nestedContent) return nestedContent
  }
  if (payload.data !== undefined) {
    const nestedData = getTextFromContentPayload(payload.data)
    if (nestedData) return nestedData
  }
  if (payload.result !== undefined) {
    const nestedResult = getTextFromContentPayload(payload.result)
    if (nestedResult) return nestedResult
  }

  return undefined
}

function getExitCodeFromText(text: string | undefined): number | undefined {
  if (!text) return undefined
  const match =
    text.match(/(?:exit[_\s-]?code|code)\s*\*{0,2}\s*[:=]\s*\*{0,2}\s*(-?\d+)/i) ??
    text.match(/退出码\s*(-?\d+)/)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeParsedTodoStatus(marker: string | undefined, text: string): string {
  if (marker === "✅" || /^\s*(?:done|completed|finished)\b/i.test(text)) {
    return "completed"
  }
  if (marker === "🔄" || /^\s*(?:active|started|in[_\s-]?progress)\b/i.test(text)) {
    return "in_progress"
  }
  return "pending"
}

function stripTodoStatusPrefix(text: string): string {
  return text
    .replace(/^\s*(?:done|completed|finished|active|started|in[_\s-]?progress|pending)\s*[:：-]\s*/i, "")
    .replace(/\*\*/g, "")
    .trim()
}

function getTodosFromText(text: string | undefined): AnyRecord[] {
  if (!text) return []
  const todos: AnyRecord[] = []
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*(?:-\s*|\*(?!\*)\s*)(?:(✅|🔄|⏳)\s*)?(.*?)\s*$/u)
    if (!match) continue
    const rawContent = stripTodoStatusPrefix(match[2] ?? "")
    if (!rawContent || /^progress\s*:/i.test(rawContent)) continue
    todos.push({
      content: rawContent,
      status: normalizeParsedTodoStatus(match[1], rawContent),
    })
  }
  return todos
}

function normalizeExecutionStatus(
  value: unknown,
): "running" | "completed" | "interrupted" | "failed" | undefined {
  const status = getNonEmptyString(value)?.toLowerCase()
  if (!status) return undefined
  if (status === "running" || status === "in_progress" || status === "started") {
    return "running"
  }
  if (status === "completed" || status === "complete" || status === "success") {
    return "completed"
  }
  if (
    status === "interrupted" ||
    status === "stopped" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "interrupted"
  }
  if (status === "failed" || status === "error" || status === "errored") {
    return "failed"
  }
  return undefined
}

function getExplicitExecutionStatus(
  part: AnyRecord,
): "running" | "completed" | "interrupted" | "failed" | undefined {
  const output = getOutputPayload(part)
  const input = getNestedRecord(part, "input")
  return (
    normalizeExecutionStatus(part.executionStatus) ??
    normalizeExecutionStatus(part.status) ??
    (isRecord(output) ? normalizeExecutionStatus(output.executionStatus) : undefined) ??
    (isRecord(output) ? normalizeExecutionStatus(output.status) : undefined) ??
    (input ? normalizeExecutionStatus(input.executionStatus) : undefined) ??
    (input ? normalizeExecutionStatus(input.execution_status) : undefined)
  )
}

function isActiveChatStatus(chatStatus: string | undefined): boolean {
  return chatStatus === "streaming" || chatStatus === "submitted"
}

function getCodexBlockStatus(
  part: AnyRecord,
  options: NormalizeCodexConversationBlockOptions | undefined,
): CodexBlockStatus {
  const explicitExecutionStatus = getExplicitExecutionStatus(part)
  if (explicitExecutionStatus === "interrupted") return "interrupted"

  const output = getOutputPayload(part)
  const state = getNonEmptyString(part.state)
  const exitCode = getExitCodeFromPayload(output)
  const hasOutput = output !== undefined
  const outputRecord = isRecord(output) ? output : undefined

  if (
    explicitExecutionStatus === "failed" ||
    state === "output-error" ||
    outputRecord?.success === false ||
    outputRecord?.isError === true ||
    outputRecord?.error !== undefined
  ) {
    return "failed"
  }

  if (typeof exitCode === "number" && exitCode !== 0) {
    return "failed"
  }

  if (
    explicitExecutionStatus === "completed" ||
    state === "result" ||
    state === "output-available" ||
    hasOutput
  ) {
    return "completed"
  }

  if (explicitExecutionStatus === "running") return "running"

  if (state === "input-streaming" || state === "input-available" || state === "call") {
    if (isActiveChatStatus(options?.chatStatus) || !options?.chatStatus) {
      return "running"
    }
    return "interrupted"
  }

  return "queued"
}

function getBlockId(
  part: AnyRecord,
  options: NormalizeCodexConversationBlockOptions | undefined,
): string {
  const input = getNestedRecord(part, "input")
  const rawId =
    getNonEmptyString(part.id) ??
    getNonEmptyString(part.toolCallId) ??
    getNonEmptyString(part.tool_call_id) ??
    (input ? getNonEmptyString(input.call_id) : undefined) ??
    (input ? getNonEmptyString(input.callId) : undefined) ??
    options?.fallbackId

  if (rawId) return rawId

  const index = options?.partIndex ?? 0
  return options?.turnId ? `${options.turnId}:tool:${index}` : `tool:${index}`
}

function getPreservedToolCallId(part: AnyRecord): string | undefined {
  const input = getNestedRecord(part, "input")
  return (
    getNonEmptyString(part.toolCallId) ??
    getNonEmptyString(part.tool_call_id) ??
    (input ? getNonEmptyString(input.toolCallId) : undefined) ??
    (input ? getNonEmptyString(input.tool_call_id) : undefined)
  )
}

function hasPatchTarget(input: unknown, output: unknown): boolean {
  const inputRecord = isRecord(input) ? input : undefined
  const outputRecord = isRecord(output) ? output : undefined
  return Boolean(
    (inputRecord &&
      (getNonEmptyString(inputRecord.file_path) ??
        getNonEmptyString(inputRecord.filePath) ??
        getNonEmptyString(inputRecord.path))) ||
      (outputRecord &&
        (getNonEmptyString(outputRecord.file_path) ??
          getNonEmptyString(outputRecord.filePath) ??
          getNonEmptyString(outputRecord.path))),
  )
}

const CODEX_PATCH_SUMMARY_TOOL_TYPES = new Set([
  "tool-Edit",
  "tool-Write",
  "tool-MultiEdit",
])

function getNormalizedPatchSummaryPart(part: unknown): AnyRecord | undefined {
  const normalized = normalizeCodexToolPart(part, { normalizeState: true })
  return isRecord(normalized) ? normalized : undefined
}

export function isCodexPatchSummaryToolPart(part: unknown): part is AnyRecord {
  const normalized = getNormalizedPatchSummaryPart(part)
  return Boolean(
    normalized?.type && CODEX_PATCH_SUMMARY_TOOL_TYPES.has(normalized.type),
  )
}

export function getCodexPatchSummaryPath(part: unknown): string | undefined {
  const normalized = getNormalizedPatchSummaryPart(part)
  if (!normalized) return undefined

  const input = isRecord(normalized.input) ? normalized.input : undefined
  const outputPayload = getOutputPayload(normalized)
  const output = isRecord(outputPayload) ? outputPayload : undefined

  return (
    (input ? getNonEmptyString(input.file_path) : undefined) ??
    (input ? getNonEmptyString(input.filePath) : undefined) ??
    (input ? getNonEmptyString(input.path) : undefined) ??
    (output ? getNonEmptyString(output.file_path) : undefined) ??
    (output ? getNonEmptyString(output.filePath) : undefined) ??
    (output ? getNonEmptyString(output.path) : undefined)
  )
}

function getPatchSummaryNumber(
  source: AnyRecord | undefined,
  keys: string[],
): number | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value)
    }
  }
  return undefined
}

function countPatchSummaryTextLines(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) return 0
  return value.split("\n").length
}

function getUnifiedPatchStats(value: unknown): {
  added: number
  removed: number
} {
  if (typeof value !== "string") return { added: 0, removed: 0 }
  let added = 0
  let removed = 0
  for (const line of value.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1
    if (line.startsWith("-") && !line.startsWith("---")) removed += 1
  }
  return { added, removed }
}

function getStructuredPatchStats(value: unknown): {
  added: number
  removed: number
} {
  if (typeof value === "string") return getUnifiedPatchStats(value)
  if (Array.isArray(value)) {
    return value.reduce(
      (total, entry) => {
        const stats = getStructuredPatchStats(entry)
        return {
          added: total.added + stats.added,
          removed: total.removed + stats.removed,
        }
      },
      { added: 0, removed: 0 },
    )
  }
  if (!isRecord(value)) return { added: 0, removed: 0 }

  const directLines = Array.isArray(value.lines)
    ? getStructuredPatchStats(value.lines)
    : { added: 0, removed: 0 }
  const hunks = Array.isArray(value.hunks)
    ? getStructuredPatchStats(value.hunks)
    : { added: 0, removed: 0 }
  const patchText =
    getNonEmptyString(value.patch) ??
    getNonEmptyString(value.diff) ??
    getNonEmptyString(value.udiff) ??
    getNonEmptyString(value.text)
  const patchTextStats = getUnifiedPatchStats(patchText)

  return {
    added: directLines.added + hunks.added + patchTextStats.added,
    removed: directLines.removed + hunks.removed + patchTextStats.removed,
  }
}

export function getCodexPatchSummaryStats(part: unknown): {
  added: number
  removed: number
} {
  const normalized = getNormalizedPatchSummaryPart(part)
  if (!normalized) return { added: 0, removed: 0 }

  const input = isRecord(normalized.input) ? normalized.input : undefined
  const outputPayload = getOutputPayload(normalized)
  const output = isRecord(outputPayload) ? outputPayload : undefined

  const explicitAdded = getPatchSummaryNumber(output, [
    "addedLines",
    "added_lines",
    "added",
    "insertions",
  ])
  const explicitRemoved = getPatchSummaryNumber(output, [
    "removedLines",
    "removed_lines",
    "removed",
    "deletions",
  ])
  if (explicitAdded !== undefined || explicitRemoved !== undefined) {
    return {
      added: explicitAdded ?? 0,
      removed: explicitRemoved ?? 0,
    }
  }

  const structuredStats = getStructuredPatchStats(
    output?.structuredPatch ??
      output?.structured_patch ??
      output?.patch ??
      output?.diff ??
      input?.structuredPatch ??
      input?.structured_patch ??
      input?.patch ??
      input?.diff,
  )
  if (structuredStats.added > 0 || structuredStats.removed > 0) {
    return structuredStats
  }

  if (normalized.type === "tool-Write") {
    return {
      added: countPatchSummaryTextLines(input?.content ?? output?.content),
      removed: 0,
    }
  }

  if (Array.isArray(input?.edits)) {
    return input.edits.reduce(
      (total: { added: number; removed: number }, edit: unknown) => {
        if (!isRecord(edit)) return total
        return {
          added: total.added + countPatchSummaryTextLines(edit.new_string),
          removed: total.removed + countPatchSummaryTextLines(edit.old_string),
        }
      },
      { added: 0, removed: 0 },
    )
  }

  return {
    added: countPatchSummaryTextLines(input?.new_string),
    removed: countPatchSummaryTextLines(input?.old_string),
  }
}

function getExplicitPatchSummaryStatus(part: AnyRecord): string | undefined {
  const input = isRecord(part.input) ? part.input : undefined
  const outputPayload = getOutputPayload(part)
  const output = isRecord(outputPayload) ? outputPayload : undefined
  return (
    getNonEmptyString(part.status) ??
    (input ? getNonEmptyString(input.status) : undefined) ??
    (output ? getNonEmptyString(output.status) : undefined)
  )?.toLowerCase()
}

function hasPatchSummaryApplicationEvidence(part: AnyRecord): boolean {
  if (part.state === "output-available" || part.state === "result") {
    return true
  }

  const outputPayload = getOutputPayload(part)
  if (outputPayload !== undefined && outputPayload !== null) return true

  const explicitStatus = getExplicitPatchSummaryStatus(part)
  return (
    explicitStatus === "applied" ||
    explicitStatus === "completed" ||
    explicitStatus === "done" ||
    explicitStatus === "success" ||
    explicitStatus === "succeeded"
  )
}

function isTargetOnlyPatchSummaryPlaceholder(part: AnyRecord): boolean {
  const input = isRecord(part.input) ? part.input : undefined
  const outputPayload = getOutputPayload(part)
  if (!hasPatchTarget(input, outputPayload)) return false

  const state = getNonEmptyString(part.state)
  if (state !== undefined && state !== "input-available" && state !== "call") {
    return false
  }

  if (outputPayload !== undefined && outputPayload !== null) return false
  if (getExplicitPatchSummaryStatus(part)) return false

  return true
}

export function getCodexPatchPartSummaryStatus(
  part: unknown,
  chatStatus?: string,
): CodexPatchSummaryStatus {
  const normalized = getNormalizedPatchSummaryPart(part)
  if (!normalized) return "applied"

  const explicitStatus = getExplicitPatchSummaryStatus(normalized)
  if (
    explicitStatus === "rejected" ||
    explicitStatus === "denied" ||
    explicitStatus === "declined"
  ) {
    return "rejected"
  }
  if (
    explicitStatus === "stopped" ||
    explicitStatus === "interrupted" ||
    explicitStatus === "cancelled" ||
    explicitStatus === "canceled"
  ) {
    return "stopped"
  }
  if (hasPatchSummaryApplicationEvidence(normalized)) return "applied"

  const blockStatus = getCodexBlockStatus(normalized, { chatStatus })
  if (blockStatus === "running" || blockStatus === "queued") {
    return normalized.state === "input-streaming" ? "streaming" : "pending"
  }
  if (blockStatus === "failed") return "rejected"
  if (getCodexPatchSummaryPath(normalized)) return "applied"
  if (blockStatus === "interrupted") return "stopped"
  return "applied"
}

export function shouldShowCodexPatchSummaryPart(
  part: unknown,
  chatStatus: string | undefined,
  stats: { added: number; removed: number },
): boolean {
  const normalized = getNormalizedPatchSummaryPart(part)
  if (!normalized) return false

  const status = getCodexPatchPartSummaryStatus(normalized, chatStatus)

  if (
    status === "pending" ||
    status === "streaming" ||
    status === "rejected" ||
    status === "stopped"
  ) {
    return true
  }

  if (stats.added > 0 || stats.removed > 0) return true

  return isTargetOnlyPatchSummaryPlaceholder(normalized)
}

export function getCodexPatchSummaryStatusFromParts(
  parts: readonly unknown[],
  options?: Pick<CodexPatchSummaryOptions, "chatStatus">,
): CodexPatchSummaryStatus | undefined {
  return getCodexPatchSummaryStatusFromStatuses(parts
    .filter(isCodexPatchSummaryToolPart)
    .map((part) => getCodexPatchPartSummaryStatus(part, options?.chatStatus)))
}

function getCodexPatchSummaryStatusFromStatuses(
  statuses: readonly (CodexPatchSummaryStatus | undefined)[],
): CodexPatchSummaryStatus | undefined {
  if (statuses.length === 0) return undefined
  if (statuses.includes("streaming")) return "streaming"
  if (statuses.includes("pending")) return "pending"
  if (statuses.includes("rejected")) return "rejected"
  if (statuses.includes("stopped")) return "stopped"
  return "applied"
}

export function getCodexPatchSummaryFilesFromParts(
  parts: readonly unknown[],
  options?: CodexPatchSummaryOptions,
): CodexPatchSummaryFile[] {
  const files = new Map<string, CodexPatchSummaryFile>()

  for (const part of parts) {
    if (!isCodexPatchSummaryToolPart(part)) continue

    const filePath = getCodexPatchSummaryPath(part)
    if (!filePath || options?.excludePath?.(filePath)) continue

    const stats = getCodexPatchSummaryStats(part)
    if (!shouldShowCodexPatchSummaryPart(part, options?.chatStatus, stats)) {
      continue
    }

    const displayPath = options?.displayPath?.(filePath) ?? filePath
    const partStatus = getCodexPatchPartSummaryStatus(part, options?.chatStatus)
    const current = files.get(displayPath)

    if (current) {
      current.added = (current.added ?? 0) + stats.added
      current.removed = (current.removed ?? 0) + stats.removed
      current.status = getCodexPatchSummaryStatusFromStatuses([
        current.status ?? "applied",
        partStatus,
      ])
      if (current.status === "applied") current.status = undefined
      continue
    }

    files.set(displayPath, {
      path: displayPath,
      added: stats.added,
      removed: stats.removed,
      status: partStatus === "applied" ? undefined : partStatus,
    })
  }

  return [...files.values()]
}

function getResolvedToolBlockStatus(
  toolName: string,
  part: AnyRecord,
  input: unknown,
  output: unknown,
  status: CodexBlockStatus,
  options: NormalizeCodexConversationBlockOptions | undefined,
): CodexBlockStatus {
  if (status !== "interrupted") return status
  if (isActiveChatStatus(options?.chatStatus)) return status

  const isPatchLikeTool =
    toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit"
  if (
    isPatchLikeTool &&
    output === undefined &&
    hasPatchTarget(input, output) &&
    (part.state === "call" || part.state === "input-available")
  ) {
    return "completed"
  }

  return status
}

function getTurnId(
  part: AnyRecord,
  options: NormalizeCodexConversationBlockOptions | undefined,
): string | undefined {
  const input = getNestedRecord(part, "input")
  return (
    options?.turnId ??
    getNonEmptyString(part.turnId) ??
    getNonEmptyString(part.turn_id) ??
    (input ? getNonEmptyString(input.turn_id) : undefined) ??
    (input ? getNonEmptyString(input.turnId) : undefined)
  )
}

function getToolNameFromNormalizedPart(part: AnyRecord): string {
  const toolName = getPartToolName(part)
  if (toolName) return toolName
  return "unknown"
}

function getCommandFromInput(input: unknown, fallback?: string): string {
  if (typeof input === "string") {
    return input.trim() || fallback || ""
  }
  if (!isRecord(input)) return fallback || ""

  const command = input.command
  if (Array.isArray(command)) {
    const lastCommand = [...command].reverse().find((entry) => typeof entry === "string")
    if (typeof lastCommand === "string" && lastCommand.trim().length > 0) {
      return lastCommand.trim()
    }
  }

  return (
    getNonEmptyString(input.command) ??
    getNonEmptyString(input.cmd) ??
    getNonEmptyString(input.shellCommand) ??
    (isRecord(input.args) ? getCommandFromInput(input.args, fallback) : fallback || "")
  )
}

function getStringFromRecord(
  source: AnyRecord | undefined,
  keys: string[],
): string | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string") return value
  }
  return undefined
}

function getExecOutput(part: AnyRecord):
  | {
      stdout?: string
      stderr?: string
      combined?: string
      exitCode?: number | null
    }
  | undefined {
  const payload = getOutputPayload(part)
  if (payload === undefined) return undefined

  if (typeof payload === "string") {
    return {
      stdout: payload,
      combined: payload,
      exitCode: getExitCodeFromText(payload),
    }
  }

  if (!isRecord(payload)) {
    const payloadText = getTextFromContentPayload(payload)
    return payloadText
      ? {
          stdout: payloadText,
          combined: payloadText,
          exitCode: getExitCodeFromText(payloadText),
        }
      : undefined
  }

  const stderr = getStringFromRecord(payload, ["stderr", "errorOutput"])
  const payloadText = getTextFromContentPayload(payload)
  const stdout =
    getStringFromRecord(payload, ["stdout", "output", "text"]) ??
    (stderr ? undefined : payloadText)
  const combined = getStringFromRecord(payload, ["combined", "combinedOutput"])
  const exitCode = getExitCodeFromPayload(payload) ?? getExitCodeFromText(payloadText)
  const output: {
    stdout?: string
    stderr?: string
    combined?: string
    exitCode?: number | null
  } = {}

  if (stdout !== undefined) output.stdout = stdout
  if (stderr !== undefined) output.stderr = stderr
  if (combined !== undefined) output.combined = combined
  if (exitCode !== undefined) output.exitCode = exitCode

  return Object.keys(output).length > 0 ? output : undefined
}

function inferParsedCommandType(command: string): CodexParsedCommandType {
  const firstToken = command.trim().split(/\s+/)[0] || ""
  if (!firstToken) return "unknown"
  if (firstToken === "rg" || firstToken === "grep") return "search"
  if (firstToken === "ls" || firstToken === "find") return "list_files"
  if (firstToken === "cat" || firstToken === "sed" || firstToken === "nl") return "read"
  if (firstToken === "prettier" || firstToken === "eslint" || firstToken === "biome") {
    return "format"
  }
  if (firstToken === "bun" || firstToken === "npm" || firstToken === "pnpm") {
    return command.includes(" test") ? "test" : "unknown"
  }
  return "unknown"
}

function getParsedCommand(
  input: unknown,
  command: string,
  status: CodexBlockStatus,
): CodexParsedCommand {
  const entries = getParsedCmdEntriesFromPayload(input)
  const firstEntry = entries[0]
  const explicitType =
    firstEntry && getNonEmptyString(firstEntry.type)
      ? getNonEmptyString(firstEntry.type)
      : undefined

  return {
    type: explicitType || inferParsedCommandType(command),
    isFinished: status !== "queued" && status !== "running",
    fileName:
      firstEntry &&
      (getNonEmptyString(firstEntry.fileName) ??
        getNonEmptyString(firstEntry.file_name) ??
        getNonEmptyString(firstEntry.name)),
    skillName:
      firstEntry &&
      (getNonEmptyString(firstEntry.skillName) ??
        getNonEmptyString(firstEntry.skill_name)),
    query:
      firstEntry &&
      (getNonEmptyString(firstEntry.query) ?? getNonEmptyString(firstEntry.pattern)),
    path:
      firstEntry &&
      (getNonEmptyString(firstEntry.path) ??
        getNonEmptyString(firstEntry.file_path) ??
        getNonEmptyString(firstEntry.target_directory)),
  }
}

function getProcessId(input: unknown): string | number | null | undefined {
  if (!isRecord(input)) return undefined
  const processId = input.process_id ?? input.processId
  if (typeof processId === "string" || typeof processId === "number" || processId === null) {
    return processId
  }
  return undefined
}

function getExecExecutionStatus(
  status: CodexBlockStatus,
): "running" | "completed" | "interrupted" | "failed" {
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  if (status === "interrupted") return "interrupted"
  return "running"
}

function parseMcpToolName(toolName: string, input: unknown): { server: string; tool: string } {
  const rawToolName = toolName.startsWith("tool-") ? toolName.slice("tool-".length) : toolName
  const builtinMcpTool = BUILTIN_MCP_TOOL_NAMES[rawToolName]
  if (builtinMcpTool) return builtinMcpTool

  if (rawToolName.startsWith("mcp__")) {
    const [server = "", ...toolParts] = rawToolName.slice("mcp__".length).split("__")
    return {
      server,
      tool: toolParts.join("__"),
    }
  }

  if (isRecord(input)) {
    return {
      server: getNonEmptyString(input.server) || "",
      tool: getNonEmptyString(input.tool) || rawToolName,
    }
  }

  return { server: "", tool: rawToolName }
}

function getMcpCallId(
  part: AnyRecord,
  blockId: string,
): string {
  const input = getNestedRecord(part, "input")
  return (
    getNonEmptyString(part.toolCallId) ??
    getNonEmptyString(part.tool_call_id) ??
    (input ? getNonEmptyString(input.call_id) : undefined) ??
    (input ? getNonEmptyString(input.callId) : undefined) ??
    blockId
  )
}

function getAppResourceUri(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  const meta = isRecord(payload._meta) ? payload._meta : undefined
  return (
    getNonEmptyString(payload.appResourceUri) ??
    getNonEmptyString(payload.app_resource_uri) ??
    getNonEmptyString(payload.resourceUri) ??
    getNonEmptyString(payload.resource_uri) ??
    (meta ? getNonEmptyString(meta["openai/outputTemplate"]) : undefined) ??
    (meta ? getNonEmptyString(meta.appResourceUri) : undefined)
  )
}

function getArrayFromRecord(
  source: AnyRecord | undefined,
  keys: string[],
): unknown[] | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (Array.isArray(value)) return value
  }
  return undefined
}

function getImageData(part: AnyRecord): unknown {
  if (part.data !== undefined) return part.data
  if (part.image !== undefined) return part.image
  if (part.output !== undefined) return part.output
  if (part.result !== undefined) return part.result
  return undefined
}

function getImageUrl(data: unknown, part: AnyRecord): string | undefined {
  return (
    getNonEmptyString(part.url) ??
    getNonEmptyString(part.src) ??
    (isRecord(data)
      ? getNonEmptyString(data.url) ??
        getNonEmptyString(data.src) ??
        getNonEmptyString(data.imageUrl) ??
        getNonEmptyString(data.image_url)
      : undefined)
  )
}

function getImageMimeType(data: unknown, part: AnyRecord): string | undefined {
  return (
    getNonEmptyString(part.mimeType) ??
    getNonEmptyString(part.mime_type) ??
    (isRecord(data)
      ? getNonEmptyString(data.mimeType) ?? getNonEmptyString(data.mime_type)
      : undefined)
  )
}

function getImagePrompt(data: unknown, part: AnyRecord): string | undefined {
  return (
    getNonEmptyString(part.prompt) ??
    (isRecord(data) ? getNonEmptyString(data.prompt) : undefined)
  )
}

function getStatusMessage(part: AnyRecord): string | undefined {
  return (
    getNonEmptyString(part.message) ??
    getNonEmptyString(part.text) ??
    getNonEmptyString(part.errorText) ??
    getNonEmptyString(part.error) ??
    (isRecord(part.data) ? getNonEmptyString(part.data.message) : undefined) ??
    (isRecord(part.data) ? getNonEmptyString(part.data.error) : undefined)
  )
}

function joinRuntimeStatusSegments(
  segments: Array<string | undefined>,
): string | undefined {
  const filtered = segments.filter((segment): segment is string =>
    Boolean(segment && segment.trim()),
  )
  return filtered.length > 0 ? filtered.join(" ") : undefined
}

function getRuntimeStatusMessage(part: AnyRecord, payload: AnyRecord): string | undefined {
  const direct =
    getStatusMessage(part) ??
    getNonEmptyString(payload.summary) ??
    getNonEmptyString(payload.title) ??
    getNonEmptyString(payload.description)
  if (direct) return direct

  const mode =
    getNonEmptyString(payload.mode) ??
    getNonEmptyString(part.mode)
  const queueState =
    getNonEmptyString(payload.queueState) ??
    getNonEmptyString(payload.queue_state)
  const windowLabel =
    getNonEmptyString(payload.window) ??
    getNonEmptyString(payload.period)
  const remaining =
    typeof payload.remaining === "number" ? `${payload.remaining} remaining` : undefined
  const limit =
    typeof payload.limit === "number" ? `of ${payload.limit}` : undefined
  const projectName =
    getNonEmptyString(payload.projectName) ??
    getNonEmptyString(payload.project_name)
  const action = getNonEmptyString(payload.action)
  const artifactKind =
    getNonEmptyString(payload.artifactKind) ??
    getNonEmptyString(payload.artifact_kind)
  const artifactTarget =
    getNonEmptyString(payload.path) ??
    getNonEmptyString(payload.url)
  const prState =
    getNonEmptyString(payload.reviewState) ??
    getNonEmptyString(payload.review_state) ??
    getNonEmptyString(payload.checksState) ??
    getNonEmptyString(payload.checks_state)
  const snapshotKind =
    getNonEmptyString(payload.snapshotKind) ??
    getNonEmptyString(payload.snapshot_kind)

  return joinRuntimeStatusSegments([
    mode,
    queueState,
    windowLabel,
    remaining,
    limit,
    projectName,
    action,
    artifactKind,
    artifactTarget,
    prState,
    snapshotKind,
  ])
}

function getTextOutputContent(part: AnyRecord, payload: AnyRecord): string | undefined {
  const direct =
    getNonEmptyString(part.content) ??
    getNonEmptyString(part.text) ??
    getNonEmptyString(part.output) ??
    getNonEmptyString(part.result) ??
    getNonEmptyString(payload.content) ??
    getNonEmptyString(payload.text) ??
    getNonEmptyString(payload.output) ??
    getNonEmptyString(payload.result)
  if (direct) return direct

  const data = part.data ?? payload.data
  if (typeof data === "string" && data.trim()) return data
  if (data !== undefined) {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  return undefined
}

function getTextOutputTitle(part: AnyRecord, payload: AnyRecord): string | undefined {
  return (
    getNonEmptyString(part.title) ??
    getNonEmptyString(part.label) ??
    getNonEmptyString(part.name) ??
    getNonEmptyString(part.filename) ??
    getNonEmptyString(payload.title) ??
    getNonEmptyString(payload.label) ??
    getNonEmptyString(payload.name) ??
    getNonEmptyString(payload.filename)
  )
}

function getTextOutputMimeType(part: AnyRecord, payload: AnyRecord): string | undefined {
  return (
    getNonEmptyString(part.mimeType) ??
    getNonEmptyString(part.mime_type) ??
    getNonEmptyString(payload.mimeType) ??
    getNonEmptyString(payload.mime_type)
  )
}

function getPayloadRecord(part: AnyRecord): AnyRecord {
  if (isRecord(part.data)) return part.data
  if (isRecord(part.output)) return part.output
  if (isRecord(part.result)) return part.result
  return part
}

function isPermissionToolName(toolName: string): boolean {
  const normalized = toolName.toLowerCase()
  return normalized.includes("permission") || normalized.includes("approval")
}

function isGeneratedImagePart(
  part: AnyRecord,
  options: NormalizeCodexConversationBlockOptions | undefined,
): boolean {
  if (part.type === "generated-image" || part.type === "generated_image") return true
  if (part.type !== "data-image") return false
  return options?.messageRole === "assistant"
}

function normalizeCodexNonToolPartToConversationBlock(
  part: AnyRecord,
  options?: NormalizeCodexConversationBlockOptions,
): CodexConversationBlock | null {
  const id = getBlockId(part, options)
  const turnId = getTurnId(part, options)
  const status = getCodexBlockStatus(part, options)
  const normalizedType = part.type.replaceAll("_", "-")
  const payloadRecord = getPayloadRecord(part)
  const base = {
    id,
    turnId,
    sourcePart: part,
  }

  if (normalizedType === "conversation-block" && isRecord(part.block)) {
    return normalizeCodexNonToolPartToConversationBlock(
      {
        ...part.block,
        sourcePart: part,
      },
      options,
    )
  }

  if (isGeneratedImagePart(part, options)) {
    const data = getImageData(part)
    const resolvedStatus = status === "queued" && data !== undefined ? "completed" : status
    const imageBlock: CodexGeneratedImageBlock = {
      ...base,
      type: "generated-image",
      data,
      url: getImageUrl(data, part),
      mimeType: getImageMimeType(data, part),
      prompt: getImagePrompt(data, part),
      status: resolvedStatus,
    }
    return imageBlock
  }

  if (
    normalizedType === "data-text" ||
    normalizedType === "data-output" ||
    normalizedType === "text-output" ||
    normalizedType === "output-text"
  ) {
    const content = getTextOutputContent(part, payloadRecord)
    if (!content) return null
    const textOutputBlock: CodexTextOutputBlock = {
      ...base,
      type: "text-output",
      title: getTextOutputTitle(part, payloadRecord),
      content,
      mimeType: getTextOutputMimeType(part, payloadRecord),
      status: status === "queued" ? "completed" : status,
    }
    return textOutputBlock
  }

  if (normalizedType === "todo-list" || normalizedType === "data-todo-list") {
    const todoBlock: CodexTodoListBlock = {
      ...base,
      type: "todo-list",
      todos:
        getArrayFromRecord(payloadRecord, ["newTodos", "todos", "items"]) ??
        [],
      previousTodos: getArrayFromRecord(payloadRecord, ["oldTodos", "previousTodos"]),
      input: part.input ?? payloadRecord.input ?? payloadRecord,
      output: part.output ?? payloadRecord.output ?? part.result,
      status,
    }
    return todoBlock
  }

  if (
    normalizedType === "proposed-plan" ||
    normalizedType === "plan" ||
    normalizedType === "data-plan"
  ) {
    const planBlock: CodexProposedPlanBlock = {
      ...base,
      type: "proposed-plan",
      action: getNonEmptyString(payloadRecord.action),
      plan: payloadRecord.plan ?? payloadRecord,
      input: part.input ?? payloadRecord.input ?? payloadRecord,
      output: part.output ?? payloadRecord.output ?? part.result,
      status,
    }
    return planBlock
  }

  if (
    normalizedType === "permission-request" ||
    normalizedType === "approval-request" ||
    normalizedType === "data-permission-request"
  ) {
    const permissionBlock: CodexPermissionRequestBlock = {
      ...base,
      type: "permission-request",
      input: part.input ?? payloadRecord.input ?? payloadRecord,
      result: part.result ?? payloadRecord.result ?? part.output,
      status,
    }
    return permissionBlock
  }

  if (
    normalizedType === "user-input" ||
    normalizedType === "ask-user-question" ||
    normalizedType === "data-user-input"
  ) {
    const userInputBlock: CodexUserInputBlock = {
      ...base,
      type: "user-input",
      prompt:
        getNonEmptyString(payloadRecord.question) ??
        getNonEmptyString(payloadRecord.prompt) ??
        getNonEmptyString(payloadRecord.message) ??
        getStatusMessage(part),
      input: part.input ?? payloadRecord.input ?? payloadRecord,
      result: part.result ?? payloadRecord.result ?? part.output,
      autoResolution: normalizeUserInputAutoResolutionState(part, payloadRecord),
      status,
    }
    return userInputBlock
  }

  if (
    normalizedType === "dynamic-tool-call" ||
    normalizedType === "data-dynamic-tool-call"
  ) {
    const dynamicBlock: CodexDynamicToolBlock = {
      ...base,
      type: "dynamic-tool-call",
      toolName:
        getNonEmptyString(payloadRecord.toolName) ??
        getNonEmptyString(payloadRecord.tool_name) ??
        getNonEmptyString(part.toolName) ??
        "dynamic-tool",
      input: part.input ?? payloadRecord.input ?? payloadRecord,
      output: part.output ?? payloadRecord.output ?? part.result,
      status,
    }
    return dynamicBlock
  }

  if (normalizedType === "active-goal" || normalizedType === "data-active-goal") {
    const goalBlock: CodexActiveGoalBlock = {
      ...base,
      type: "active-goal",
      title:
        getNonEmptyString(payloadRecord.title) ??
        getNonEmptyString(payloadRecord.goal) ??
        "Active goal",
      prompt:
        getNonEmptyString(payloadRecord.prompt) ??
        getNonEmptyString(payloadRecord.description),
      elapsed: getNonEmptyString(payloadRecord.elapsed),
      agentLabel:
        getNonEmptyString(payloadRecord.agentLabel) ??
        getNonEmptyString(payloadRecord.agent_label),
      changedFiles: getPatchSummaryNumber(payloadRecord, [
        "changedFiles",
        "changed_files",
      ]),
      addedLines: getPatchSummaryNumber(payloadRecord, [
        "addedLines",
        "added_lines",
      ]),
      removedLines: getPatchSummaryNumber(payloadRecord, [
        "removedLines",
        "removed_lines",
      ]),
      status,
    }
    return goalBlock
  }

  const runtimeStatusTitle = RUNTIME_STATUS_BLOCK_TITLES[normalizedType]
  if (runtimeStatusTitle) {
    const statusBlock: CodexStatusBlock = {
      ...base,
      type: "status",
      level: part.status === "failed" ? "error" : "info",
      title:
        getNonEmptyString(payloadRecord.title) ??
        getNonEmptyString(part.title) ??
        runtimeStatusTitle,
      message: getRuntimeStatusMessage(part, payloadRecord),
      data: part.data ?? payloadRecord,
      status,
    }
    return statusBlock
  }

  if (part.type === "stream-error" || part.type === "error" || part.type === "data-error") {
    const statusBlock: CodexStatusBlock = {
      ...base,
      type: "status",
      level: "error",
      message: getStatusMessage(part),
      data: part.data ?? part.error ?? part,
      status: "failed",
    }
    return statusBlock
  }

  if (part.type === "status") {
    const level =
      part.level === "warning" || part.level === "error" || part.level === "info"
        ? part.level
        : "info"
    const statusBlock: CodexStatusBlock = {
      ...base,
      type: "status",
      level,
      message: getStatusMessage(part),
      data: part.data,
      status,
    }
    return statusBlock
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
  let normalizedOutput = part.output !== undefined ? part.output : part.result
  const normalizedResult = part.result !== undefined ? part.result : part.output
  const outputPayload =
    normalizedOutput !== undefined ? normalizedOutput : normalizedResult
  let outputEnrichedInput =
    fallbackDescriptor.canonicalToolName === "Read"
      ? normalizeReadInputFromPayload(normalizedInput, outputPayload)
      : normalizedInput
  if (fallbackDescriptor.canonicalToolName === "TodoWrite") {
    const inputRecord = isRecord(outputEnrichedInput) ? outputEnrichedInput : undefined
    const outputRecord =
      isRecord(normalizedOutput) && !Array.isArray(normalizedOutput)
        ? normalizedOutput
        : undefined
    const existingTodos =
      getArrayFromRecord(inputRecord, ["todos"]) ??
      getArrayFromRecord(outputRecord, ["newTodos", "todos"])
    if (!existingTodos) {
      const outputText = getTextFromContentPayload(outputPayload)
      const todos = getTodosFromText(outputText)
      if (todos.length > 0) {
        outputEnrichedInput = {
          ...(inputRecord ?? {}),
          todos,
        }
        normalizedOutput = {
          ...(outputRecord ?? {}),
          oldTodos: getArrayFromRecord(outputRecord, ["oldTodos", "previousTodos"]) ?? [],
          newTodos: todos,
          text: outputText,
        }
      }
    }
  }
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

  const preservedToolCallId = getPreservedToolCallId(part)
  if (
    preservedToolCallId &&
    normalizedPart.toolCallId === undefined &&
    normalizedPart.tool_call_id === undefined
  ) {
    normalizedPart.toolCallId = preservedToolCallId
  }

  return normalizedPart
}

export function normalizeCodexToolPartToConversationBlock(
  part: unknown,
  options?: NormalizeCodexConversationBlockOptions,
): CodexConversationBlock | null {
  const normalizedPart = normalizeCodexToolPart(part, {
    normalizeState: options?.normalizeState ?? true,
  })
  if (!isRecord(normalizedPart)) return null
  if (
    typeof normalizedPart.type !== "string" ||
    !normalizedPart.type.startsWith("tool-")
  ) {
    return null
  }

  const toolName = getToolNameFromNormalizedPart(normalizedPart)
  const id = getBlockId(normalizedPart, options)
  const turnId = getTurnId(normalizedPart, options)
  const input = normalizedPart.input
  const output = getOutputPayload(normalizedPart)
  const status = getResolvedToolBlockStatus(
    toolName,
    normalizedPart,
    input,
    output,
    getCodexBlockStatus(normalizedPart, options),
    options,
  )
  const base = {
    id,
    turnId,
    status,
    sourcePart: normalizedPart,
  }

  if (toolName === "Bash" || toolName === "Run") {
    const command = getCommandFromInput(input)
    const execOutput = getExecOutput(normalizedPart)
    const execBlock: CodexExecBlock = {
      ...base,
      type: "exec",
      command,
      cwd: isRecord(input) ? getNonEmptyString(input.cwd) : undefined,
      processId: getProcessId(input),
      executionStatus: getExecExecutionStatus(status),
      parsedCmd: getParsedCommand(input, command, status),
      output: execOutput,
    }
    return execBlock
  }

  if (toolName.startsWith("mcp__") || BUILTIN_MCP_TOOL_NAMES[toolName]) {
    const { server, tool } = parseMcpToolName(toolName, input)
    const mcpBlock: CodexMcpToolBlock = {
      ...base,
      type: "mcp-tool-call",
      server,
      tool,
      callId: getMcpCallId(normalizedPart, id),
      input,
      result: output,
      rawOutput: output,
      appResourceUri: getAppResourceUri(output),
    }
    return mcpBlock
  }

  if (toolName === "TodoWrite") {
    const inputRecord = isRecord(input) ? input : undefined
    const outputRecord = isRecord(output) ? output : undefined
    const todoBlock: CodexTodoListBlock = {
      ...base,
      type: "todo-list",
      todos:
        getArrayFromRecord(outputRecord, ["newTodos", "todos"]) ??
        getArrayFromRecord(inputRecord, ["todos"]) ??
        [],
      previousTodos: getArrayFromRecord(outputRecord, ["oldTodos", "previousTodos"]),
      input,
      output,
    }
    return todoBlock
  }

  if (toolName === "PlanWrite" || toolName === "ExitPlanMode") {
    const inputRecord = isRecord(input) ? input : undefined
    const outputRecord = isRecord(output) ? output : undefined
    const planBlock: CodexProposedPlanBlock = {
      ...base,
      type: "proposed-plan",
      action: inputRecord ? getNonEmptyString(inputRecord.action) : undefined,
      plan: inputRecord?.plan ?? outputRecord?.plan,
      input,
      output,
    }
    return planBlock
  }

  if (toolName === "AskUserQuestion") {
    const inputRecord = isRecord(input) ? input : undefined
    const userInputBlock: CodexUserInputBlock = {
      ...base,
      type: "user-input",
      prompt:
        (inputRecord
          ? getNonEmptyString(inputRecord.question) ??
            getNonEmptyString(inputRecord.prompt) ??
            getNonEmptyString(inputRecord.message)
          : undefined) ?? getStatusMessage(normalizedPart),
      input,
      result: output,
      autoResolution: normalizeUserInputAutoResolutionState(
        normalizedPart,
        inputRecord ?? {},
      ),
    }
    return userInputBlock
  }

  if (isPermissionToolName(toolName)) {
    const permissionBlock: CodexPermissionRequestBlock = {
      ...base,
      type: "permission-request",
      input,
      result: output,
    }
    return permissionBlock
  }

  if (toolName === "Edit" || toolName === "Write" || toolName === "MultiEdit") {
    const patchBlock: CodexPatchBlock = {
      ...base,
      type: "patch",
      toolName,
      input,
      output,
    }
    return patchBlock
  }

  const dynamicBlock: CodexDynamicToolBlock = {
    ...base,
    type: "dynamic-tool-call",
    toolName,
    input,
    output,
  }
  return dynamicBlock
}

export function normalizeCodexPartToConversationBlock(
  part: unknown,
  options?: NormalizeCodexConversationBlockOptions,
): CodexConversationBlock | null {
  if (isRecord(part)) {
    const nonToolBlock = normalizeCodexNonToolPartToConversationBlock(part, options)
    if (nonToolBlock) return nonToolBlock
  }

  return normalizeCodexToolPartToConversationBlock(part, options)
}

export function normalizeCodexConversationBlocksFromMessage(
  message: unknown,
  options?: NormalizeCodexConversationBlockOptions,
): CodexConversationBlock[] {
  if (!isRecord(message) || !Array.isArray(message.parts)) return []
  const messageRole = getNonEmptyString(message.role)
  const turnId =
    options?.turnId ??
    getNonEmptyString(message.id) ??
    getNonEmptyString(message.turnId) ??
    getNonEmptyString(message.turn_id)

  return message.parts.flatMap((part, partIndex) => {
    const block = normalizeCodexPartToConversationBlock(part, {
      ...options,
      messageRole,
      partIndex,
      turnId,
    })
    return block ? [block] : []
  })
}

function getBaseName(pathLike: string): string {
  const cleaned = pathLike.trim().replace(/\/+$/, "")
  if (!cleaned) return pathLike
  return cleaned.split(/[\\/]/).filter(Boolean).pop() || cleaned
}

function getDirectoryName(pathLike: string): string {
  const cleaned = pathLike.trim().replace(/\/+$/, "")
  const parts = cleaned.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 1) return ""
  const prefix = cleaned.startsWith("/") ? "/" : ""
  return `${prefix}${parts.slice(0, -1).join("/")}`
}

function normalizeFilePathForArtifact(pathLike: string): string {
  return pathLike.trim().replace(/\\/g, "/").replace(/\/+$/, "")
}

function isHtmlFilePath(pathLike: string | undefined): boolean {
  if (!pathLike) return false
  return /\.x?html?$/i.test(pathLike.split(/[?#]/, 1)[0] ?? pathLike)
}

function encodeUrlPath(pathLike: string): string {
  return pathLike
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function appendPathToBaseUrl(baseUrl: string, pathLike: string): string {
  const encodedPath = encodeUrlPath(pathLike)
  if (!encodedPath) return baseUrl
  return `${baseUrl.replace(/\/+$/, "")}/${encodedPath}`
}

function displayUrlHostAndPath(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`
  } catch {
    return url
  }
}

type LocalWebsiteCandidate = {
  baseUrl: string
  root?: string
  explicitTarget?: string
}

function normalizeLocalPreviewUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === "0.0.0.0" || parsed.hostname === "::") {
      parsed.hostname = "127.0.0.1"
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function getLocalUrlCandidates(text: string): string[] {
  const matches = text.matchAll(
    /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s'"<>)\]]*)?/gi,
  )
  return Array.from(matches, (match) => normalizeLocalPreviewUrl(match[0]))
}

function getHttpServerDirectory(command: string): string | undefined {
  const directoryMatch =
    command.match(/--directory(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/i) ??
    command.match(/-d(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/i)
  return directoryMatch?.[1] ?? directoryMatch?.[2] ?? directoryMatch?.[3]
}

function getLocalWebsiteCandidatesFromExec(block: CodexExecBlock): LocalWebsiteCandidate[] {
  const command = block.command || ""
  const outputText = [
    block.output?.combined,
    block.output?.stdout,
    block.output?.stderr,
  ].filter(Boolean).join("\n")
  const text = [command, outputText].filter(Boolean).join("\n")
  const candidates: LocalWebsiteCandidate[] = []
  const seen = new Set<string>()

  for (const url of getLocalUrlCandidates(text)) {
    try {
      const parsed = new URL(url)
      const pathname = decodeURIComponent(parsed.pathname || "/")
      const explicitTarget = isHtmlFilePath(pathname) ? url : undefined
      if (!explicitTarget) {
        parsed.pathname = "/"
        parsed.search = ""
        parsed.hash = ""
      }
      const baseUrl = normalizeLocalPreviewUrl(parsed.toString())
      if (seen.has(`${baseUrl}|${explicitTarget ?? ""}`)) continue
      seen.add(`${baseUrl}|${explicitTarget ?? ""}`)
      candidates.push({ baseUrl, root: block.cwd, explicitTarget })
    } catch {
      // Ignore malformed local URLs surfaced in terminal logs.
    }
  }

  const pythonServerMatch = command.match(
    /\bpython(?:3(?:\.\d+)?)?\s+-m\s+http\.server(?:\s+(\d+))?/i,
  )
  if (pythonServerMatch) {
    const port = pythonServerMatch[1] || "8000"
    const root = getHttpServerDirectory(command) || block.cwd
    const baseUrl = `http://127.0.0.1:${port}/`
    if (!seen.has(`${baseUrl}|`)) {
      seen.add(`${baseUrl}|`)
      candidates.push({ baseUrl, root })
    }
  }

  return candidates
}

function getRelativeWebsitePath(
  filePath: string,
  candidate: LocalWebsiteCandidate,
): string | undefined {
  if (candidate.explicitTarget) return ""

  const normalizedFilePath = normalizeFilePathForArtifact(filePath)
  const normalizedRoot = candidate.root
    ? normalizeFilePathForArtifact(candidate.root)
    : ""

  if (!normalizedRoot) return getBaseName(filePath)
  if (normalizedFilePath === normalizedRoot) return getBaseName(filePath)
  if (normalizedFilePath.startsWith(`${normalizedRoot}/`)) {
    return normalizedFilePath.slice(normalizedRoot.length + 1)
  }

  const fileDirectory = getDirectoryName(filePath)
  if (fileDirectory && normalizeFilePathForArtifact(fileDirectory) === normalizedRoot) {
    return getBaseName(filePath)
  }

  return undefined
}

function getWebsitePreviewUrlForFile(
  filePath: string,
  candidates: LocalWebsiteCandidate[],
): string | undefined {
  for (const candidate of candidates) {
    if (candidate.explicitTarget) return candidate.explicitTarget
    const relativePath = getRelativeWebsitePath(filePath, candidate)
    if (relativePath === undefined) continue
    return appendPathToBaseUrl(candidate.baseUrl, relativePath)
  }
  return undefined
}

function promoteHtmlFileArtifactsToWebsites(
  artifacts: CodexOutputArtifact[],
  blocks: CodexConversationBlock[],
): CodexOutputArtifact[] {
  const candidates = blocks.flatMap((block) =>
    block.type === "exec" ? getLocalWebsiteCandidatesFromExec(block) : [],
  )
  if (!candidates.length) return artifacts

  return artifacts.map((artifact) => {
    const filePath = artifact.path || artifact.url
    if (!filePath || artifact.kind !== "file" || !isHtmlFilePath(filePath)) {
      return artifact
    }
    const previewUrl = getWebsitePreviewUrlForFile(filePath, candidates)
    if (!previewUrl) return artifact

    return {
      ...artifact,
      id: `${artifact.id}:website`,
      kind: "website",
      label: displayUrlHostAndPath(previewUrl),
      url: previewUrl,
      mimeType: "text/html",
    }
  })
}

function getMcpResultContentBlocks(result: unknown): AnyRecord[] {
  const content = isRecord(result) && Array.isArray(result.content)
    ? result.content
    : Array.isArray(result)
      ? result
      : []
  return content.filter(isRecord)
}

function getMcpResourceObject(block: AnyRecord): AnyRecord {
  return isRecord(block.resource) ? block.resource : block
}

function getMcpResourceUri(block: AnyRecord): string | undefined {
  const resource = getMcpResourceObject(block)
  return (
    getNonEmptyString(resource.uri) ??
    getNonEmptyString(resource.url) ??
    getNonEmptyString(block.uri) ??
    getNonEmptyString(block.url)
  )
}

function getMcpResourceMimeType(block: AnyRecord): string | undefined {
  const resource = getMcpResourceObject(block)
  return (
    getNonEmptyString(resource.mimeType) ??
    getNonEmptyString(resource.mime_type) ??
    getNonEmptyString(block.mimeType) ??
    getNonEmptyString(block.mime_type)
  )
}

function getMcpResourceText(block: AnyRecord): string | undefined {
  const resource = getMcpResourceObject(block)
  return (
    getNonEmptyString(resource.text) ??
    getNonEmptyString(block.text) ??
    getNonEmptyString(resource.content) ??
    getNonEmptyString(block.content)
  )
}

function getMcpResourceLabel(block: AnyRecord, uri: string, fallback: string): string {
  const resource = getMcpResourceObject(block)
  return (
    getNonEmptyString(block.name) ??
    getNonEmptyString(block.title) ??
    getNonEmptyString(resource.name) ??
    getNonEmptyString(resource.title) ??
    getBaseName(uri) ??
    fallback
  )
}

function getMcpImageDataUrl(block: AnyRecord): string | undefined {
  const uri = getNonEmptyString(block.uri) ?? getNonEmptyString(block.url)
  if (uri) return uri
  const data = getNonEmptyString(block.data) ?? getNonEmptyString(block.blob)
  if (!data) return undefined
  if (data.startsWith("data:")) return data
  const mimeType = getMcpResourceMimeType(block) ?? "image/png"
  return `data:${mimeType};base64,${data}`
}

function getMcpStructuredContentText(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined
  const structuredContent = result.structuredContent ?? result.structured_content
  if (structuredContent === undefined) return undefined
  if (typeof structuredContent === "string") return structuredContent
  try {
    return JSON.stringify(structuredContent, null, 2)
  } catch {
    return undefined
  }
}

function getPatchFilePath(block: CodexPatchBlock): string | undefined {
  const input = isRecord(block.input) ? block.input : undefined
  const output = isRecord(block.output) ? block.output : undefined

  return (
    (input ? getNonEmptyString(input.file_path) : undefined) ??
    (input ? getNonEmptyString(input.filePath) : undefined) ??
    (input ? getNonEmptyString(input.path) : undefined) ??
    (output ? getNonEmptyString(output.file_path) : undefined) ??
    (output ? getNonEmptyString(output.filePath) : undefined) ??
    (output ? getNonEmptyString(output.path) : undefined)
  )
}

function codexOutputArtifactsFromBlock(
  block: CodexConversationBlock,
  index: number,
): CodexOutputArtifact[] {
  if (block.type === "generated-image") {
    const imageIndex = index + 1
    const imageFileName = block.url && !block.url.startsWith("data:")
      ? getBaseName(block.url.split("?")[0] || "")
      : ""
    const label = imageFileName || `Generated image ${imageIndex}`

    return [{
      id: `${block.id}:artifact:image`,
      kind: "image",
      label,
      sourceBlockId: block.id,
      turnId: block.turnId,
      status: block.status,
      url: block.url,
      mimeType: block.mimeType,
      prompt: block.prompt,
    }]
  }

  if (block.type === "patch") {
    const path = getPatchFilePath(block)
    if (!path) return []
    return [{
      id: `${block.id}:artifact:file`,
      kind: "file",
      label: getBaseName(path),
      sourceBlockId: block.id,
      turnId: block.turnId,
      status: block.status,
      path,
    }]
  }

  if (block.type === "text-output") {
    return [{
      id: `${block.id}:artifact:text`,
      kind: "text",
      label: block.title || `Output ${index + 1}`,
      sourceBlockId: block.id,
      turnId: block.turnId,
      status: block.status,
      mimeType: block.mimeType,
      content: block.content,
    }]
  }

  if (block.type === "mcp-tool-call") {
    const artifacts: CodexOutputArtifact[] = []
    const seenResources = new Set<string>()
    const contentBlocks = getMcpResultContentBlocks(block.result)

    contentBlocks.forEach((contentBlock, contentIndex) => {
      const contentType = getNonEmptyString(contentBlock.type)
      if (contentType === "image") {
        const url = getMcpImageDataUrl(contentBlock)
        if (!url) return
        artifacts.push({
          id: `${block.id}:artifact:image:${contentIndex}`,
          kind: "image",
          label:
            getNonEmptyString(contentBlock.name) ??
            getNonEmptyString(contentBlock.title) ??
            `Image output ${index + artifacts.length + 1}`,
          sourceBlockId: block.id,
          turnId: block.turnId,
          status: block.status,
          url,
          mimeType: getMcpResourceMimeType(contentBlock),
          prompt: getNonEmptyString(contentBlock.alt),
        })
        return
      }

      if (
        contentType !== "resource_link" &&
        contentType !== "embedded_resource" &&
        contentType !== "resource" &&
        !isRecord(contentBlock.resource)
      ) {
        return
      }

      const uri = getMcpResourceUri(contentBlock)
      if (!uri) return
      seenResources.add(uri)
      artifacts.push({
        id: `${block.id}:artifact:resource:${contentIndex}`,
        kind: "resource",
        label: getMcpResourceLabel(
          contentBlock,
          uri,
          `Resource ${index + artifacts.length + 1}`,
        ),
        sourceBlockId: block.id,
        turnId: block.turnId,
        status: block.status,
        url: uri,
        mimeType: getMcpResourceMimeType(contentBlock),
        content: getMcpResourceText(contentBlock),
      })
    })

    if (block.appResourceUri && !seenResources.has(block.appResourceUri)) {
      artifacts.push({
        id: `${block.id}:artifact:resource:app`,
        kind: "resource",
        label: getBaseName(block.appResourceUri) || `${block.server}.${block.tool}`,
        sourceBlockId: block.id,
        turnId: block.turnId,
        status: block.status,
        url: block.appResourceUri,
        mimeType: "application/vnd.openai.app+html",
        content: getMcpStructuredContentText(block.result),
      })
    }

    return artifacts
  }

  return []
}

export function getCodexOutputArtifactsFromBlocks(
  blocks: CodexConversationBlock[],
): CodexOutputArtifact[] {
  const artifacts: CodexOutputArtifact[] = []

  for (const block of blocks) {
    artifacts.push(...codexOutputArtifactsFromBlock(block, artifacts.length))
  }

  return promoteHtmlFileArtifactsToWebsites(artifacts, blocks)
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
