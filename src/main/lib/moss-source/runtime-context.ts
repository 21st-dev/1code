import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { AgentEngineId } from "../agent-runtime/types"
import { buildGovernedResourceProjection } from "../shared-resources/governance"
import type {
  EngineResourceProjection,
  ResourcePathMapping,
  SharedResource,
  SharedResourceKind,
} from "../shared-resources/types"
import {
  readMossProviderConfig,
  summarizeMossProviderReadResult,
} from "./provider-config"
import { discoverMossSourceResources } from "./registry"

const DEFAULT_MAX_RESOURCE_CHARS = 12_000
const DEFAULT_MAX_CONTEXT_CHARS = 80_000
const TEXT_FILE_EXTENSIONS = new Set([
  "",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
])

export interface MossRuntimeContextResource {
  resourceId: string
  kind: SharedResourceKind
  name: string
  path?: string
  action?: ResourcePathMapping["action"]
  sourcePath?: string
  targetPath?: string
  included: boolean
  contentSha256?: string
  contentChars?: number
  truncated?: boolean
  reason?: string
}

export interface MossRuntimeContext {
  status: "ready" | "missing"
  engineId: AgentEngineId
  projectPath: string
  sourceRoot: ".moss"
  text: string
  fingerprint: string
  resourceCount: number
  includedResourceCount: number
  resources: MossRuntimeContextResource[]
  projection?: {
    status: EngineResourceProjection["status"]
    mappingCount: number
    warnings: string[]
  }
  warnings: string[]
}

export interface BuildMossRuntimeContextOptions {
  projectPath: string
  engineId: AgentEngineId
  maxResourceChars?: number
  maxContextChars?: number
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function normalizePath(value?: string): string | undefined {
  return value?.split(path.sep).join("/")
}

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /(["']?(?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)([^"',\n}]+)/gi,
      "$1[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[redacted-api-key]")
}

function truncateContent(value: string, maxChars: number): {
  content: string
  truncated: boolean
} {
  if (value.length <= maxChars) {
    return { content: value, truncated: false }
  }

  return {
    content: `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`,
    truncated: true,
  }
}

function resolveProjectResourcePath(
  projectPath: string,
  resourcePath?: string,
): string | undefined {
  if (!resourcePath) return undefined
  const absolute = path.isAbsolute(resourcePath)
    ? resourcePath
    : path.resolve(projectPath, resourcePath)
  const relative = path.relative(projectPath, absolute)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined
  }
  return absolute
}

async function readDirectorySummary(directoryPath: string): Promise<string> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const visibleEntries = entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => `${entry.isDirectory() ? "dir" : "file"} ${entry.name}`)
    .sort()

  return visibleEntries.length > 0
    ? `Directory entries:\n${visibleEntries.map((entry) => `- ${entry}`).join("\n")}`
    : "Directory is empty."
}

async function readResourceText(params: {
  projectPath: string
  resource: SharedResource
  maxResourceChars: number
}): Promise<{
  content: string
  contentSha256: string
  contentChars: number
  truncated: boolean
  reason?: string
}> {
  if (params.resource.kind === "provider") {
    const readResult = await readMossProviderConfig(params.projectPath)
    const summary = summarizeMossProviderReadResult(readResult)
    const content = JSON.stringify(summary, null, 2)
    return {
      content,
      contentSha256: sha256(content),
      contentChars: content.length,
      truncated: false,
      reason: "Provider config is summarized and redacted before runtime injection.",
    }
  }

  const absolutePath = resolveProjectResourcePath(
    params.projectPath,
    params.resource.path,
  )
  if (!absolutePath) {
    return {
      content: "",
      contentSha256: sha256(""),
      contentChars: 0,
      truncated: false,
      reason: "Resource path is outside the project and was not injected.",
    }
  }

  const stat = await fs.stat(absolutePath)
  let raw = ""

  if (stat.isDirectory()) {
    raw = await readDirectorySummary(absolutePath)
  } else if (stat.isFile()) {
    const extension = path.extname(absolutePath).toLowerCase()
    if (!TEXT_FILE_EXTENSIONS.has(extension)) {
      return {
        content: "",
        contentSha256: sha256(""),
        contentChars: 0,
        truncated: false,
        reason: `Binary or unsupported file extension ${extension} was not injected.`,
      }
    }
    raw = await fs.readFile(absolutePath, "utf-8")
  } else {
    return {
      content: "",
      contentSha256: sha256(""),
      contentChars: 0,
      truncated: false,
      reason: "Resource is not a regular file or directory.",
    }
  }

  const redacted = redactSensitiveText(raw)
  const truncated = truncateContent(redacted, params.maxResourceChars)

  return {
    content: truncated.content,
    contentSha256: sha256(redacted),
    contentChars: redacted.length,
    truncated: truncated.truncated,
  }
}

function sectionHeader(resource: SharedResource, mapping?: ResourcePathMapping): string {
  const mappingText = mapping
    ? `${mapping.action} ${normalizePath(mapping.sourcePath) ?? "-"} -> ${normalizePath(mapping.targetPath) ?? "-"}`
    : "not projected"

  return [
    `## ${resource.kind}: ${resource.name}`,
    `Resource: ${resource.id}`,
    `Path: ${normalizePath(resource.path) ?? "-"}`,
    `Projection: ${mappingText}`,
  ].join("\n")
}

