import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { StringDecoder } from "node:string_decoder"
import type { AgentPermissionMode } from "./types"

export type CodexNativeBridgeAction = "start" | "resume" | "fork"

export type CodexNativeBridgeKind =
  | "codex-exec-start"
  | "codex-exec-resume"
  | "codex-tui-fork"

export type CodexNativeBridgeMode = "headless-exec" | "native-tui"
export type CodexNativePromptSource = "stdin" | "argument" | "none"

export interface CodexNativeSessionBridgePlan {
  engine: "codex"
  action: CodexNativeBridgeAction
  bridge: CodexNativeBridgeKind
  mode: CodexNativeBridgeMode
  command: string
  args: string[]
  cwd: string
  sessionId?: string
  modelId?: string
  modelReasoningEffort?: string
  permissionMode: AgentPermissionMode
  promptSource: CodexNativePromptSource
  imagePaths: string[]
  imageCount: number
  canRunHeadless: boolean
  notes: string[]
}

export interface CodexNativeImageAttachment {
  base64Data: string
  mediaType: string
  filename?: string | null
}

export interface BuildCodexNativeSessionBridgePlanInput {
  action: CodexNativeBridgeAction
  sessionId?: string | null
  cwd: string
  modelId?: string | null
  permissionMode?: AgentPermissionMode | null
  prompt?: string | null
  promptSource?: CodexNativePromptSource
  command?: string | null
  includeJson?: boolean
  skipGitRepoCheck?: boolean
  imagePaths?: string[] | null
}

export interface CodexNativeCommandRunnerInput {
  command: string
  args: string[]
  cwd: string
  stdin?: string
  env?: NodeJS.ProcessEnv
  abortSignal?: AbortSignal
  onStdoutJsonEvent?: (event: CodexJsonlEvent) => void
}

export interface CodexNativeCommandRunnerResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export type CodexNativeCommandRunner = (
  input: CodexNativeCommandRunnerInput,
) => Promise<CodexNativeCommandRunnerResult>

export type CodexJsonlEvent = Record<string, unknown>

export type CodexNativeToolEvent =
  | {
      kind: "tool-input"
      callId: string
      toolName: string
      input: unknown
      title?: string
    }
  | {
      kind: "tool-output"
      callId: string
      output: unknown
      toolName?: string
      input?: unknown
      title?: string
      isError?: boolean
    }

export interface CodexExecResumeEventSummary {
  nativeSessionId?: string
  lastText?: string
  usage?: Record<string, unknown>
  error?: string
}

export interface RunCodexExecResumeBridgeInput {
  sessionId: string
  cwd: string
  prompt: string
  modelId?: string | null
  permissionMode?: AgentPermissionMode | null
  command?: string | null
  includeJson?: boolean
  skipGitRepoCheck?: boolean
  runner?: CodexNativeCommandRunner
  env?: NodeJS.ProcessEnv
  abortSignal?: AbortSignal
  onEvent?: (event: CodexJsonlEvent) => void
  images?: CodexNativeImageAttachment[] | null
}

export interface RunCodexExecStartBridgeInput {
  cwd: string
  prompt: string
  modelId?: string | null
  permissionMode?: AgentPermissionMode | null
  command?: string | null
  includeJson?: boolean
  skipGitRepoCheck?: boolean
  runner?: CodexNativeCommandRunner
  env?: NodeJS.ProcessEnv
  abortSignal?: AbortSignal
  onEvent?: (event: CodexJsonlEvent) => void
  images?: CodexNativeImageAttachment[] | null
}

export interface RunCodexExecBridgeInput
  extends Omit<RunCodexExecStartBridgeInput, "runner"> {
  action: "start" | "resume"
  sessionId?: string | null
  runner?: CodexNativeCommandRunner
}

export interface CodexExecResumeBridgeResult
  extends CodexNativeCommandRunnerResult,
    CodexExecResumeEventSummary {
  success: boolean
  plan: CodexNativeSessionBridgePlan
  events: CodexJsonlEvent[]
}

function cleanString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function splitCodexTextForStreamingDeltas(
  text: string,
  maxChunkLength = 36,
): string[] {
  if (!text) return []
  if (maxChunkLength <= 0 || text.length <= maxChunkLength) return [text]

  const chunks: string[] = []
  let remaining = text
  const minSoftBreakIndex = Math.max(1, Math.floor(maxChunkLength * 0.45))

  while (remaining.length > maxChunkLength) {
    const candidate = remaining.slice(0, maxChunkLength + 1)
    let breakIndex = -1

    for (let index = candidate.length - 1; index >= minSoftBreakIndex; index -= 1) {
      const char = candidate[index]
      if (char && /[\s\n.,!?;:，。！？；：、]/.test(char)) {
        breakIndex = index + 1
        break
      }
    }

    if (breakIndex <= 0) {
      breakIndex = maxChunkLength
    }

    chunks.push(remaining.slice(0, breakIndex))
    remaining = remaining.slice(breakIndex)
  }

  if (remaining) chunks.push(remaining)
  return chunks
}

