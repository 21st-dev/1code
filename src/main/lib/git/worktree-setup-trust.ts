import { createHash } from "node:crypto"
import { isAbsolute, relative, sep } from "node:path"
import { and, eq } from "drizzle-orm"
import { getDatabase, worktreeSetupTrustDecisions } from "../db"
import {
  detectWorktreeSetupPlan,
  executeWorktreeSetupCommands,
  type WorktreeSetupResult,
} from "./worktree-config"

export type WorktreeSetupTrustDatabase = ReturnType<typeof getDatabase>

export type WorktreeSetupTrustRequest = {
  projectId: string
  source: string
  configPath: string
  commandHash: string
  commands: string[]
}

export type WorktreeSetupTrustStatus =
  | { status: "not-configured" }
  | { status: "untrusted"; request: WorktreeSetupTrustRequest }
  | { status: "approved"; request: WorktreeSetupTrustRequest }

export type ApproveAndExecuteWorktreeSetupInput = {
  projectId: string
  projectPath: string
  worktreePath: string
  expectedCommandHash: string
  db?: WorktreeSetupTrustDatabase
}

function projectRelativeConfigPath(
  projectPath: string,
  configPath: string,
): string {
  const relativePath = relative(projectPath, configPath)
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    return configPath
  }
  return relativePath.split(sep).join("/")
}

function hashWorktreeSetupTrustDocument(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function hashWorktreeSetupCommands(input: {
  source: string
  configPath: string
  commands: string[]
  platform?: NodeJS.Platform
}): string {
  return hashWorktreeSetupTrustDocument({
    schemaVersion: 1,
    platform: input.platform ?? process.platform,
    source: input.source,
    configPath: input.configPath,
    commands: input.commands,
  })
}

export async function buildWorktreeSetupTrustRequest(input: {
  projectId: string
  projectPath: string
}): Promise<WorktreeSetupTrustRequest | null> {
  const plan = await detectWorktreeSetupPlan(input.projectPath)
  if (!plan) return null

  const configPath = projectRelativeConfigPath(
    input.projectPath,
    plan.configPath,
  )
  return {
    projectId: input.projectId,
    source: plan.source,
    configPath,
    commands: plan.commands,
    commandHash: hashWorktreeSetupCommands({
      source: plan.source,
      configPath,
      commands: plan.commands,
    }),
  }
}

export async function getWorktreeSetupTrustStatus(input: {
  projectId: string
  projectPath: string
  db?: WorktreeSetupTrustDatabase
}): Promise<WorktreeSetupTrustStatus> {
  const request = await buildWorktreeSetupTrustRequest(input)
  if (!request) {
    return { status: "not-configured" }
  }

  const db = input.db ?? getDatabase()
  const decision = db
    .select()
    .from(worktreeSetupTrustDecisions)
    .where(
      and(
        eq(worktreeSetupTrustDecisions.projectId, input.projectId),
        eq(worktreeSetupTrustDecisions.commandHash, request.commandHash),
        eq(worktreeSetupTrustDecisions.decision, "approved"),
      ),
    )
    .get()

  if (decision) {
    return { status: "approved", request }
  }

  return { status: "untrusted", request }
}

export function recordWorktreeSetupApproval(input: {
  projectId: string
  request: WorktreeSetupTrustRequest
  db?: WorktreeSetupTrustDatabase
}): void {
  const db = input.db ?? getDatabase()
  const existing = db
    .select()
    .from(worktreeSetupTrustDecisions)
    .where(
      and(
        eq(worktreeSetupTrustDecisions.projectId, input.projectId),
        eq(worktreeSetupTrustDecisions.commandHash, input.request.commandHash),
      ),
    )
    .get()
  const now = new Date()

  if (existing) {
    db.update(worktreeSetupTrustDecisions)
      .set({
        configSource: input.request.source,
        configPath: input.request.configPath,
        decision: "approved",
        updatedAt: now,
      })
      .where(eq(worktreeSetupTrustDecisions.id, existing.id))
      .run()
    return
  }

  db.insert(worktreeSetupTrustDecisions)
    .values({
      projectId: input.projectId,
      configSource: input.request.source,
      configPath: input.request.configPath,
      commandHash: input.request.commandHash,
      decision: "approved",
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

export async function approveAndExecuteWorktreeSetup(
  input: ApproveAndExecuteWorktreeSetupInput,
): Promise<WorktreeSetupResult> {
  const status = await getWorktreeSetupTrustStatus(input)
  if (status.status === "not-configured") {
    throw new Error(
      "No worktree setup commands are configured for this project.",
    )
  }

  if (status.request.commandHash !== input.expectedCommandHash) {
    throw new Error(
      "Worktree setup commands changed. Review the commands again.",
    )
  }

  recordWorktreeSetupApproval({
    projectId: input.projectId,
    request: status.request,
    db: input.db,
  })

  return executeWorktreeSetupCommands(
    input.worktreePath,
    input.projectPath,
    status.request.commands,
  )
}
