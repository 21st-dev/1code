import { existsSync, realpathSync, statSync } from "node:fs"
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path"
import { and, eq, inArray } from "drizzle-orm"
import { LOCAL_JOB_API_PROJECT_NOT_REGISTERED } from "../../../shared/local-job-api"
import type { getDatabase } from "../db"
import { type AgentJob, agentJobs, type Project, projects } from "../db/schema"
import { type GitRemoteInfo, getGitRemoteInfo } from "../git"

export type ProjectRegistryDatabase = ReturnType<typeof getDatabase>

export type ProjectRegistrationErrorCode =
  | typeof LOCAL_JOB_API_PROJECT_NOT_REGISTERED
  | "project_path_invalid"
  | "project_cwd_outside_registered_path"
  | "unknown_project"

export class ProjectRegistrationError extends Error {
  readonly code: ProjectRegistrationErrorCode
  readonly cwd: string | null
  readonly projectId: string | null

  constructor(
    message: string,
    options: {
      code: ProjectRegistrationErrorCode
      cwd?: string | null
      projectId?: string | null
    },
  ) {
    super(message)
    this.name = "ProjectRegistrationError"
    this.code = options.code
    this.cwd = options.cwd ?? null
    this.projectId = options.projectId ?? null
  }
}

export function isProjectRegistrationError(
  error: unknown,
): error is ProjectRegistrationError {
  return error instanceof ProjectRegistrationError
}

export type ProjectRegistrationResult = {
  project: Project
  canonicalPath: string
  created: boolean
  restored: boolean
}

export type ProjectCwdRegistration =
  | {
      registered: true
      cwd: string
      project: Project
      projectPath: string
    }
  | {
      registered: false
      cwd: string
      project: null
      projectPath: null
    }

export type ActiveProjectJobSummary = Pick<
  AgentJob,
  "id" | "source" | "runtime" | "status" | "createdAt"
>

export type UnregisterProjectResult =
  | {
      removed: true
      canonicalPath: string
      project: Project
      activeJobs: ActiveProjectJobSummary[]
    }
  | {
      removed: false
      canonicalPath: string
      project: Project | null
      activeJobs: ActiveProjectJobSummary[]
      reason: "not_found" | "active_jobs"
    }

const EMPTY_GIT_INFO: GitRemoteInfo = {
  remoteUrl: null,
  provider: null,
  owner: null,
  repo: null,
}

function canonicalExistingDirectory(path: string, label: string): string {
  const resolved = resolve(path)
  if (!existsSync(resolved)) {
    throw new ProjectRegistrationError(`${label} does not exist: ${path}`, {
      code: "project_path_invalid",
      cwd: resolved,
    })
  }
  if (!statSync(resolved).isDirectory()) {
    throw new ProjectRegistrationError(
      `${label} must be a directory: ${path}`,
      {
        code: "project_path_invalid",
        cwd: resolved,
      },
    )
  }
  return realpathSync(resolved)
}

function canonicalPathWithExistingAncestor(
  path: string,
  label: string,
): string {
  const resolved = resolve(path)
  if (existsSync(resolved)) return canonicalExistingDirectory(path, label)

  const missingSegments: string[] = []
  let current = resolved
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) return resolved
    missingSegments.unshift(basename(current))
    current = parent
  }

  if (!statSync(current).isDirectory()) {
    throw new ProjectRegistrationError(
      `${label} nearest existing ancestor must be a directory: ${current}`,
      {
        code: "project_path_invalid",
        cwd: resolved,
      },
    )
  }

  return join(realpathSync(current), ...missingSegments)
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const rel = relative(parentPath, childPath)
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel))
}

function getProject(
  db: ProjectRegistryDatabase,
  projectId: string,
): Project | null {
  return (
    db.select().from(projects).where(eq(projects.id, projectId)).get() ?? null
  )
}

function getProjectByStoredPath(
  db: ProjectRegistryDatabase,
  path: string,
): Project | null {
  return db.select().from(projects).where(eq(projects.path, path)).get() ?? null
}

function canonicalProjectPath(project: Project): string | null {
  try {
    return canonicalExistingDirectory(project.path, "Registered project path")
  } catch {
    return null
  }
}

