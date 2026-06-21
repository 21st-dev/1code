import { AGENT_ENGINE_IDS, type AgentEngineId } from "../agent-runtime/types"
import * as fs from "fs/promises"
import * as path from "path"
import { buildGovernedResourceProjection } from "../shared-resources/governance"
import type { EngineResourceProjection } from "../shared-resources/types"
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
}

export interface MaterializeMossWorkspaceProjectionsOptions {
  projectPath: string
  engines?: readonly AgentEngineId[]
  dryRun?: boolean
  createIfMissing?: boolean
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

export async function materializeMossEngineProjection(
  options: MaterializeMossEngineProjectionOptions,
): Promise<MaterializedMossEngineProjection> {
  if (options.createIfMissing) {
    await ensureMossSource({ projectPath: options.projectPath })
  }

  const resources = await discoverMossSourceResources(options.projectPath)
  if (resources.length === 0) {
    return {
      engineId: options.engineId,
      projectPath: options.projectPath,
      projectionStatus: "skipped",
      warnings: [],
      results: [],
      summary: summarizeProjectionResults([]),
      reason: "No .moss Unified Source was found for this project.",
    }
  }

  const snapshot = buildGovernedResourceProjection({
    projectPath: options.projectPath,
    resources,
  })
  const projection = snapshot.projections.find(
    (item) => item.engineId === options.engineId,
  )

  if (!projection) {
    return {
      engineId: options.engineId,
      projectPath: options.projectPath,
      projectionStatus: "skipped",
      warnings: [],
      results: [],
      summary: summarizeProjectionResults([]),
      reason: `No projection is registered for ${options.engineId}.`,
    }
  }

  const results = await materializeMossProjection({
    projectPath: options.projectPath,
    projection,
    dryRun: options.dryRun,
  })

  return {
    engineId: options.engineId,
    projectPath: options.projectPath,
    projectionStatus: projection.status,
    warnings: projection.warnings,
    results,
    summary: summarizeProjectionResults(results),
  }
}

export async function materializeMossEngineProjectionSafely(
  options: MaterializeMossEngineProjectionOptions,
): Promise<MossEngineProjectionResult> {
  try {
    return await materializeMossEngineProjection(options)
  } catch (error) {
    return {
      engineId: options.engineId,
      projectPath: options.projectPath,
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
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function materializeMossWorkspaceProjections(
  options: MaterializeMossWorkspaceProjectionsOptions,
): Promise<MaterializedMossWorkspaceProjections> {
  if (options.createIfMissing) {
    await ensureMossSource({ projectPath: options.projectPath })
  }

  const engines = options.engines ?? AGENT_ENGINE_IDS
  const projections: MossEngineProjectionResult[] = []
  for (const engineId of engines) {
    projections.push(
      await materializeMossEngineProjectionSafely({
        projectPath: options.projectPath,
        engineId,
        dryRun: options.dryRun,
      }),
    )
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
