import { AGENT_ENGINE_IDS, type AgentEngineId } from "../agent-runtime/types"
import * as fs from "fs/promises"
import * as path from "path"
import { buildGovernedResourceProjection } from "../shared-resources/governance"
import type {
  EngineResourceProjection,
  SharedResource,
} from "../shared-resources/types"
import { ensureMossSource } from "./bootstrap"
import {
  materializeMossProjection,
  type MossProjectionMaterializeResult,
  type MossProjectionMaterializeStatus,
} from "./projection"
import { discoverMossSourceResources } from "./registry"

export interface MossEngineProjectionSummary {
  created: number
  updated: number
  skipped: number
  conflict: number
  unsupported: number
  total: number
}

export interface MaterializedMossEngineProjection {
  engineId: AgentEngineId
  projectPath: string
  projectionStatus: EngineResourceProjection["status"] | "skipped"
  warnings: string[]
  results: MossProjectionMaterializeResult[]
  summary: MossEngineProjectionSummary
  reason?: string
}

export interface FailedMossEngineProjection {
  engineId: AgentEngineId
  projectPath: string
  projectionStatus: "skipped"
  warnings: string[]
  results: []
  summary: {
    created: 0
    updated: 0
    skipped: 0
    conflict: 0
    unsupported: 0
    total: 0
  }
  reason: string
}

export type MossEngineProjectionResult =
  | MaterializedMossEngineProjection
  | FailedMossEngineProjection

export interface MaterializeMossEngineProjectionOptions {
  projectPath: string
  engineId: AgentEngineId
  dryRun?: boolean
  createIfMissing?: boolean
  expectedResourceIds?: readonly string[]
}

export interface MaterializeMossWorkspaceProjectionsOptions {
  projectPath: string
  engines?: readonly AgentEngineId[]
  dryRun?: boolean
  createIfMissing?: boolean
  expectedResourceIds?: readonly string[]
}

export interface MaterializedMossWorkspaceProjections {
  projectPath: string
  dryRun: boolean
  projections: MossEngineProjectionResult[]
}

export interface MossWorkspaceSourceLinkResult {
  sourceProjectPath: string
  workspacePath: string
  sourceRoot: string
  targetRoot: string
  status: "created" | "skipped" | "conflict"
  created: string[]
  skipped: string[]
  conflicts: Array<{ path: string; reason: string }>
  reason?: string
}

export interface LinkMossSourceIntoWorkspaceOptions {
  sourceProjectPath: string
  workspacePath: string
}

const MOSS_LINK_ENTRIES = [
  { source: "source", type: "dir" },
  { source: "memory", type: "dir" },
  { source: "skills", type: "dir" },
  { source: "mcp", type: "dir" },
  { source: "plugins", type: "dir" },
  { source: "hooks", type: "dir" },
  { source: "subagents", type: "dir" },
  { source: "providers.yaml", type: "file" },
] as const
const RESOURCE_DISCOVERY_MAX_ATTEMPTS = 20
const RESOURCE_DISCOVERY_RETRY_DELAY_MS = 50

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function safeRealpath(filePath: string): Promise<string | null> {
  try {
    return await fs.realpath(filePath)
  } catch {
    return null
  }
}

async function linkPointsTo(linkPath: string, expectedTarget: string): Promise<boolean> {
  try {
    const target = await fs.readlink(linkPath)
    return path.resolve(path.dirname(linkPath), target) === path.resolve(expectedTarget)
  } catch {
    return false
  }
}

async function hasLocalMossSource(targetRoot: string, sourceRoot: string): Promise<boolean> {
  const targetSource = path.join(targetRoot, "source")
  if (!(await fileExists(path.join(targetSource, "moss.md")))) return false
  return !(await linkPointsTo(targetSource, path.join(sourceRoot, "source")))
}