function requireCleanString(
  value: string | null | undefined,
  label: string,
): string {
  const cleaned = cleanString(value)
  if (!cleaned) {
    throw new Error(`Codex native ${label} is required.`)
  }
  return cleaned
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function splitModelAndReasoning(modelId: string | undefined): {
  modelId?: string
  reasoningEffort?: string
} {
  const cleaned = cleanString(modelId)
  if (!cleaned) return {}

  const separatorIndex = cleaned.indexOf("/")
  if (separatorIndex === -1) return { modelId: cleaned }

  const baseModel = cleanString(cleaned.slice(0, separatorIndex))
  const reasoningEffort = cleanString(cleaned.slice(separatorIndex + 1))
  return {
    ...(baseModel ? { modelId: baseModel } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  }
}

function appendCodexModelArgs(
  args: string[],
  modelId: string | undefined,
): {
  modelId?: string
  modelReasoningEffort?: string
} {
  const parsed = splitModelAndReasoning(modelId)
  if (parsed.modelId) args.push("-m", parsed.modelId)
  if (parsed.reasoningEffort) {
    args.push("-c", `model_reasoning_effort=${tomlString(parsed.reasoningEffort)}`)
  }

  return {
    ...(parsed.modelId ? { modelId: parsed.modelId } : {}),
    ...(parsed.reasoningEffort
      ? { modelReasoningEffort: parsed.reasoningEffort }
      : {}),
  }
}

function appendCodexExecPermissionArgs(
  args: string[],
  permissionMode: AgentPermissionMode,
): string[] {
  if (permissionMode === "bypass") {
    args.push("--dangerously-bypass-approvals-and-sandbox")
    return [
      "Moss bypass maps to Codex dangerous approval and sandbox bypass.",
    ]
  }

  const sandboxMode =
    permissionMode === "plan" ? "read-only" : "workspace-write"
  args.push("-c", `sandbox_mode=${tomlString(sandboxMode)}`)
  args.push("-c", `approval_policy=${tomlString("never")}`)

  return [
    permissionMode === "plan"
      ? "Moss plan mode maps to Codex read-only sandbox for non-interactive resume."
      : "Moss agent mode maps to Codex workspace-write sandbox for non-interactive resume.",
    "Codex exec resume is non-interactive, so approvals are set to never.",
  ]
}

function cleanImagePaths(imagePaths: string[] | null | undefined): string[] {
  return Array.from(
    new Set(
      (imagePaths ?? [])
        .map((imagePath) => cleanString(imagePath))
        .filter((imagePath): imagePath is string => Boolean(imagePath)),
    ),
  )
}

function appendCodexImageArgs(
  args: string[],
  imagePaths: string[] | null | undefined,
): string[] {
  const cleanedPaths = cleanImagePaths(imagePaths)
  for (const imagePath of cleanedPaths) {
    args.push("-i", imagePath)
  }
  return cleanedPaths
}

function codexImageNotes(imagePaths: string[]): string[] {
  if (imagePaths.length === 0) return []
  return [
    `Codex exec attaches ${imagePaths.length} image file(s) through native --image arguments.`,
    "Moss materializes uploaded images as transient files and removes them after the native command exits.",
  ]
}

function appendCodexTuiPermissionArgs(
  args: string[],
  permissionMode: AgentPermissionMode,
): string[] {
  if (permissionMode === "bypass") {
    args.push("--dangerously-bypass-approvals-and-sandbox")
    return [
      "Moss bypass maps to Codex dangerous approval and sandbox bypass.",
    ]
  }

  args.push("-s", permissionMode === "plan" ? "read-only" : "workspace-write")
  args.push("-a", "on-request")
  return [
    permissionMode === "plan"
      ? "Moss plan mode maps to Codex read-only sandbox."
      : "Moss agent mode maps to Codex workspace-write sandbox.",
    "Codex native fork is TUI-backed, so interactive approvals remain available.",
  ]
}

function appendPromptArg(
  args: string[],
  prompt: string | null | undefined,
  defaultSource: "stdin" | "none",
  requestedSource?: CodexNativePromptSource,
): CodexNativePromptSource {
  const cleanedPrompt = cleanString(prompt)

  if (requestedSource === "none") {
    return "none"
  }

  if (requestedSource === "stdin") {
    args.push("-")
    return "stdin"
  }

  if (cleanedPrompt) {
    args.push(cleanedPrompt)
    return "argument"
  }

  if (defaultSource === "stdin") {
    args.push("-")
    return "stdin"
  }

  return "none"
}

export function buildCodexNativeSessionBridgePlan(
  input: BuildCodexNativeSessionBridgePlanInput,
): CodexNativeSessionBridgePlan {
  const command = cleanString(input.command) ?? "codex"
  const cwd = requireCleanString(input.cwd, "working directory")
  const modelId = cleanString(input.modelId)
  const permissionMode = input.permissionMode ?? "agent"

  if (input.action === "start") {
    const args = ["exec"]
    if (input.includeJson ?? true) args.push("--json")
    if (input.skipGitRepoCheck ?? true) args.push("--skip-git-repo-check")
    args.push("-C", cwd)
    const modelArgs = appendCodexModelArgs(args, modelId)
    const imagePaths = appendCodexImageArgs(args, input.imagePaths)
    const notes = [
      ...appendCodexExecPermissionArgs(args, permissionMode),
      ...codexImageNotes(imagePaths),
    ]
    const promptSource = appendPromptArg(
      args,
      input.prompt,
      "stdin",
      input.promptSource,
    )

    return {
      engine: "codex",
      action: "start",
      bridge: "codex-exec-start",
      mode: "headless-exec",
      command,
      args,
      cwd,
      ...modelArgs,
      permissionMode,
      promptSource,
      imagePaths,
      imageCount: imagePaths.length,
      canRunHeadless: true,
      notes,
    }
  }

  if (input.action === "resume") {
    const sessionId = requireCleanString(input.sessionId, "session id")
    const args = ["exec", "resume"]
    if (input.includeJson ?? true) args.push("--json")
    if (input.skipGitRepoCheck ?? true) args.push("--skip-git-repo-check")
    const modelArgs = appendCodexModelArgs(args, modelId)
    const imagePaths = appendCodexImageArgs(args, input.imagePaths)
    const notes = [
      ...appendCodexExecPermissionArgs(args, permissionMode),
      ...codexImageNotes(imagePaths),
    ]
    args.push(sessionId)
    const promptSource = appendPromptArg(
      args,
      input.prompt,
      "stdin",
      input.promptSource,
    )

    return {
      engine: "codex",
      action: "resume",
      bridge: "codex-exec-resume",
      mode: "headless-exec",
      command,
      args,
      cwd,
      sessionId,
      ...modelArgs,
      permissionMode,
      promptSource,
      imagePaths,
      imageCount: imagePaths.length,
      canRunHeadless: true,
      notes,
    }
  }

  const sessionId = requireCleanString(input.sessionId, "session id")
  const args = ["fork", "--no-alt-screen", "-C", cwd]
  const modelArgs = appendCodexModelArgs(args, modelId)
  const requestedImagePaths = cleanImagePaths(input.imagePaths)
  const notes = appendCodexTuiPermissionArgs(args, permissionMode)
  args.push(sessionId)
  const promptSource = appendPromptArg(
    args,
    input.prompt,
    "none",
    input.promptSource,
  )

  return {
    engine: "codex",
    action: "fork",
    bridge: "codex-tui-fork",
    mode: "native-tui",
    command,
    args,
    cwd,
    sessionId,
    ...modelArgs,
    permissionMode,
    promptSource,
    imagePaths: [],
    imageCount: 0,
    canRunHeadless: false,
    notes: [
      ...notes,
      "Codex fork is exposed by the native TUI command; no headless exec fork exists yet.",
      ...(requestedImagePaths.length > 0
        ? ["Codex TUI fork image paths are not mapped because --image is only used on exec bridges."]
        : []),
    ],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function eventPayload(event: CodexJsonlEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {}
}

function eventItem(event: CodexJsonlEvent): Record<string, unknown> {
  const payload = eventPayload(event)
  if (isRecord(payload.item)) return payload.item
  if (isRecord(event.item)) return event.item
  return {}
}

function eventMessage(event: CodexJsonlEvent): Record<string, unknown> {
  const payload = eventPayload(event)
  const item = eventItem(event)
  if (isRecord(payload.message)) return payload.message
  if (isRecord(item.message)) return item.message
  if (isRecord(event.message)) return event.message
  return {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? cleanString(value) : undefined
}

function parseJsonLikeValue(value: unknown): unknown {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed) return value

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  const parsed = parseJsonLikeValue(value)
  return isRecord(parsed) ? parsed : undefined
}

function contentStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  return value.trim() ? value : undefined
}

function extractContentText(value: unknown): string | undefined {
  if (typeof value === "string") return contentStringValue(value)

  if (Array.isArray(value)) {
    const parts = value
      .map((part) => extractContentText(part))
      .filter((part): part is string => Boolean(part))
    return cleanString(parts.join(""))
  }

  if (!isRecord(value)) return undefined

  for (const key of ["text", "output_text", "delta"]) {
    const text = contentStringValue(value[key])
    if (text) return text
  }

  for (const key of ["content", "message"]) {
    const text = extractContentText(value[key])
    if (text) return text
  }

  return undefined
}

function extractEventRole(event: CodexJsonlEvent): string | undefined {
  const payload = eventPayload(event)
  const item = eventItem(event)
  const message = eventMessage(event)
  return (
    stringValue(message.role) ??
    stringValue(item.role) ??
    stringValue(payload.role) ??
    stringValue(event.role)
  )
}

function canUseEventAsAssistantTextSource(event: CodexJsonlEvent): boolean {
  const payload = eventPayload(event)
  const payloadType = stringValue(payload.type)?.toLowerCase()
  if ((event as any)?.type === "event_msg" && payloadType === "user_message") {
    return false
  }

  const role = extractEventRole(event)?.toLowerCase()
  return !role || role === "assistant"
}

function extractEventPhase(event: CodexJsonlEvent): string | undefined {
  const payload = eventPayload(event)
  const item = eventItem(event)
  const message = eventMessage(event)
  return (
    stringValue(message.phase) ??
    stringValue(item.phase) ??
    stringValue(payload.phase) ??
    stringValue(event.phase)
  )
}

function extractEventText(event: CodexJsonlEvent): string | undefined {
  if (!canUseEventAsAssistantTextSource(event)) return undefined

  const payload = eventPayload(event)
  const item = eventItem(event)
  const message = eventMessage(event)
  const candidates = [
    event.output_text,
    payload.output_text,
    item.output_text,
    message.output_text,
    event.text,
    payload.text,
    item.text,
    message.text,
    event.message,
    payload.message,
    item.message,
    event.last_agent_message,
    payload.last_agent_message,
    item.last_agent_message,
    event.delta,
    payload.delta,
    item.delta,
    message.delta,
    message.content,
    item.content,
    payload.content,
  ]

  for (const candidate of candidates) {
    const text = extractContentText(candidate)
    if (text) return text
  }

  return undefined
}

function extractSessionId(event: CodexJsonlEvent): string | undefined {
  const payload = eventPayload(event)
  const item = eventItem(event)
  const eventType = stringValue(event.type)
  const payloadType = stringValue(payload.type)
  const candidates = [
    event.nativeSessionId,
    payload.nativeSessionId,
    event.sessionId,
    payload.sessionId,
    event.session_id,
    payload.session_id,
    event.conversation_id,
    payload.conversation_id,
    event.threadId,
    payload.threadId,
    item.threadId,
    event.thread_id,
    payload.thread_id,
    item.thread_id,
  ]

  if (eventType === "session_meta" || payloadType === "session_meta") {
    candidates.push(payload.id, event.id)
  }

  for (const candidate of candidates) {
    const sessionId = stringValue(candidate)
    if (sessionId) return sessionId
  }

  return undefined
}

function extractUsage(event: CodexJsonlEvent): Record<string, unknown> | undefined {
  const payload = eventPayload(event)
  const item = eventItem(event)
  for (const candidate of [
    event.usage,
    payload.usage,
    item.usage,
    event.token_usage,
    payload.token_usage,
  ]) {
    if (isRecord(candidate)) return candidate
  }
  return undefined
}

function extractError(event: CodexJsonlEvent): string | undefined {
  const payload = eventPayload(event)
  const item = eventItem(event)
  const errorCandidates = [event.error, payload.error, item.error]

  for (const candidate of errorCandidates) {
    const direct = stringValue(candidate)
    if (direct) return direct
    if (isRecord(candidate)) {
      const message = stringValue(candidate.message)
      if (message) return message
    }
  }

  return undefined
}

function isDeltaTextEvent(event: CodexJsonlEvent): boolean {
  const payload = eventPayload(event)
  const item = eventItem(event)
  const eventType = stringValue(event.type)
  const payloadType = stringValue(payload.type)
  const itemType = stringValue(item.type)
  return [eventType, payloadType, itemType].some((type) =>
    type?.toLowerCase().includes("delta"),
  )
}

function outputObject(params: {
  output?: unknown
  stdout?: unknown
  stderr?: unknown
  exitCode?: unknown
  success?: unknown
  status?: unknown
  result?: unknown
}): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  if (params.output !== undefined) output.output = params.output
  if (typeof params.stdout === "string") output.stdout = params.stdout
  if (typeof params.stderr === "string") output.stderr = params.stderr
  if (typeof params.exitCode === "number" || params.exitCode === null) {
    output.exitCode = params.exitCode
  }
  if (typeof params.success === "boolean") output.success = params.success
  if (typeof params.status === "string") output.status = params.status
  if (params.result !== undefined) output.result = params.result
  return output
}

function unwrapShellCommand(command: string): string {
  const trimmed = command.trim()
  const shellMatch = trimmed.match(
    /^(?:\/(?:usr\/)?bin\/)?(?:zsh|bash|sh)\s+-lc\s+([\s\S]+)$/i,
  )
  const wrappedCommand = shellMatch?.[1]?.trim()
  if (!wrappedCommand) return trimmed

  const singleQuoted = wrappedCommand.match(/^'([\s\S]*)'$/)
  if (singleQuoted) return singleQuoted[1].replace(/'\\''/g, "'")

  const doubleQuoted = wrappedCommand.match(/^"([\s\S]*)"$/)
  if (doubleQuoted) return doubleQuoted[1].replace(/\\"/g, '"')

  return wrappedCommand
}

function getFunctionCallInput(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const parsed =
    recordValue(payload.arguments) ??
    recordValue(payload.input) ??
    recordValue(payload.args) ??
    {}
  return { ...parsed }
}

function getCommandInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const command =
    stringValue(input.cmd) ??
    stringValue(input.command) ??
    (Array.isArray(input.command)
      ? [...input.command]
          .reverse()
          .find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : undefined)

  return {
    ...input,
    ...(command ? { command } : {}),
    ...(stringValue(input.workdir) && !stringValue(input.cwd)
      ? { cwd: stringValue(input.workdir) }
      : {}),
  }
}

function firstChangedPath(changes: unknown): string | undefined {
  if (!isRecord(changes)) return undefined
  return Object.keys(changes).find((filePath) => filePath.trim().length > 0)
}

function getPatchInput(rawInput: unknown): Record<string, unknown> {
  const patchText = typeof rawInput === "string" ? rawInput : undefined
  const parsedInput = recordValue(rawInput)
  return {
    ...(parsedInput ?? {}),
    ...(patchText ? { patch: patchText } : {}),
  }
}

function mapNativeFunctionNameToTool(
  name: string,
  input: Record<string, unknown>,
): { toolName: string; input: unknown; title?: string } {
  const normalizedName = name.replace(/^functions\./, "")

  if (
    normalizedName === "exec_command" ||
    normalizedName === "shell" ||
    normalizedName === "bash" ||
    normalizedName === "run_command"
  ) {
    const commandInput = getCommandInput(input)
    const command = stringValue(commandInput.command)
    return {
      toolName: "Bash",
      input: commandInput,
      ...(command ? { title: `Run ${command}` } : {}),
    }
  }

  if (
    normalizedName === "apply_patch" ||
    normalizedName === "edit" ||
    normalizedName === "write_file"
  ) {
    return {
      toolName: normalizedName === "write_file" ? "Write" : "Edit",
      input,
    }
  }

  if (normalizedName === "read_file" || normalizedName === "read") {
    return { toolName: "Read", input }
  }

  if (
    normalizedName === "grep" ||
    normalizedName === "rg" ||
    normalizedName === "search" ||
    normalizedName === "search_code"
  ) {
    return { toolName: "Grep", input }
  }

  if (normalizedName === "glob" || normalizedName === "list_files") {
    return { toolName: "Glob", input }
  }

  if (normalizedName.startsWith("mcp__")) {
    return { toolName: normalizedName, input }
  }

  return {
    toolName: normalizedName,
    input: {
      ...input,
      toolName: normalizedName,
    },
  }
}

function toolEventFromCommandExecutionItem(
  event: CodexJsonlEvent,
  item: Record<string, unknown>,
): CodexNativeToolEvent | null {
  const callId =
    stringValue(item.id) ??
    stringValue(item.call_id) ??
    stringValue(item.callId)
  const rawCommand = stringValue(item.command)
  if (!callId || !rawCommand) return null

  const command = unwrapShellCommand(rawCommand)
  const status = stringValue(item.status)
  const eventType = stringValue(event.type)
  const input: Record<string, unknown> = {
    command,
    cmd: command,
    ...(rawCommand !== command ? { rawCommand } : {}),
    ...(status ? { executionStatus: status } : {}),
  }

  if (eventType === "item.started" || status === "in_progress") {
    return {
      kind: "tool-input",
      callId,
      toolName: "Bash",
      input,
      title: `Run ${command}`,
    }
  }

  const exitCode = item.exit_code ?? item.exitCode
  const output = outputObject({
    stdout: item.aggregated_output,
    output: item.output,
    stderr: item.stderr,
    exitCode,
    success: typeof exitCode === "number" ? exitCode === 0 : undefined,
    status,
  })

  return {
    kind: "tool-output",
    callId,
    toolName: "Bash",
    input,
    output,
    isError:
      status === "failed" ||
      status === "error" ||
      (typeof exitCode === "number" && exitCode !== 0),
    title: `Run ${command}`,
  }
}

function toolEventFromResponseItem(
  payload: Record<string, unknown>,
): CodexNativeToolEvent | null {
  const payloadType = stringValue(payload.type)
  const callId = stringValue(payload.call_id) ?? stringValue(payload.callId)

  if (!callId) return null

  if (payloadType === "function_call") {
    const name = stringValue(payload.name) ?? "unknown"
    const mapped = mapNativeFunctionNameToTool(name, getFunctionCallInput(payload))
    return {
      kind: "tool-input",
      callId,
      toolName: mapped.toolName,
      input: mapped.input,
      ...(mapped.title ? { title: mapped.title } : {}),
    }
  }

  if (payloadType === "function_call_output") {
    const output = outputObject({
      output: payload.output,
      stdout: payload.stdout,
      stderr: payload.stderr,
      exitCode: payload.exit_code ?? payload.exitCode,
      success: payload.success,
      status: payload.status,
    })
    return {
      kind: "tool-output",
      callId,
      output: Object.keys(output).length > 0 ? output : payload.output,
      isError: payload.success === false,
    }
  }

  if (payloadType === "custom_tool_call") {
    const name = stringValue(payload.name) ?? "unknown"
    const rawInput = payload.input ?? payload.arguments
    const input =
      name === "apply_patch"
        ? getPatchInput(rawInput)
        : getFunctionCallInput({ ...payload, arguments: rawInput })
    const mapped = mapNativeFunctionNameToTool(name, input)
    return {
      kind: "tool-input",
      callId,
      toolName: mapped.toolName,
      input: mapped.input,
      ...(mapped.title ? { title: mapped.title } : {}),
    }
  }

  if (payloadType === "custom_tool_call_output") {
    const output = outputObject({
      output: payload.output,
      stdout: payload.stdout,
      stderr: payload.stderr,
      exitCode: payload.exit_code ?? payload.exitCode,
      success: payload.success,
      status: payload.status,
    })
    return {
      kind: "tool-output",
      callId,
      output: Object.keys(output).length > 0 ? output : payload.output,
      isError: payload.success === false,
    }
  }

  if (payloadType === "tool_search_call") {
    const args = recordValue(payload.arguments) ?? {}
    const query = stringValue(args.query)
    return {
      kind: "tool-input",
      callId,
      toolName: "Grep",
      input: {
        ...args,
        ...(query ? { pattern: query, query } : {}),
        toolName: "Search tools",
      },
      ...(query ? { title: `Search ${query}` } : {}),
    }
  }

  if (payloadType === "tool_search_output") {
    return {
      kind: "tool-output",
      callId,
      output: outputObject({
        output: payload.output ?? payload.tools,
        success: payload.status === "completed" ? true : undefined,
        status: payload.status,
      }),
      isError: payload.status === "failed",
    }
  }

  return null
}

function toolEventFromEventMessage(
  payload: Record<string, unknown>,
): CodexNativeToolEvent | null {
  const payloadType = stringValue(payload.type)
  const callId = stringValue(payload.call_id) ?? stringValue(payload.callId)

  if (!callId) return null

  if (payloadType === "patch_apply_end") {
    const filePath = firstChangedPath(payload.changes)
    return {
      kind: "tool-output",
      callId,
      toolName: "Edit",
      input: {
        ...(filePath ? { file_path: filePath } : {}),
        changes: payload.changes,
      },
      output: outputObject({
        stdout: payload.stdout,
        stderr: payload.stderr,
        success: payload.success,
        status: payload.success === false ? "failed" : "completed",
        result: payload.changes,
      }),
      isError: payload.success === false,
    }
  }

  if (payloadType === "mcp_tool_call_end") {
    const invocation = isRecord(payload.invocation) ? payload.invocation : {}
    const server = stringValue(invocation.server) ?? "mcp"
    const tool = stringValue(invocation.tool) ?? "tool"
    const result = isRecord(payload.result) ? payload.result : payload.result
    const isError =
      isRecord(payload.result) && payload.result.isError === true
        ? true
        : payload.status === "failed"
    return {
      kind: "tool-output",
      callId,
      toolName: `mcp__${server}__${tool}`,
      input: isRecord(invocation.arguments) ? invocation.arguments : {},
      output: result,
      isError,
    }
  }

  return null
}

const nativeResponseItemToolTypes = new Set([
  "function_call",
  "function_call_output",
  "custom_tool_call",
  "custom_tool_call_output",
  "tool_search_call",
  "tool_search_output",
])

const nativeEventMessageToolTypes = new Set([
  "patch_apply_end",
  "mcp_tool_call_end",
])

export function codexJsonlEventToNativeToolEvent(
  event: CodexJsonlEvent,
): CodexNativeToolEvent | null {
  const payload = eventPayload(event)
  const item = eventItem(event)
  const candidates = [payload, item, event]

  if (stringValue(item.type) === "command_execution") {
    const commandEvent = toolEventFromCommandExecutionItem(event, item)
    if (commandEvent) return commandEvent
  }

  for (const candidate of candidates) {
    const candidateType = stringValue(candidate.type)
    if (candidateType && nativeResponseItemToolTypes.has(candidateType)) {
      return toolEventFromResponseItem(candidate)
    }
  }

  for (const candidate of candidates) {
    const candidateType = stringValue(candidate.type)
    if (candidateType && nativeEventMessageToolTypes.has(candidateType)) {
      return toolEventFromEventMessage(candidate)
    }
  }

  return null
}

export function parseCodexJsonlEventLine(line: string): CodexJsonlEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed: unknown = JSON.parse(trimmed)
    return isRecord(parsed) ? parsed : null
  } catch {
    // Keep the bridge tolerant of CLI warnings or partial output.
    return null
  }
}

export function extractCodexJsonlEventText(
  event: CodexJsonlEvent,
): string | undefined {
  return extractEventText(event)
}

export function isCodexJsonlCommentaryTextEvent(
  event: CodexJsonlEvent,
): boolean {
  if (!canUseEventAsAssistantTextSource(event)) return false
  if (extractEventPhase(event)?.toLowerCase() !== "commentary") return false
  return Boolean(extractEventText(event))
}

export function isCodexJsonlFinalTextEvent(event: CodexJsonlEvent): boolean {
  if (!canUseEventAsAssistantTextSource(event)) return false
  if (!extractEventText(event)) return false

  const payload = eventPayload(event)
  const item = eventItem(event)
  const phase = extractEventPhase(event)?.toLowerCase()
  const payloadType = stringValue(payload.type)?.toLowerCase()
  const itemType = stringValue(item.type)?.toLowerCase()

  return (
    phase === "final_answer" ||
    payloadType === "task_complete" ||
    itemType === "task_complete"
  )
}

export function extractCodexJsonlEventSessionId(
  event: CodexJsonlEvent,
): string | undefined {
  return extractSessionId(event)
}

export function isCodexJsonlDeltaTextEvent(event: CodexJsonlEvent): boolean {
  return isDeltaTextEvent(event)
}

export function parseCodexJsonlEvents(stdout: string): CodexJsonlEvent[] {
  const events: CodexJsonlEvent[] = []

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseCodexJsonlEventLine(line)
    if (event) events.push(event)
  }

  return events
}

