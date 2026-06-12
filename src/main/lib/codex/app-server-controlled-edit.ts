import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  decideCodexAcpToolPermission,
  type CodexAcpPermissionTool,
} from "./acp-permission"
import type {
  CodexAppServerPermissionMapping,
  ObservedToolPolicy,
} from "../agent-runtime/permission-policy"
import {
  normalizeToolPathInsideCwd,
  type ValidatedAgentScopeContract,
} from "../agent-guard"

type JsonObject = Record<string, unknown>

export type CodexAppServerDynamicToolSpec = {
  namespace?: string | null
  name: string
  description: string
  inputSchema: unknown
}

export type CodexAppServerDynamicToolCallParams = {
  threadId: string
  turnId: string
  callId: string
  namespace?: string | null
  tool: string
  arguments: unknown
}

export type CodexAppServerDynamicToolCallResponse = {
  success: boolean
  contentItems: Array<{ type: "inputText"; text: string }>
}

export type CodexControlledEditPrepared = {
  tool: CodexAcpPermissionTool
  operation: "create" | "replace"
  cwd: string
  relativePath: string
  absolutePath: string
  content: string
  previousContent: string
  diff: string
  policyMessage?: string
}

export type CodexControlledEditPrepareResult =
  | { ok: true; edit: CodexControlledEditPrepared }
  | { ok: false; message: string }

export const CODEX_CONTROLLED_EDIT_TOOL_NAMESPACE = "locus_edit"
export const CODEX_CONTROLLED_EDIT_TOOL_NAME = "propose_file_edit"