function summarizeProjectionResults(
  results: MossProjectionMaterializeResult[],
): MossEngineProjectionSummary {
  const summary: Record<MossProjectionMaterializeStatus, number> = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflict: 0,
    unsupported: 0,
  }

  for (const result of results) {
    summary[result.status] += 1
  }

  return {
    ...summary,
    total: results.length,
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function missingExpectedResourceIds(
  resources: SharedResource[],
  expectedResourceIds: readonly string[] | undefined,
): string[] {
  if (!expectedResourceIds?.length) return []

  const actualResourceIds = new Set(resources.map((resource) => resource.id))
  return expectedResourceIds.filter((resourceId) => !actualResourceIds.has(resourceId))
}

async function discoverMossSourceResourcesForProjection(params: {
  projectPath: string
  expectedResourceIds?: readonly string[]
}): Promise<SharedResource[]> {
  let resources: SharedResource[] = []
  for (let attempt = 0; attempt < RESOURCE_DISCOVERY_MAX_ATTEMPTS; attempt += 1) {
    resources = await discoverMossSourceResources(params.projectPath)
    if (missingExpectedResourceIds(resources, params.expectedResourceIds).length === 0) {
      return resources
    }
    if (attempt < RESOURCE_DISCOVERY_MAX_ATTEMPTS - 1) {
      await sleep(RESOURCE_DISCOVERY_RETRY_DELAY_MS)
    }
  }

  const missing = missingExpectedResourceIds(resources, params.expectedResourceIds)
  throw new Error(
    `Moss Unified Source did not discover expected resource(s): ${missing.join(", ")}`,
  )
}

function emptyProjectionSummary(): MossEngineProjectionSummary {
  return summarizeProjectionResults([])
}

function skippedProjectionResult(params: {
  projectPath: string
  engineId: AgentEngineId
  reason: string
}): MaterializedMossEngineProjection {
  return {
    engineId: params.engineId,
    projectPath: params.projectPath,
    projectionStatus: "skipped",
    warnings: [],
    results: [],
    summary: emptyProjectionSummary(),
    reason: params.reason,
  }
}

async function materializeMossEngineProjectionFromSnapshot(params: {
  projectPath: string
  engineId: AgentEngineId
  snapshot: { projections: EngineResourceProjection[] }
  dryRun?: boolean
}): Promise<MaterializedMossEngineProjection> {
  const projection = params.snapshot.projections.find(
    (item) => item.engineId === params.engineId,
  )

  if (!projection) {
    return skippedProjectionResult({
      engineId: params.engineId,
      projectPath: params.projectPath,
      reason: `No projection is registered for ${params.engineId}.`,
    })
  }

  const results = await materializeMossProjection({
    projectPath: params.projectPath,
    projection,
    dryRun: params.dryRun,
  })

  return {
    engineId: params.engineId,
    projectPath: params.projectPath,
    projectionStatus: projection.status,
    warnings: projection.warnings,
    results,
    summary: summarizeProjectionResults(results),
  }
}

function buildProjectionSnapshot(
  projectPath: string,
  resources: SharedResource[],
) {
  return buildGovernedResourceProjection({
    projectPath,
    resources,
  })
}

export async function materializeMossEngineProjection(
  options: MaterializeMossEngineProjectionOptions,
): Promise<MaterializedMossEngineProjection> {
  if (options.createIfMissing) {
    await ensureMossSource({ projectPath: options.projectPath })
  }

  const resources = await discoverMossSourceResourcesForProjection({
    projectPath: options.projectPath,
    expectedResourceIds: options.expectedResourceIds,
  })
  if (resources.length === 0) {
    return skippedProjectionResult({
      engineId: options.engineId,
      projectPath: options.projectPath,
      reason: "No .moss Unified Source was found for this project.",
    })
  }

  return materializeMossEngineProjectionFromSnapshot({
    engineId: options.engineId,
    projectPath: options.projectPath,
    snapshot: buildProjectionSnapshot(options.projectPath, resources),
    dryRun: options.dryRun,
  })
}

function failedProjectionResult(params: {
  projectPath: string
  engineId: AgentEngineId
  error: unknown
}): FailedMossEngineProjection {
  return {
    engineId: params.engineId,
    projectPath: params.projectPath,
    projectionStatus: "skipped",
    warnings: [],
    results: [],
    summary: {
      created: 0,
      updated: 0,
      skipped: 0,
      conflict: 0,
      unsupported: 0,
      total: 0,
    },
    reason: params.error instanceof Error ? params.error.message : String(params.error),
  }
}

export async function materializeMossEngineProjectionSafely(
  options: MaterializeMossEngineProjectionOptions,
): Promise<MossEngineProjectionResult> {
  try {
    return await materializeMossEngineProjection(options)
  } catch (error) {
    return failedProjectionResult({
      projectPath: options.projectPath,
      engineId: options.engineId,
      error,
    })
  }
}

export async function materializeMossWorkspaceProjections(
  options: MaterializeMossWorkspaceProjectionsOptions,
): Promise<MaterializedMossWorkspaceProjections> {
  if (options.createIfMissing) {
    await ensureMossSource({ projectPath: options.projectPath })
  }

  const engines = options.engines ?? AGENT_ENGINE_IDS
  const resources = await discoverMossSourceResourcesForProjection({
    projectPath: options.projectPath,
    expectedResourceIds: options.expectedResourceIds,
  })
  if (resources.length === 0) {
    return {
      projectPath: options.projectPath,
      dryRun: Boolean(options.dryRun),
      projections: engines.map((engineId) =>
        skippedProjectionResult({
          engineId,
          projectPath: options.projectPath,
          reason: "No .moss Unified Source was found for this project.",
        }),
      ),
    }
  }

  const snapshot = buildProjectionSnapshot(options.projectPath, resources)
  const projections: MossEngineProjectionResult[] = []
  for (const engineId of engines) {
    try {
      projections.push(
        await materializeMossEngineProjectionFromSnapshot({
          projectPath: options.projectPath,
          engineId,
          snapshot,
          dryRun: options.dryRun,
        }),
      )
    } catch (error) {
      projections.push(
        failedProjectionResult({
          projectPath: options.projectPath,
          engineId,
          error,
        }),
      )
    }
  }

  return {
    projectPath: options.projectPath,
    dryRun: Boolean(options.dryRun),
    projections,
  }
}

export async function linkMossSourceIntoWorkspace(
  options: LinkMossSourceIntoWorkspaceOptions,
): Promise<MossWorkspaceSourceLinkResult> {
  const sourceProjectPath = path.resolve(options.sourceProjectPath)
  const workspacePath = path.resolve(options.workspacePath)
  const sourceRoot = path.join(sourceProjectPath, ".moss")
  const targetRoot = path.join(workspacePath, ".moss")
  const result: MossWorkspaceSourceLinkResult = {
    sourceProjectPath,
    workspacePath,
    sourceRoot,
    targetRoot,
    status: "skipped",
    created: [],
    skipped: [],
    conflicts: [],
  }

  if (sourceProjectPath === workspacePath) {
    result.reason = "Workspace is the source project."
    return result
  }

  if (!(await fileExists(sourceRoot))) {
    result.reason = "No source .moss Unified Source was found."
    return result
  }

  const sourceRealpath = await safeRealpath(sourceRoot)
  const targetRealpath = await safeRealpath(targetRoot)
  if (sourceRealpath && targetRealpath && sourceRealpath === targetRealpath) {
    result.reason = "Workspace .moss already points at the source project."
    return result
  }

  try {
    const targetStat = await fs.lstat(targetRoot)
    if (!targetStat.isDirectory()) {
      result.status = "conflict"
      result.conflicts.push({
        path: targetRoot,
        reason: "Workspace .moss exists and is not a directory.",
      })
      return result
    }
  } catch {
    await fs.mkdir(targetRoot, { recursive: true })
  }

  if (await hasLocalMossSource(targetRoot, sourceRoot)) {
    result.reason = "Workspace already has a local .moss source."
    return result
  }

  for (const entry of MOSS_LINK_ENTRIES) {
    const sourcePath = path.join(sourceRoot, entry.source)
    const targetPath = path.join(targetRoot, entry.source)

    if (!(await fileExists(sourcePath))) {
      result.skipped.push(entry.source)
      continue
    }

    if (await linkPointsTo(targetPath, sourcePath)) {
      result.skipped.push(entry.source)
      continue
    }

    if (await fileExists(targetPath)) {
      result.conflicts.push({
        path: targetPath,
        reason: "Target exists and is not linked to the source .moss entry.",
      })
      continue
    }

    await fs.symlink(
      sourcePath,
      targetPath,
      entry.type === "dir" && process.platform === "win32" ? "junction" : undefined,
    )
    result.created.push(entry.source)
  }

  if (result.conflicts.length > 0) {
    result.status = "conflict"
    return result
  }

  if (result.created.length > 0) {
    result.status = "created"
    return result
  }

  result.reason = "Workspace .moss source links are already present."
  return result
}