export function summarizeCodexExecResumeEvents(
  events: CodexJsonlEvent[],
): CodexExecResumeEventSummary {
  const summary: CodexExecResumeEventSummary = {}
  let accumulatedDeltaText = ""

  for (const event of events) {
    const sessionId = extractSessionId(event)
    if (sessionId) summary.nativeSessionId = sessionId
    const text = extractEventText(event)
    if (text) {
      if (isDeltaTextEvent(event)) {
        accumulatedDeltaText += text
        summary.lastText = accumulatedDeltaText
      } else {
        accumulatedDeltaText = ""
        summary.lastText = text
      }
    }
    const usage = extractUsage(event)
    if (usage) summary.usage = usage
    const error = extractError(event)
    if (error) summary.error = error
  }

  return summary
}

function stripDataUrlPrefix(value: string): string {
  const trimmed = value.trim()
  const dataUrlMatch = trimmed.match(/^data:[^,]+;base64,(.*)$/is)
  return (dataUrlMatch ? dataUrlMatch[1] : trimmed).replace(/\s/g, "")
}

function codexImageExtension(input: CodexNativeImageAttachment): string {
  const filenameExtension = input.filename
    ? path.extname(path.basename(input.filename)).toLowerCase()
    : ""
  if (
    [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".bmp",
      ".tif",
      ".tiff",
    ].includes(filenameExtension)
  ) {
    return filenameExtension
  }

  const mediaType = cleanString(input.mediaType)?.toLowerCase()
  switch (mediaType) {
    case "image/png":
      return ".png"
    case "image/jpeg":
    case "image/jpg":
      return ".jpg"
    case "image/webp":
      return ".webp"
    case "image/gif":
      return ".gif"
    case "image/bmp":
      return ".bmp"
    case "image/tiff":
      return ".tiff"
    default:
      return ".img"
  }
}