function findProjectByCanonicalPath(
  db: ProjectRegistryDatabase,
  canonicalPath: string,
): Project | null {
  const exact = getProjectByStoredPath(db, canonicalPath)
  if (exact) return exact

  for (const project of db.select().from(projects).all()) {
    const projectPath = canonicalProjectPath(project)
    if (projectPath === canonicalPath) return project
  }

  return null
}

async function resolveGitInfo(
  path: string,
  options: {
    gitInfo?: GitRemoteInfo | null
    gitInfoProvider?: (path: string) => Promise<GitRemoteInfo>
  },
): Promise<GitRemoteInfo> {
  if (options.gitInfo) return options.gitInfo
  try {
    return await (options.gitInfoProvider ?? getGitRemoteInfo)(path)
  } catch {
    return EMPTY_GIT_INFO
  }
}

function updateExistingProject(
  db: ProjectRegistryDatabase,
  project: Project,
  input: {
    canonicalPath: string
    gitInfo: GitRemoteInfo | null
    refreshExistingGitInfo: boolean
    now: Date
  },
): Project {
  const shouldRestore = project.removedAt != null
  if (
    project.path === input.canonicalPath &&
    !input.refreshExistingGitInfo &&
    !shouldRestore
  ) {
    return project
  }

  return (
    db
      .update(projects)
      .set({
        path: input.canonicalPath,
        updatedAt: input.now,
        removedAt: null,
        ...(input.refreshExistingGitInfo && input.gitInfo
          ? {
              gitRemoteUrl: input.gitInfo.remoteUrl,
              gitProvider: input.gitInfo.provider,
              gitOwner: input.gitInfo.owner,
              gitRepo: input.gitInfo.repo,
            }
          : {}),
      })
      .where(eq(projects.id, project.id))
      .returning()
      .get() ?? project
  )
}