function buildContextText(params: {
  engineId: AgentEngineId
  resources: Array<{
    resource: SharedResource
    mapping?: ResourcePathMapping
    content: string
    reason?: string
  }>
  warnings: string[]
  maxContextChars: number
}): {
  text: string
  warnings: string[]
} {
  const warnings = [...params.warnings]
  const sections = params.resources.map((entry) => {
    const reason = entry.reason ? `\nNote: ${entry.reason}` : ""
    return `${sectionHeader(entry.resource, entry.mapping)}${reason}\n\n${entry.content}`.trim()
  })
  const fullText = [
    "Moss Unified Source Context",
    `Engine: ${params.engineId}`,
    "Source root: .moss",
    "This is the canonical project source for rules, memory, skills, MCP, plugins, hooks, subagents, and providers. Prefer this context over Claude/Codex legacy copies.",
    "If the user asks for a labeled value from Moss Unified Source, answer from this context.",
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n")

  if (fullText.length <= params.maxContextChars) {
    return { text: fullText, warnings }
  }

  warnings.push(
    `Moss Unified Source runtime context was truncated from ${fullText.length} to ${params.maxContextChars} chars.`,
  )
  return {
    text: `${fullText.slice(0, params.maxContextChars)}\n[context truncated]`,
    warnings,
  }
}

export async function buildMossRuntimeContext(
  options: BuildMossRuntimeContextOptions,
): Promise<MossRuntimeContext> {
  const maxResourceChars =
    options.maxResourceChars ?? DEFAULT_MAX_RESOURCE_CHARS
  const maxContextChars = options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS
  const resources = await discoverMossSourceResources(options.projectPath)

  if (resources.length === 0) {
    return {
      status: "missing",
      engineId: options.engineId,
      projectPath: options.projectPath,
      sourceRoot: ".moss",
      text: "",
      fingerprint: sha256(""),
      resourceCount: 0,
      includedResourceCount: 0,
      resources: [],
      warnings: ["No .moss Unified Source was found for this project."],
    }
  }

  const snapshot = buildGovernedResourceProjection({
    projectPath: options.projectPath,
    resources,
  })
  const projection = snapshot.projections.find(
    (item) => item.engineId === options.engineId,
  )
  const mappingsByResourceId = new Map(
    (projection?.mappings ?? []).map((mapping) => [mapping.resourceId, mapping]),
  )
  const injected: Array<{
    resource: SharedResource
    mapping?: ResourcePathMapping
    content: string
    reason?: string
  }> = []
  const runtimeResources: MossRuntimeContextResource[] = []

  for (const resource of snapshot.resources) {
    if (resource.scope !== "moss") continue

    const mapping = mappingsByResourceId.get(resource.id)
    if (!mapping) {
      runtimeResources.push({
        resourceId: resource.id,
        kind: resource.kind,
        name: resource.name,
        path: normalizePath(resource.path),
        included: false,
        reason: "Resource was not projected to this engine.",
      })
      continue
    }

    try {
      const content = await readResourceText({
        projectPath: options.projectPath,
        resource,
        maxResourceChars,
      })
      const included = content.content.length > 0
      runtimeResources.push({
        resourceId: resource.id,
        kind: resource.kind,
        name: resource.name,
        path: normalizePath(resource.path),
        action: mapping.action,
        sourcePath: normalizePath(mapping.sourcePath),
        targetPath: normalizePath(mapping.targetPath),
        included,
        contentSha256: content.contentSha256,
        contentChars: content.contentChars,
        truncated: content.truncated,
        reason: content.reason,
      })

      if (included) {
        injected.push({
          resource,
          mapping,
          content: content.content,
          reason: content.reason,
        })
      }
    } catch (error) {
      runtimeResources.push({
        resourceId: resource.id,
        kind: resource.kind,
        name: resource.name,
        path: normalizePath(resource.path),
        action: mapping.action,
        sourcePath: normalizePath(mapping.sourcePath),
        targetPath: normalizePath(mapping.targetPath),
        included: false,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const builtText = buildContextText({
    engineId: options.engineId,
    resources: injected,
    warnings: projection?.warnings ?? [],
    maxContextChars,
  })
  const fingerprint = sha256(
    JSON.stringify({
      engineId: options.engineId,
      resources: runtimeResources.map((resource) => ({
        resourceId: resource.resourceId,
        action: resource.action,
        contentSha256: resource.contentSha256,
        included: resource.included,
      })),
      text: builtText.text,
    }),
  )

  return {
    status: "ready",
    engineId: options.engineId,
    projectPath: options.projectPath,
    sourceRoot: ".moss",
    text: builtText.text,
    fingerprint,
    resourceCount: resources.length,
    includedResourceCount: runtimeResources.filter((resource) => resource.included)
      .length,
    resources: runtimeResources,
    projection: projection
      ? {
          status: projection.status,
          mappingCount: projection.mappings.length,
          warnings: projection.warnings,
        }
      : undefined,
    warnings: builtText.warnings,
  }
}