async function materializeCodexImages(
  images: CodexNativeImageAttachment[] | null | undefined,
): Promise<{ directory?: string; imagePaths: string[] }> {
  const usableImages = (images ?? []).filter(
    (image) => cleanString(image.base64Data) && cleanString(image.mediaType),
  )
  if (usableImages.length === 0) return { imagePaths: [] }

  const directory = await mkdtemp(path.join(tmpdir(), "moss-codex-images-"))
  const imagePaths: string[] = []

  try {
    for (const [index, image] of usableImages.entries()) {
      const base64Payload = stripDataUrlPrefix(image.base64Data)
      if (!base64Payload) continue
      const imagePath = path.join(
        directory,
        `image-${String(index + 1).padStart(2, "0")}${codexImageExtension(image)}`,
      )
      await writeFile(imagePath, Buffer.from(base64Payload, "base64"))
      imagePaths.push(imagePath)
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }

  if (imagePaths.length === 0) {
    await rm(directory, { recursive: true, force: true })
    return { imagePaths: [] }
  }

  return { directory, imagePaths }
}

export function spawnCodexNativeCommand(
  input: CodexNativeCommandRunnerInput,
): Promise<CodexNativeCommandRunnerResult> {
  return new Promise((resolve, reject) => {
    if (input.abortSignal?.aborted) {
      reject(new Error("Codex native command aborted."))
      return
    }

    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ? { ...process.env, ...input.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    const stdoutDecoder = new StringDecoder("utf8")
    let stdoutLineBuffer = ""
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null
    let didClose = false

    const emitStdoutJsonLine = (line: string) => {
      const event = parseCodexJsonlEventLine(line)
      if (!event) return

      try {
        input.onStdoutJsonEvent?.(event)
      } catch (error) {
        console.warn("[codex] Ignoring native JSONL stream callback error:", error)
      }
    }

    const processStdoutJsonText = (text: string) => {
      if (!text) return
      stdoutLineBuffer += text

      while (true) {
        const lineEndIndex = stdoutLineBuffer.search(/\r?\n/)
        if (lineEndIndex === -1) return

        const line = stdoutLineBuffer.slice(0, lineEndIndex)
        const newlineLength =
          stdoutLineBuffer[lineEndIndex] === "\r" &&
          stdoutLineBuffer[lineEndIndex + 1] === "\n"
            ? 2
            : 1
        stdoutLineBuffer = stdoutLineBuffer.slice(lineEndIndex + newlineLength)
        emitStdoutJsonLine(line)
      }
    }

    const flushStdoutJsonText = () => {
      processStdoutJsonText(stdoutDecoder.end())
      if (stdoutLineBuffer.trim()) {
        emitStdoutJsonLine(stdoutLineBuffer)
      }
      stdoutLineBuffer = ""
    }

    const abortChild = () => {
      if (didClose) return
      child.kill("SIGTERM")
      forceKillTimer =
        forceKillTimer ??
        setTimeout(() => {
          if (!didClose) child.kill("SIGKILL")
        }, 2000)
    }

    input.abortSignal?.addEventListener("abort", abortChild, { once: true })

    child.stdout?.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      stdoutChunks.push(buffer)
      processStdoutJsonText(stdoutDecoder.write(buffer))
    })
    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    })
    child.stdin?.on("error", () => {
      // The CLI may exit before stdin is fully written on fast failures.
    })
    child.on("error", reject)
    child.on("close", (exitCode) => {
      didClose = true
      flushStdoutJsonText()
      if (forceKillTimer) {
        clearTimeout(forceKillTimer)
      }
      input.abortSignal?.removeEventListener("abort", abortChild)
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
      })
    })

    if (typeof input.stdin === "string") {
      child.stdin?.write(input.stdin)
    }
    child.stdin?.end()
  })
}

