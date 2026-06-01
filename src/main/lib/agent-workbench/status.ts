export type AgentWorkbenchStatus =
  | "running"
  | "blocked"
  | "needs-review"
  | "has-pr"
  | "clean"
  | "archived"

export type AgentWorkbenchFilter =
  | "all"
  | "running"
  | "needs-review"
  | "prs"
  | "blocked"
  | "clean"

export type AgentWorkbenchDiffSummary = {
  fileCount: number
  additions: number | null
  deletions: number | null
  error?: string
}

export type AgentWorkbenchLatestSubChat = {
  id: string
  name: string | null
  mode: "plan" | "agent"
  sessionId: string | null
  streamId: string | null
  updatedAt: Date | null
  lastMessageRole: string | null
  pendingPlanApproval: boolean
  pendingUserQuestion: boolean
  errorText: string | null
  guardedRunStatus: string | null
}

export type AgentWorkbenchStatusInput = {
  archived: boolean
  worktreePath: string | null
  hasActiveStream: boolean
  hasPendingUserQuestion: boolean
  hasPendingPlanApproval: boolean
  runtimeError: string | null
  guardedRunStatus?: string | null
  diff: AgentWorkbenchDiffSummary
  prUrl: string | null
  prNumber: number | null
}

export type AgentWorkbenchStatusResult = {
  status: AgentWorkbenchStatus
  reason: string | null
}

type StoredMessage = {
  role?: unknown
  parts?: unknown
  content?: unknown
  createdAt?: unknown
  metadata?: unknown
}

type StoredPart = {
  type?: unknown
  state?: unknown
  input?: unknown
  output?: unknown
  errorText?: unknown
  text?: unknown
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null
}

function asStoredParts(value: unknown): StoredPart[] {
  return Array.isArray(value) ? (value as StoredPart[]) : []
}

function hasCompletedExitPlanMode(messages: StoredMessage[], mode: string): boolean {
  if (mode !== "plan") return false

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== "assistant") continue

    for (const part of asStoredParts(message.parts)) {
      if (part.type === "tool-ExitPlanMode" && part.output !== undefined) {
        return true
      }
    }
  }

  return false
}

function hasPendingAskUserQuestion(messages: StoredMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== "assistant") continue

    for (const part of asStoredParts(message.parts)) {
      if (
        part.type === "tool-AskUserQuestion" &&
        part.output === undefined &&
        part.state !== "output-available"
      ) {
        const input = readObject(part.input)
        if (Array.isArray(input.questions) && input.questions.length > 0) {
          return true
        }
      }
    }

    return false
  }

  return false
}

function getLastRuntimeError(messages: StoredMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message) continue

    for (const part of asStoredParts(message.parts).slice().reverse()) {
      const type = readString(part.type)
      if (!type) continue

      if (type === "error" || type === "tool-error" || type === "runtime-error") {
        return (
          readString(part.errorText) ||
          readString(part.text) ||
          "Runtime error"
        )
      }
    }
  }

  return null
}

function getLastGuardedRunAuditStatus(messages: StoredMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== "assistant") continue

    const metadata = readObject(message.metadata)
    const guardedRun = readObject(metadata.guardedRun)
    const audit = readObject(guardedRun.audit)
    const status = readString(audit.status)
    if (status) return status
  }

  return null
}

export function parseWorkbenchMessages(rawMessages: string | null | undefined): StoredMessage[] {
  if (!rawMessages) return []

  try {
    const parsed = JSON.parse(rawMessages)
    return Array.isArray(parsed) ? (parsed as StoredMessage[]) : []
  } catch {
    return []
  }
}

export function summarizeLatestSubChat(input: {
  id: string
  name: string | null
  mode: string | null
  sessionId: string | null
  streamId: string | null
  updatedAt: Date | null
  messages: string | null
}): AgentWorkbenchLatestSubChat {
  const mode = input.mode === "plan" ? "plan" : "agent"
  const messages = parseWorkbenchMessages(input.messages)
  const lastMessage = messages[messages.length - 1]

  return {
    id: input.id,
    name: input.name,
    mode,
    sessionId: input.sessionId,
    streamId: input.streamId,
    updatedAt: input.updatedAt,
    lastMessageRole: readString(lastMessage?.role) || null,
    pendingPlanApproval: hasCompletedExitPlanMode(messages, mode),
    pendingUserQuestion: hasPendingAskUserQuestion(messages),
    errorText: getLastRuntimeError(messages),
    guardedRunStatus: getLastGuardedRunAuditStatus(messages),
  }
}

export function classifyAgentWorkbenchStatus(
  input: AgentWorkbenchStatusInput,
): AgentWorkbenchStatusResult {
  if (input.archived) {
    return { status: "archived", reason: "Archived" }
  }

  if (!input.worktreePath) {
    return { status: "blocked", reason: "Missing workspace path" }
  }

  if (input.hasPendingUserQuestion) {
    return { status: "blocked", reason: "Waiting for user answer" }
  }

  if (input.hasPendingPlanApproval) {
    return { status: "blocked", reason: "Waiting for plan approval" }
  }

  if (input.runtimeError) {
    return { status: "blocked", reason: input.runtimeError }
  }

  if (input.hasActiveStream) {
    return { status: "running", reason: "Agent is running" }
  }

  if (input.guardedRunStatus === "blocked") {
    return { status: "blocked", reason: "Guarded run blocked an action" }
  }

  if (
    input.guardedRunStatus === "drifted" ||
    input.guardedRunStatus === "needs-review"
  ) {
    return { status: "needs-review", reason: "Guarded run needs review" }
  }

  if (input.diff.fileCount > 0) {
    return { status: "needs-review", reason: "Local changes need review" }
  }

  if (input.prUrl || input.prNumber) {
    return { status: "has-pr", reason: "Pull request is tracked" }
  }

  return { status: "clean", reason: null }
}

export function matchesAgentWorkbenchFilter(
  status: AgentWorkbenchStatus,
  filter: AgentWorkbenchFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "prs") return status === "has-pr"
  return status === filter
}