export async function registerProjectForPath(input: {
  db: ProjectRegistryDatabase
  path: string
  name?: string | null
  now?: Date
  refreshExistingGitInfo?: boolean
  gitInfo?: GitRemoteInfo | null
  gitInfoProvider?: (path: string) => Promise<GitRemoteInfo>
}): Promise<ProjectRegistrationResult> {
  const canonicalPath = canonicalExistingDirectory(input.path, "Project path")
  const now = input.now ?? new Date()
  const existing = findProjectByCanonicalPath(input.db, canonicalPath)

  if (existing) {
    const gitInfo =
      input.refreshExistingGitInfo || input.gitInfo
        ? await resolveGitInfo(canonicalPath, input)
        : null
    const wasRemoved = existing.removedAt != null
    return {
      project: updateExistingProject(input.db, existing, {
        canonicalPath,
        gitInfo,
        refreshExistingGitInfo: input.refreshExistingGitInfo ?? false,
        now,
      }),
      canonicalPath,
      created: false,
      restored: wasRemoved,
    }
  }

  const gitInfo = await resolveGitInfo(canonicalPath, input)
  const name = input.name?.trim() || basename(canonicalPath)
  const project = input.db
    .insert(projects)
    .values({
      name,
      path: canonicalPath,
      gitRemoteUrl: gitInfo.remoteUrl,
      gitProvider: gitInfo.provider,
      gitOwner: gitInfo.owner,
      gitRepo: gitInfo.repo,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
  if (!project) throw new Error(`Failed to register project: ${canonicalPath}`)
  return { project, canonicalPath, created: true, restored: false }
}

export function getProjectRegistrationForCwd(input: {
  db: ProjectRegistryDatabase
  cwd: string
  projectId?: string | null
  label?: string
  includeRemoved?: boolean
}): ProjectCwdRegistration {
  const label = input.label ?? "Project cwd"
  const cwdReal = canonicalExistingDirectory(input.cwd, label)

  if (input.projectId) {
    const project = getProject(input.db, input.projectId)
    if (!project) {
      throw new ProjectRegistrationError(
        `Unknown project: ${input.projectId}`,
        {
          code: "unknown_project",
          cwd: cwdReal,
          projectId: input.projectId,
        },
      )
    }
    if (project.removedAt && !input.includeRemoved) {
      return {
        registered: false,
        cwd: cwdReal,
        project: null,
        projectPath: null,
      }
    }
    const projectReal = canonicalExistingDirectory(
      project.path,
      "Registered project path",
    )
    if (!isPathInside(projectReal, cwdReal)) {
      throw new ProjectRegistrationError(
        `${label} must be inside the registered project path`,
        {
          code: "project_cwd_outside_registered_path",
          cwd: cwdReal,
          projectId: project.id,
        },
      )
    }
    return {
      registered: true,
      cwd: cwdReal,
      project,
      projectPath: projectReal,
    }
  }

  for (const project of input.db.select().from(projects).all()) {
    if (project.removedAt && !input.includeRemoved) continue
    const projectReal = canonicalProjectPath(project)
    if (!projectReal) continue
    if (isPathInside(projectReal, cwdReal)) {
      return {
        registered: true,
        cwd: cwdReal,
        project,
        projectPath: projectReal,
      }
    }
  }

  return {
    registered: false,
    cwd: cwdReal,
    project: null,
    projectPath: null,
  }
}

export function getRegisteredProjectForCwdOrThrow(input: {
  db: ProjectRegistryDatabase
  cwd: string
  projectId?: string | null
  label?: string
}): Extract<ProjectCwdRegistration, { registered: true }> {
  const registration = getProjectRegistrationForCwd(input)
  if (registration.registered) return registration
  throw new ProjectRegistrationError(
    `${input.label ?? "Project cwd"} must be inside a registered project`,
    {
      code: LOCAL_JOB_API_PROJECT_NOT_REGISTERED,
      cwd: registration.cwd,
      projectId: input.projectId ?? null,
    },
  )
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

function removeProjectFromActiveList(input: {
  db: ProjectRegistryDatabase
  project: Project
  canonicalPath: string
  force?: boolean
  now?: Date
}): UnregisterProjectResult {
  const activeJobs = activeJobsForProject(input.db, input.project.id)
  if (activeJobs.length > 0 && !input.force) {
    return {
      removed: false,
      canonicalPath: input.canonicalPath,
      project: input.project,
      activeJobs,
      reason: "active_jobs",
    }
  }

  const now = input.now ?? new Date()
  const removed =
    input.db
      .update(projects)
      .set({
        removedAt: input.project.removedAt ?? now,
        updatedAt: now,
      })
      .where(eq(projects.id, input.project.id))
      .returning()
      .get() ?? input.project

  return {
    removed: true,
    canonicalPath: input.canonicalPath,
    project: removed,
    activeJobs,
  }
}

export function removeProjectFromActiveListById(input: {
  db: ProjectRegistryDatabase
  id: string
  force?: boolean
  now?: Date
}): UnregisterProjectResult {
  const project = getProject(input.db, input.id)
  if (!project) {
    return {
      removed: false,
      canonicalPath: "",
      project: null,
      activeJobs: [],
      reason: "not_found",
    }
  }
  return removeProjectFromActiveList({
    db: input.db,
    project,
    canonicalPath: project.path,
    force: input.force,
    now: input.now,
  })
}

export function restoreProjectById(input: {
  db: ProjectRegistryDatabase
  id: string
  now?: Date
}): Project | null {
  const now = input.now ?? new Date()
  return (
    input.db
      .update(projects)
      .set({
        removedAt: null,
        updatedAt: now,
      })
      .where(eq(projects.id, input.id))
      .returning()
      .get() ?? null
  )
}

export function unregisterProjectForPath(input: {
  db: ProjectRegistryDatabase
  path: string
  force?: boolean
}): UnregisterProjectResult {
  const canonicalPath = canonicalPathWithExistingAncestor(
    input.path,
    "Project path",
  )
  const project = findProjectByCanonicalPath(input.db, canonicalPath)
  if (!project) {
    return {
      removed: false,
      canonicalPath,
      project: null,
      activeJobs: [],
      reason: "not_found",
    }
  }

  return removeProjectFromActiveList({
    db: input.db,
    project,
    canonicalPath,
    force: input.force,
  })
}