export async function runCodexExecBridge(
  input: RunCodexExecBridgeInput,
): Promise<CodexExecResumeBridgeResult> {
  const prompt = requireCleanString(input.prompt, `${input.action} prompt`)
  if (input.action === "resume") {
    requireCleanString(input.sessionId, "session id")
  }
  const materializedImages = await materializeCodexImages(input.images)
  const plan = buildCodexNativeSessionBridgePlan({
    action: input.action,
    sessionId: input.sessionId,
    cwd: input.cwd,
    modelId: input.modelId,
    permissionMode: input.permissionMode,
    command: input.command,
    includeJson: input.includeJson,
    skipGitRepoCheck: input.skipGitRepoCheck,
    prompt,
    promptSource: "stdin",
    imagePaths: materializedImages.imagePaths,
  })
  const runner = input.runner ?? spawnCodexNativeCommand
  const forwardedEventKeys = new Set<string>()
  const getForwardedEventKey = (event: CodexJsonlEvent): string => {
    try {
      return JSON.stringify(event)
    } catch {
      return String(event)
    }
  }
  const forwardEvent = (event: CodexJsonlEvent) => {
    if (!input.onEvent) return
    const eventKey = getForwardedEventKey(event)
    if (forwardedEventKeys.has(eventKey)) return
    forwardedEventKeys.add(eventKey)
    try {
      input.onEvent(event)
    } catch (error) {
      console.warn("[codex] Ignoring native JSONL event callback error:", error)
    }
  }
  let result: CodexNativeCommandRunnerResult
  try {
    result = await runner({
      command: plan.command,
      args: plan.args,
      cwd: plan.cwd,
      stdin: prompt,
      env: input.env,
      abortSignal: input.abortSignal,
      onStdoutJsonEvent: forwardEvent,
    })
  } finally {
    if (materializedImages.directory) {
      await rm(materializedImages.directory, { recursive: true, force: true })
    }
  }
  const events = parseCodexJsonlEvents(result.stdout)
  for (const event of events) {
    forwardEvent(event)
  }
  const summary = summarizeCodexExecResumeEvents(events)
  const exitError =
    result.exitCode === 0
      ? undefined
      : summary.error ?? cleanString(result.stderr) ?? `Codex exited with ${result.exitCode}.`
  const error = exitError ?? summary.error

  return {
    ...result,
    plan,
    events,
    ...summary,
    ...(error ? { error } : {}),
    success: result.exitCode === 0 && !error,
  }
}

export async function runCodexExecStartBridge(
  input: RunCodexExecStartBridgeInput,
): Promise<CodexExecResumeBridgeResult> {
  return runCodexExecBridge({
    ...input,
    action: "start",
  })
}

export async function runCodexExecResumeBridge(
  input: RunCodexExecResumeBridgeInput,
): Promise<CodexExecResumeBridgeResult> {
  return runCodexExecBridge({
    ...input,
    action: "resume",
  })
}
