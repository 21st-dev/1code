import type {
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolCallUpdate,
  ToolKind,
} from "@agentclientprotocol/sdk"
import type { ResolvedDesktopRuntimeControlLevel } from "../../../shared/agent-runtime-control"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  classifyObservedToolRisk,
  decideClaudeToolUse,
  type ObservedToolRisk,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import {
  decideAssistantToolPermission,
  type ObservedToolPolicy,
} from "../agent-runtime/permission-policy"

type CodexPermissionHandler = (
  params: RequestPermissionRequest,
) => Promise<RequestPermissionResponse>

type CodexPermissionClientLike = {
  setPermissionRequestHandler?: (handler: CodexPermissionHandler) => void
}

type CodexPermissionLanguageModelLike = {
  connectClient?: () => Promise<void>
  client?: CodexPermissionClientLike | null
}

export type CodexToolPermissionInstallResult =
  | { ok: true }
  | { ok: false; error: string }

export type CodexToolPermissionRequest = {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  kind: ToolKind | null
  title: string
}

export type CodexToolPermissionPolicyInput = {
  mode: "plan" | "agent"
  controlLevel?: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy?: ObservedToolPolicy
  contract?: ValidatedAgentScopeContract | null
  onGuardEvent?: (event: AgentGuardEvent) => void
  onObservedToolDecision?: (event: CodexObservedToolDecision) => void
}

export type CodexObservedToolDecision = {
  controlLevel: "observe"
  decision: "allow" | "deny"
  risk: ObservedToolRisk
  message?: string
}

export type CodexToolPermissionDecision = {
  decision: "allow" | "deny"
  message?: string
  observed?: CodexObservedToolDecision
  guardEvent?: AgentGuardEvent
}

export type CodexDynamicToolPermissionInput = {
  toolCallId?: unknown
  toolName?: unknown
  input?: unknown
}

const CODEX_TITLE_VERB_TO_TOOL_NAME: Record<string, string> = {
  Read: "Read",
  Run: "Bash",
  Search: "Grep",
  Grep: "Grep",
  Glob: "Glob",
  List: "LS",
  Edit: "Edit",
  Write: "Write",
  Fetch: "WebFetch",
}

const PLAN_BLOCKED_KINDS = new Set<ToolKind>([
  "edit",
  "delete",
  "move",
  "execute",
])

