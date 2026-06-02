import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { eq } from "drizzle-orm"
import type { AgentRuntimeId } from "../../shared/agent-runtime-capabilities"
import type { AgentJobMode } from "../../shared/agent-jobs"
import type { AgentJob } from "./db/schema"
import { chats, projects, subChats } from "./db/schema"
import type { AgentJobDatabase } from "./headless/job-store"
import {
  appendAgentJobEvent,
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  requestCancelAgentJob,
  startAgentJob,
} from "./headless/job-store"

type DesktopAgentRuntime = Extract<AgentRuntimeId, "claude-code" | "codex">

export type CreateDesktopAgentJobInput = {
  runtime: DesktopAgentRuntime
  mode: AgentJobMode
  chatId: string
  subChatId: string
  cwd: string
  prompt: string
  runId?: string | null
}

export type DesktopAgentJobHandle = {
  job: AgentJob
  workerId: string
  cwd: string
}

type CancelRegistration = {
  jobId: string
  runtime: DesktopAgentRuntime
  subChatId: string
  runId?: string | null
  cancel: () => void
}

const activeDesktopJobCancellations = new Map<string, CancelRegistration>()

function assertDesktopRuntime(runtime: string): asserts runtime is DesktopAgentRuntime {
  if (runtime !== "claude-code" && runtime !== "codex") {
    throw new Error(`Unsupported desktop job runtime: ${runtime}`)
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function normalizePath(value: string): string {
  return path.resolve(value)
}

function getChatJobContext(
  db: AgentJobDatabase,
  input: Pick<CreateDesktopAgentJobInput, "chatId" | "subChatId" | "cwd">,
) {
  const chat = db
    .select()
    .from(chats)
    .where(eq(chats.id, input.chatId))
    .get()
  if (!chat) throw new Error(`Unknown chat: ${input.chatId}`)

  const subChat = db
    .select()
    .from(subChats)
    .where(eq(subChats.id, input.subChatId))
    .get()
  if (!subChat) throw new Error(`Unknown sub-chat: ${input.subChatId}`)
  if (subChat.chatId !== chat.id) {
    throw new Error(
      `Sub-chat ${subChat.id} does not belong to chat ${chat.id}`,
    )
  }

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, chat.projectId))
    .get()
  if (!project) throw new Error(`Unknown project: ${chat.projectId}`)

  const expectedCwd = normalizePath(chat.worktreePath || project.path)
  const requestedCwd = normalizePath(input.cwd)
  if (requestedCwd !== expectedCwd) {
    throw new Error(
      `Desktop job cwd mismatch: expected ${expectedCwd}, received ${requestedCwd}`,
    )
  }

  return { chat, subChat, project, cwd: expectedCwd }
}

export function createAndStartDesktopAgentJob(
  db: AgentJobDatabase,
  input: CreateDesktopAgentJobInput,
): DesktopAgentJobHandle {
  assertDesktopRuntime(input.runtime)
  const context = getChatJobContext(db, input)
  const workerId = `desktop:${input.runtime}:${input.runId || randomUUID()}`
  const prompt = input.prompt
  const job = createAgentJob(db, {
    source: "desktop",
    runtime: input.runtime,
    mode: input.mode,
    cwd: context.cwd,
    prompt,
    input: {
      kind: "desktop-chat",
      chatId: context.chat.id,
      subChatId: context.subChat.id,
      projectId: context.project.id,
      runId: input.runId ?? null,
      promptSha256: sha256(prompt),
      promptLength: prompt.length,
    },
    projectId: context.project.id,
    chatId: context.chat.id,
    subChatId: context.subChat.id,
  })

  const running = startAgentJob(db, {
    jobId: job.id,
    workerId,
    workerPid: process.pid,
  })
  appendAgentJobEvent(db, {
    jobId: job.id,
    type: "status",
    payload: {
      status: "desktop_chat_stream_started",
      runtime: input.runtime,
      mode: input.mode,
      runId: input.runId ?? null,
    },
  })

  return { job: running, workerId, cwd: context.cwd }
}

export function registerActiveDesktopAgentJob(
  registration: CancelRegistration,
): void {
  activeDesktopJobCancellations.set(registration.jobId, registration)
}

export function unregisterActiveDesktopAgentJob(jobId: string): void {
  activeDesktopJobCancellations.delete(jobId)
}

export function cancelActiveDesktopAgentJob(jobId: string): boolean {
  const registration = activeDesktopJobCancellations.get(jobId)
  if (!registration) return false
  registration.cancel()
  return true
}

export function requestCancelDesktopAgentJob(
  db: AgentJobDatabase,
  jobId: string,
  requestedBy: string,
): { job: AgentJob; activeCancelDelivered: boolean } {
  const job = getAgentJob(db, jobId)
  if (!job) throw new Error(`Unknown job: ${jobId}`)
  const updated = requestCancelAgentJob(db, jobId, requestedBy)
  return {
    job: updated,
    activeCancelDelivered: cancelActiveDesktopAgentJob(jobId),
  }
}

export function completeDesktopAgentJobSafely(
  db: AgentJobDatabase,
  input: {
    jobId: string | null | undefined
    status: "succeeded" | "failed" | "canceled" | "interrupted"
    exitCode?: number | null
    errorCode?: string | null
    errorMessage?: string | null
    result?: unknown
  },
): AgentJob | null {
  if (!input.jobId) return null
  const current = getAgentJob(db, input.jobId)
  if (!current || current.status !== "running") return current
  return completeAgentJob(db, {
    jobId: input.jobId,
    status: input.status,
    exitCode: input.exitCode,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    result: input.result,
  })
}
