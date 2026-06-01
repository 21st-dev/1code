import type {
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolCallUpdate,
  ToolKind,
} from "@agentclientprotocol/sdk"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  decideClaudeToolUse,
  type ValidatedAgentScopeContract,
} from "../agent-guard"

type AcpPermissionHandler = (
  params: RequestPermissionRequest,
) => Promise<RequestPermissionResponse>

type AcpPermissionClientLike = {
  setPermissionRequestHandler?: (handler: AcpPermissionHandler) => void
}

type AcpLanguageModelLike = {
  connectClient?: () => Promise<void>
  client?: AcpPermissionClientLike | null
}

export type CodexAcpPermissionInstallResult =
  | { ok: true }
  | { ok: false; error: string }

export type CodexAcpPermissionTool = {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  kind: ToolKind | null
  title: string
}

export type CodexAcpPermissionPolicyInput = {
  mode: "plan" | "agent"
  contract?: ValidatedAgentScopeContract | null
  onGuardEvent?: (event: AgentGuardEvent) => void
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
    const shellCommandIndex = parts.findIndex((part) => part === "-c" || part === "-lc")
    if (shellCommandIndex >= 0 && parts[shellCommandIndex + 1]) {
      return parts[shellCommandIndex + 1]
    }
    if (parts.length > 0) {
      return parts.join(" ")
    }
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

function normalizeCodexPermissionToolInput(
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

export function normalizeCodexPermissionTool(
  toolCall: ToolCallUpdate,
): CodexAcpPermissionTool {
  const title = typeof toolCall.title === "string" ? toolCall.title : ""
  const titleVerb = getTitleVerb(title)
  const toolName =
    CODEX_TITLE_VERB_TO_TOOL_NAME[titleVerb] ||
    getToolNameFromKind(toolCall.kind) ||
    titleVerb ||
    "Unknown"

  return {
    toolUseId: toolCall.toolCallId,
    toolName,
    toolInput: normalizeCodexPermissionToolInput(toolCall, toolName),
    kind: toolCall.kind ?? null,
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

export function buildCodexAcpPermissionResponse(
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
  tool: CodexAcpPermissionTool,
): boolean {
  return (
    (tool.kind ? PLAN_BLOCKED_KINDS.has(tool.kind) : false) ||
    PLAN_BLOCKED_TOOLS.has(tool.toolName)
  )
}

export function createCodexAcpPermissionHandler({
  mode,
  contract,
  onGuardEvent,
}: CodexAcpPermissionPolicyInput): AcpPermissionHandler {
  return async (params) => {
    const tool = normalizeCodexPermissionTool(params.toolCall)

    if (mode === "plan" && isCodexPlanModeBlockedTool(tool)) {
      return buildCodexAcpPermissionResponse(params.options, "deny")
    }

    if (!contract) {
      return buildCodexAcpPermissionResponse(params.options, "allow")
    }

    const decision = decideClaudeToolUse({
      contract,
      toolName: tool.toolName,
      toolInput: tool.toolInput,
      toolUseId: tool.toolUseId,
    })
    onGuardEvent?.(decision.event)

    return buildCodexAcpPermissionResponse(
      params.options,
      decision.decision === "allow" ? "allow" : "deny",
    )
  }
}

export async function installCodexAcpPermissionHandler(params: {
  model: unknown
  handler: AcpPermissionHandler
}): Promise<CodexAcpPermissionInstallResult> {
  const model = params.model as AcpLanguageModelLike
  if (typeof model.connectClient !== "function") {
    return {
      ok: false,
      error: "Codex ACP language model does not expose connectClient.",
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
          : "Codex ACP connection could not be initialized.",
    }
  }

  const client = model.client
  if (!client || typeof client.setPermissionRequestHandler !== "function") {
    return {
      ok: false,
      error: "Codex ACP permission handler seam is unavailable.",
    }
  }

  client.setPermissionRequestHandler(params.handler)
  return { ok: true }
}