const MAX_CONTROLLED_EDIT_CONTENT_BYTES = 256 * 1024
const MAX_CONTROLLED_EDIT_DIFF_CHARS = 16000
const MAX_DIFF_LINES = 120

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseArguments(value: unknown): JsonObject | null {
  if (isRecord(value)) return value
  if (typeof value !== "string" || value.trim().length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isInsideRealRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

function nearestExistingAncestor(pathname: string): string | null {
  let current = pathname
  for (;;) {
    if (existsSync(current)) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function assertWriteTargetInsideCwd(cwd: string, absolutePath: string): string | null {
  try {
    const realRoot = realpathSync(cwd)
    if (existsSync(absolutePath)) {
      const targetReal = realpathSync(absolutePath)
      return isInsideRealRoot(realRoot, targetReal)
        ? null
        : "Controlled edit target resolves outside the workspace."
    }

    const ancestor = nearestExistingAncestor(dirname(absolutePath))
    if (!ancestor) return "Controlled edit target has no existing workspace ancestor."
    const ancestorReal = realpathSync(ancestor)
    return isInsideRealRoot(realRoot, ancestorReal)
      ? null
      : "Controlled edit target parent resolves outside the workspace."
  } catch {
    return "Controlled edit target could not be validated against the workspace."
  }
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n[truncated ${value.length - limit} chars]`
}

function prefixedLines(value: string, prefix: string): string[] {
  if (value.length === 0) return []
  return value.split("\n").map((line) => `${prefix}${line}`)
}

function boundedDiff(input: {
  operation: "create" | "replace"
  relativePath: string
  previousContent: string
  content: string
}): string {
  const lines = [
    `--- ${input.operation === "create" ? "/dev/null" : input.relativePath}`,
    `+++ ${input.relativePath}`,
    "@@",
    ...prefixedLines(input.previousContent, "-"),
    ...prefixedLines(input.content, "+"),
  ]
  const clippedLines =
    lines.length > MAX_DIFF_LINES
      ? [...lines.slice(0, MAX_DIFF_LINES), `[truncated ${lines.length - MAX_DIFF_LINES} diff lines]`]
      : lines
  return truncateText(clippedLines.join("\n"), MAX_CONTROLLED_EDIT_DIFF_CHARS)
}

function readExistingContent(pathname: string): string {
  return readFileSync(pathname, "utf8")
}

export function buildCodexControlledEditDynamicToolSpec(): CodexAppServerDynamicToolSpec {
  return {
    namespace: CODEX_CONTROLLED_EDIT_TOOL_NAMESPACE,
    name: CODEX_CONTROLLED_EDIT_TOOL_NAME,
    description:
      "Propose a guarded file edit for Locus to validate, show as a diff, and apply only after user approval. Use this structured editing tool instead of shell commands for file changes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Project-relative path to create or replace.",
        },
        operation: {
          type: "string",
          enum: ["create", "replace"],
          description: "Use create for a new file and replace for an existing file.",
        },
        content: {
          type: "string",
          description: "Complete UTF-8 file content to write after approval.",
        },
        expected_previous_content: {
          type: "string",
          description:
            "Optional exact previous content for stale-write detection on replace.",
        },
      },
      required: ["path", "operation", "content"],
    },
  }
}

export function codexControlledEditDeveloperInstructions(): string {
  return "For guarded file changes, use available structured file-editing tools instead of shell commands. Locus will validate scope, show a diff, and apply only after user approval."
}

export function isCodexControlledEditToolCall(
  params: CodexAppServerDynamicToolCallParams,
): boolean {
  return (
    params.tool === CODEX_CONTROLLED_EDIT_TOOL_NAME &&
    (params.namespace ?? CODEX_CONTROLLED_EDIT_TOOL_NAMESPACE) ===
      CODEX_CONTROLLED_EDIT_TOOL_NAMESPACE
  )
}

export function dynamicToolResponse(
  success: boolean,
  text: string,
): CodexAppServerDynamicToolCallResponse {
  return {
    success,
    contentItems: [{ type: "inputText", text }],
  }
}

export function prepareCodexControlledEdit(input: {
  params: CodexAppServerDynamicToolCallParams
  permission: CodexAppServerPermissionMapping
  guardedContract?: ValidatedAgentScopeContract | null
  onGuardEvent?: (event: AgentGuardEvent) => void
  onObservedToolDecision?: (event: {
    controlLevel: "observe"
    decision: "allow" | "deny"
    risk: unknown
    message?: string
  }) => void
}): CodexControlledEditPrepareResult {
  if (!input.guardedContract) {
    return { ok: false, message: "Controlled edit requires an approved guarded scope contract." }
  }
  if (input.permission.controlLevel !== "guarded") {
    return { ok: false, message: "Controlled edit is only enabled for guarded Codex runs." }
  }

  const args = parseArguments(input.params.arguments)
  if (!args) return { ok: false, message: "Controlled edit arguments must be a JSON object." }

  const rawOperation = args.operation
  if (rawOperation !== "create" && rawOperation !== "replace") {
    return {
      ok: false,
      message: "Controlled edit operation must be create or replace.",
    }
  }

  const rawPath = args.path
  const content = args.content
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return { ok: false, message: "Controlled edit path is required." }
  }
  if (typeof content !== "string") {
    return { ok: false, message: "Controlled edit content must be a string." }
  }
  if (Buffer.byteLength(content, "utf8") > MAX_CONTROLLED_EDIT_CONTENT_BYTES) {
    return { ok: false, message: "Controlled edit content is too large." }
  }

  const relativePath = normalizeToolPathInsideCwd(
    input.guardedContract.cwd,
    rawPath,
  )
  if (!relativePath) {
    return { ok: false, message: "Controlled edit path escapes the guarded workspace." }
  }

  const tool: CodexAcpPermissionTool = {
    toolUseId: input.params.callId,
    toolName: "Edit",
    toolInput: {
      path: relativePath,
      file_path: relativePath,
      operation: rawOperation,
    },
    kind: "edit",
    title: `Edit ${relativePath}`,
  }
  const decision = decideCodexAcpToolPermission({
    tool,
    mode: "agent",
    controlLevel: input.permission.controlLevel,
    observedToolPolicy: input.permission.observedToolPolicy as ObservedToolPolicy,
    contract: input.guardedContract,
  })
  if (decision.guardEvent) input.onGuardEvent?.(decision.guardEvent)
  if (decision.observed) input.onObservedToolDecision?.(decision.observed)
  if (decision.decision !== "allow") {
    return {
      ok: false,
      message:
        decision.message || "Controlled edit was denied by guarded scope policy.",
    }
  }

  const absolutePath = resolve(input.guardedContract.cwd, relativePath)
  const targetError = assertWriteTargetInsideCwd(
    input.guardedContract.cwd,
    absolutePath,
  )
  if (targetError) return { ok: false, message: targetError }

  const exists = existsSync(absolutePath)
  if (rawOperation === "create" && exists) {
    return { ok: false, message: "Controlled edit create target already exists." }
  }
  if (rawOperation === "replace" && !exists) {
    return { ok: false, message: "Controlled edit replace target does not exist." }
  }
  if (exists && !statSync(absolutePath).isFile()) {
    return { ok: false, message: "Controlled edit target is not a regular file." }
  }

  const previousContent = exists ? readExistingContent(absolutePath) : ""
  if (
    typeof args.expected_previous_content === "string" &&
    args.expected_previous_content !== previousContent
  ) {
    return { ok: false, message: "Controlled edit target changed before approval." }
  }

  return {
    ok: true,
    edit: {
      tool,
      operation: rawOperation,
      cwd: input.guardedContract.cwd,
      relativePath,
      absolutePath,
      content,
      previousContent,
      diff: boundedDiff({
        operation: rawOperation,
        relativePath,
        previousContent,
        content,
      }),
      ...(decision.message ? { policyMessage: decision.message } : {}),
    },
  }
}

export function applyCodexControlledEdit(
  edit: CodexControlledEditPrepared,
): void {
  const targetError = assertWriteTargetInsideCwd(edit.cwd, edit.absolutePath)
  if (targetError) {
    throw new Error(targetError)
  }
  const exists = existsSync(edit.absolutePath)
  if (edit.operation === "create" && exists) {
    throw new Error("Controlled edit create target changed before approval.")
  }
  if (edit.operation === "replace" && !exists) {
    throw new Error("Controlled edit replace target changed before approval.")
  }
  if (exists && !statSync(edit.absolutePath).isFile()) {
    throw new Error("Controlled edit target is not a regular file.")
  }
  const currentContent = exists ? readExistingContent(edit.absolutePath) : ""
  if (currentContent !== edit.previousContent) {
    throw new Error("Controlled edit target changed before approval.")
  }
  mkdirSync(dirname(edit.absolutePath), { recursive: true })
  writeFileSync(edit.absolutePath, edit.content, "utf8")
}