const PLAN_BLOCKED_TOOLS = new Set([
  "Bash",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Write",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getTitleVerb(title: string): string {
  return title.trim().split(/\s+/, 1)[0] || ""
}

function commandFromRawInput(rawInput: Record<string, unknown>): string | null {
  const command = rawInput.command
  if (typeof command === "string" && command.trim().length > 0) {
    return command.trim()
  }

  if (Array.isArray(command)) {
    const parts = command
      .filter((part): part is string => typeof part === "string")
      .map((part) => part.trim())
      .filter(Boolean)
    const shellCommandIndex = parts.findIndex(
      (part) => part === "-c" || part === "-lc",
    )
    if (shellCommandIndex >= 0 && parts[shellCommandIndex + 1]) {
      return parts[shellCommandIndex + 1]
    }
    if (parts.length > 0) {
      return parts.join(" ")
    }
  }

  return null
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== "string" || value.trim().length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function firstRecordKey(value: unknown): string | null {
  if (!isRecord(value)) return null
  return Object.keys(value).find((key) => key.trim().length > 0) ?? null
}

function firstStringPathFromArray(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const item of value) {
    if (!isRecord(item)) continue
    const candidate =
      (typeof item.file_path === "string" && item.file_path) ||
      (typeof item.path === "string" && item.path)
    if (candidate) return candidate
  }
  return null
}

function firstDiffPath(content: ToolCallUpdate["content"]): string | null {
  if (!Array.isArray(content)) return null
  const diff = content.find((item) => item?.type === "diff")
  return diff && "path" in diff && typeof diff.path === "string"
    ? diff.path
    : null
}

function getToolNameFromTitle(title: string): string | null {
  if (title.includes("AskUserQuestion")) return "AskUserQuestion"
  const titleVerb = getTitleVerb(title)
  if (CODEX_TITLE_VERB_TO_TOOL_NAME[titleVerb]) {
    return CODEX_TITLE_VERB_TO_TOOL_NAME[titleVerb]
  }
  if (titleVerb.startsWith("mcp__")) return titleVerb
  return null
}

function getTitleDetail(title: string): string | null {
  const trimmed = title.trim()
  const firstSpace = trimmed.search(/\s/)
  if (firstSpace < 0) return null
  const detail = trimmed.slice(firstSpace + 1).trim()
  return detail.length > 0 ? detail : null
}

function getToolNameFromKind(kind: ToolKind | null | undefined): string | null {
  switch (kind) {
    case "read":
      return "Read"
    case "edit":
    case "delete":
    case "move":
      return "Edit"
    case "search":
      return "Grep"
    case "execute":
      return "Bash"
    case "fetch":
      return "WebFetch"
    case "think":
    case "switch_mode":
      return "PlanWrite"
    default:
      return null
  }
}

function getPathFromDynamicArgs(
  rawInput: Record<string, unknown>,
  title: string,
): string | null {
  const directPath =
    (typeof rawInput.file_path === "string" && rawInput.file_path) ||
    (typeof rawInput.path === "string" && rawInput.path) ||
    (typeof rawInput.notebook_path === "string" && rawInput.notebook_path) ||
    firstRecordKey(rawInput.changes) ||
    firstStringPathFromArray(rawInput.edits)
  if (directPath) return directPath

  return getTitleDetail(title)
}

function normalizeCodexToolPermissionInput(
  toolCall: ToolCallUpdate,
  toolName: string,
): Record<string, unknown> {
  const rawInput = isRecord(toolCall.rawInput) ? { ...toolCall.rawInput } : {}
  const diffPath = firstDiffPath(toolCall.content)

  if (toolName === "Bash") {
    const command = commandFromRawInput(rawInput)
    return command ? { ...rawInput, command } : rawInput
  }

  if (
    toolName === "Read" ||
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "Write" ||
    toolName === "NotebookEdit"
  ) {
    const path =
      (typeof rawInput.file_path === "string" && rawInput.file_path) ||
      (typeof rawInput.path === "string" && rawInput.path) ||
      diffPath
    return path ? { ...rawInput, file_path: path, path } : rawInput
  }

  if (toolName === "Grep" || toolName === "Glob" || toolName === "LS") {
    const path = typeof rawInput.path === "string" ? rawInput.path : diffPath
    return path ? { ...rawInput, path } : rawInput
  }

  return rawInput
}

function normalizeCodexDynamicToolPermissionInput(
  rawInput: Record<string, unknown>,
  toolName: string,
  title: string,
): Record<string, unknown> {
  if (toolName === "Bash") {
    const command = commandFromRawInput(rawInput) || getTitleDetail(title)
    return command ? { ...rawInput, command } : rawInput
  }

  if (
    toolName === "Read" ||
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "Write" ||
    toolName === "NotebookEdit"
  ) {
    const path = getPathFromDynamicArgs(rawInput, title)
    return path ? { ...rawInput, file_path: path, path } : rawInput
  }

  if (toolName === "Grep" || toolName === "Glob" || toolName === "LS") {
    const path =
      (typeof rawInput.path === "string" && rawInput.path) ||
      getTitleDetail(title)
    return path ? { ...rawInput, path } : rawInput
  }

  if (toolName === "WebFetch") {
    const detail = getTitleDetail(title)
    const url =
      (typeof rawInput.url === "string" && rawInput.url) ||
      (detail?.startsWith("http") ? detail : null)
    return url ? { ...rawInput, url } : rawInput
  }

  return rawInput
}

export function normalizeCodexToolPermissionRequest(
  toolCall: ToolCallUpdate,
): CodexToolPermissionRequest {
  const title = typeof toolCall.title === "string" ? toolCall.title : ""
  const toolName =
    getToolNameFromTitle(title) ||
    getToolNameFromKind(toolCall.kind) ||
    getTitleVerb(title) ||
    "Unknown"

  return {
    toolUseId: toolCall.toolCallId,
    toolName,
    toolInput: normalizeCodexToolPermissionInput(toolCall, toolName),
    kind: toolCall.kind ?? null,
    title,
  }
}

export function normalizeCodexDynamicToolPermissionRequest(
  input: CodexDynamicToolPermissionInput,
): CodexToolPermissionRequest | null {
  const parsedInput = parseJsonRecord(input.input)
  const rawToolCallId =
    parsedInput?.toolCallId ?? input.toolCallId ?? parsedInput?.id
  const toolUseId =
    typeof rawToolCallId === "string" && rawToolCallId.trim().length > 0
      ? rawToolCallId
      : null
  if (!toolUseId) return null

  const rawTitle =
    (typeof parsedInput?.toolName === "string" && parsedInput.toolName) ||
    (typeof input.toolName === "string" && input.toolName) ||
    ""
  const title = rawTitle.trim()
  if (!title) return null

  const toolName = getToolNameFromTitle(title) || "Unknown"
  const rawArgs = parsedInput?.args
  const toolInput = normalizeCodexDynamicToolPermissionInput(
    isRecord(rawArgs) ? rawArgs : (parsedInput ?? {}),
    toolName,
    title,
  )

  return {
    toolUseId,
    toolName,
    toolInput,
    kind: null,
    title,
  }
}

function optionByKind(
  options: PermissionOption[],
  kinds: PermissionOption["kind"][],
): PermissionOption | undefined {
  for (const kind of kinds) {
    const option = options.find((candidate) => candidate.kind === kind)
    if (option) return option
  }
  return undefined
}

export function buildCodexToolPermissionResponse(
  options: PermissionOption[],
  decision: "allow" | "deny",
): RequestPermissionResponse {
  if (decision === "allow") {
    const allow = optionByKind(options, ["allow_once", "allow_always"])
    if (allow) {
      return { outcome: { outcome: "selected", optionId: allow.optionId } }
    }
    return { outcome: { outcome: "cancelled" } }
  }

  const reject = optionByKind(options, ["reject_once", "reject_always"])
  if (reject) {
    return { outcome: { outcome: "selected", optionId: reject.optionId } }
  }
  return { outcome: { outcome: "cancelled" } }
}

export function isCodexPlanModeBlockedTool(
  tool: CodexToolPermissionRequest,
): boolean {
  return (
    (tool.kind ? PLAN_BLOCKED_KINDS.has(tool.kind) : false) ||
    PLAN_BLOCKED_TOOLS.has(tool.toolName)
  )
}

export function decideCodexToolPermission({
  tool,
  mode,
  controlLevel,
  observedToolPolicy,
  contract,
}: CodexToolPermissionPolicyInput & {
  tool: CodexToolPermissionRequest
}): CodexToolPermissionDecision {
  if (controlLevel === "assistant") {
    const assistantDecision = decideAssistantToolPermission({
      toolName: tool.toolName,
      toolKind: tool.kind,
    })
    return {
      decision: assistantDecision.decision,
      ...(assistantDecision.message
        ? { message: assistantDecision.message }
        : {}),
    }
  }

  if (mode === "plan" && isCodexPlanModeBlockedTool(tool)) {
    return {
      decision: "deny",
      message: `Plan mode blocked ${tool.toolName} before execution.`,
    }
  }

  if (!contract) {
    if (controlLevel === "observe" && observedToolPolicy?.enabled) {
      const risk = classifyObservedToolRisk({
        toolName: tool.toolName,
        toolInput: tool.toolInput,
        toolUseId: tool.toolUseId,
      })
      const shouldDeny =
        risk.catastrophic && observedToolPolicy.blocksCatastrophicActions
      const message = shouldDeny
        ? `Observed mode blocked ${tool.toolName}: ${risk.reason}`
        : undefined
      return {
        decision: shouldDeny ? "deny" : "allow",
        ...(message ? { message } : {}),
        observed: {
          controlLevel: "observe",
          decision: shouldDeny ? "deny" : "allow",
          risk,
          ...(message ? { message } : {}),
        },
      }
    }

    return { decision: "allow" }
  }

  const guardDecision = decideClaudeToolUse({
    contract,
    toolName: tool.toolName,
    toolInput: tool.toolInput,
    toolUseId: tool.toolUseId,
  })

  return {
    decision: guardDecision.decision === "allow" ? "allow" : "deny",
    message:
      guardDecision.decision === "allow" ? undefined : guardDecision.reason,
    guardEvent: guardDecision.event,
  }
}

export function createCodexToolPermissionHandler({
  mode,
  controlLevel,
  observedToolPolicy,
  contract,
  onGuardEvent,
  onObservedToolDecision,
}: CodexToolPermissionPolicyInput): CodexPermissionHandler {
  return async (params) => {
    const tool = normalizeCodexToolPermissionRequest(params.toolCall)
    const decision = decideCodexToolPermission({
      tool,
      mode,
      controlLevel,
      observedToolPolicy,
      contract,
    })
    if (decision.observed) onObservedToolDecision?.(decision.observed)
    if (decision.guardEvent) onGuardEvent?.(decision.guardEvent)

    return buildCodexToolPermissionResponse(params.options, decision.decision)
  }
}

export async function installCodexToolPermissionHandler(params: {
  model: unknown
  handler: CodexPermissionHandler
}): Promise<CodexToolPermissionInstallResult> {
  const model = params.model as CodexPermissionLanguageModelLike
  if (typeof model.connectClient !== "function") {
    return {
      ok: false,
      error: "Codex permission language model does not expose connectClient.",
    }
  }

  try {
    await model.connectClient()
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Codex permission connection could not be initialized.",
    }
  }

  const client = model.client
  if (!client || typeof client.setPermissionRequestHandler !== "function") {
    return {
      ok: false,
      error: "Codex permission handler seam is unavailable.",
    }
  }

  client.setPermissionRequestHandler(params.handler)
  return { ok: true }
}
