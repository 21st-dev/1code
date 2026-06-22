import { and, eq, inArray } from "drizzle-orm"
import { trackWorkspaceDeleted } from "../analytics"
import {
  cleanupChatWorkspaceForDelete,
  type WorkspaceCleanupDeps,
  type WorkspaceCleanupResult,
} from "../chats/workspace-cleanup"
import {
  agentJobs,
  type Chat,
  chats,
  type Project,
  projects,
  subChats,
} from "../db/schema"
import type {
  ActiveProjectJobSummary,
  ProjectRegistryDatabase,
} from "./registry"

export type ProjectDeletionPreview = {
  project: Project
  chatCount: number
  subChatCount: number
  worktreeCount: number
  activeJobs: ActiveProjectJobSummary[]
}

export type ProjectDeletionResult = ProjectDeletionPreview & {
  deletedProject: Project
  cleanupResults: WorkspaceCleanupResult[]
}

export class ProjectDeletionError extends Error {
  readonly code:
    | "project_not_found"
    | "project_not_removed"
    | "project_has_active_jobs"
    | "cleanup_failed"
  readonly preview: ProjectDeletionPreview | null
  readonly cleanupResults: WorkspaceCleanupResult[]

  constructor(
    message: string,
    options: {
      code: ProjectDeletionError["code"]
      preview?: ProjectDeletionPreview | null
      cleanupResults?: WorkspaceCleanupResult[]
    },
  ) {
    super(message)
    this.name = "ProjectDeletionError"
    this.code = options.code
    this.preview = options.preview ?? null
    this.cleanupResults = options.cleanupResults ?? []
  }
}

function activeJobsForProject(
  db: ProjectRegistryDatabase,
  projectId: string,
): ActiveProjectJobSummary[] {
  return db
    .select({
      id: agentJobs.id,
      source: agentJobs.source,
      runtime: agentJobs.runtime,
      status: agentJobs.status,
      createdAt: agentJobs.createdAt,
    })
    .from(agentJobs)
    .where(
      and(
        eq(agentJobs.projectId, projectId),
        inArray(agentJobs.status, ["queued", "running"]),
      ),
    )
    .all()
}

function projectChats(db: ProjectRegistryDatabase, projectId: string): Chat[] {
  return db.select().from(chats).where(eq(chats.projectId, projectId)).all()
}

function countSubChatsForChats(
  db: ProjectRegistryDatabase,
  chatIds: string[],
): number {
  if (chatIds.length === 0) return 0
  return db
    .select({ id: subChats.id })
    .from(subChats)
    .where(inArray(subChats.chatId, chatIds))
    .all().length
}

export function getProjectDeletionPreview(
  db: ProjectRegistryDatabase,
  projectId: string,
): ProjectDeletionPreview | null {
  const project =
    db.select().from(projects).where(eq(projects.id, projectId)).get() ?? null
  if (!project) return null

  const projectChatRows = projectChats(db, project.id)
  return {
    project,
    chatCount: projectChatRows.length,
    subChatCount: countSubChatsForChats(
      db,
      projectChatRows.map((chat) => chat.id),
    ),
    worktreeCount: projectChatRows.filter(
      (chat) => chat.worktreePath && chat.branch,
    ).length,
    activeJobs: activeJobsForProject(db, project.id),
  }
}

export async function deleteProjectWithCleanup(input: {
  db: ProjectRegistryDatabase
  projectId: string
  requireRemoved?: boolean
  cleanupDeps?: WorkspaceCleanupDeps
}): Promise<ProjectDeletionResult | null> {
  const preview = getProjectDeletionPreview(input.db, input.projectId)
  if (!preview) return null

  if (input.requireRemoved && !preview.project.removedAt) {
    throw new ProjectDeletionError(
      "Project history can only be deleted after the project is removed from the active list.",
      {
        code: "project_not_removed",
        preview,
      },
    )
  }

  if (preview.activeJobs.length > 0) {
    throw new ProjectDeletionError(
      `Project has ${preview.activeJobs.length} active job(s). Cancel or finish them before deleting this project.`,
      {
        code: "project_has_active_jobs",
        preview,
      },
    )
  }

  const projectChatRows = projectChats(input.db, input.projectId)
  const cleanupResults: WorkspaceCleanupResult[] = []

  for (const chat of projectChatRows) {
    const result = await cleanupChatWorkspaceForDelete(
      chat,
      preview.project,
      input.cleanupDeps,
    )
    cleanupResults.push(result)
  }

  const failed = cleanupResults.filter((result) => !result.success)
  if (failed.length > 0) {
    throw new ProjectDeletionError(
      `Failed to clean ${failed.length} workspace(s). The project was not deleted.`,
      {
        code: "cleanup_failed",
        preview,
        cleanupResults,
      },
    )
  }

  for (const chat of projectChatRows) {
    trackWorkspaceDeleted(chat.id)
  }

  const deletedProject =
    input.db
      .delete(projects)
      .where(eq(projects.id, input.projectId))
      .returning()
      .get() ?? preview.project

  return {
    ...preview,
    deletedProject,
    cleanupResults,
  }
}
