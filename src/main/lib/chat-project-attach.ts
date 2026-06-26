import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { agentJobs, chats, projects, subChats } from "./db/schema"
import type { WorktreeSetupApprovalRequired } from "./git"
import type { AgentJobDatabase } from "./headless/job-store"
import {
  type CreateProjectChatWorktree,
  type ProjectChatWorktreeFailurePayload,
  resolveProjectChatWorktree,
} from "./project-chat-worktree"

export type AttachProjectTargetMode = "plan" | "agent"

export type AttachProjectToChatInput = {
  chatId: string
  projectId: string
  useWorktree: boolean
  baseBranch?: string
  branchType?: "local" | "remote"
  targetMode: AttachProjectTargetMode
  createWorktreeForChat?: CreateProjectChatWorktree
  onWorktreeFailure?: (payload: ProjectChatWorktreeFailurePayload) => void
  onWorktreeSetupApprovalRequired?: (
    request: WorktreeSetupApprovalRequired,
  ) => void
}

export async function attachProjectToChat(
  db: AgentJobDatabase,
  input: AttachProjectToChatInput,
) {
  const chat = db.select().from(chats).where(eq(chats.id, input.chatId)).get()
  if (!chat) {
    throw new Error("Chat not found")
  }

  if (chat.projectId) {
    throw new Error("Only folderless quick chats can attach a project")
  }

  if (chat.archivedAt) {
    throw new Error("Archived quick chats cannot attach a project")
  }

  if (
    chat.worktreePath ||
    chat.branch ||
    chat.baseBranch ||
    chat.prUrl ||
    chat.prNumber !== null
  ) {
    throw new Error("Quick chat already carries project workspace state")
  }

  const activeStream = db
    .select({ id: subChats.id })
    .from(subChats)
    .where(and(eq(subChats.chatId, input.chatId), isNotNull(subChats.streamId)))
    .get()
  if (activeStream) {
    throw new Error("Cannot attach project while a stream is active")
  }

  const activeJob = db
    .select({ id: agentJobs.id })
    .from(agentJobs)
    .where(
      and(
        eq(agentJobs.chatId, input.chatId),
        inArray(agentJobs.status, ["queued", "running"]),
      ),
    )
    .get()
  if (activeJob) {
    throw new Error("Cannot attach project while a job is active")
  }

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .get()
  if (!project) {
    throw new Error("Project not found")
  }

  const worktree = await resolveProjectChatWorktree({
    chatId: input.chatId,
    project,
    useWorktree: input.useWorktree,
    baseBranch: input.baseBranch,
    branchType: input.branchType,
    createWorktreeForChat: input.createWorktreeForChat,
    onWorktreeFailure: input.onWorktreeFailure,
    onWorktreeSetupApprovalRequired: input.onWorktreeSetupApprovalRequired,
  })
  const now = new Date()

  const updatedChat = db
    .update(chats)
    .set({
      projectId: input.projectId,
      worktreePath: worktree.worktreePath,
      branch: worktree.branch ?? null,
      baseBranch: worktree.baseBranch ?? null,
      updatedAt: now,
    })
    .where(eq(chats.id, input.chatId))
    .returning()
    .get()
  if (!updatedChat) {
    throw new Error("Failed to attach project")
  }

  db.update(subChats)
    .set({
      mode: input.targetMode,
      sessionId: null,
      streamId: null,
      updatedAt: now,
    })
    .where(eq(subChats.chatId, input.chatId))
    .run()

  const attachedSubChats = db
    .select()
    .from(subChats)
    .where(eq(subChats.chatId, input.chatId))
    .orderBy(subChats.createdAt)
    .all()

  return { ...updatedChat, project, subChats: attachedSubChats }
}
