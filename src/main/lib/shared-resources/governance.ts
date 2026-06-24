import * as path from "path"
import { AGENT_RUNTIME_MANIFESTS } from "../agent-runtime/manifests"
import type { AgentEngineId } from "../agent-runtime/types"
import type {
  EngineResourceProjection,
  ResourcePathMapping,
  SharedResource,
  SharedResourceApproval,
  SharedResourceConflict,
  SharedResourceKind,
  SharedResourceSnapshot,
} from "./types"

const GOVERNED_RESOURCE_KINDS = new Set<SharedResourceKind>([
  "agent",
  "subagent",
  "skill",
  "command",
  "mcp",
  "memory",
  "instruction",
  "hook",
  "provider",
  "config",
  "automation",
  "connector",
  "app",
  "tool",
])

const SCOPE_PRECEDENCE: Record<SharedResource["scope"], number> = {
  moss: 0,
  project: 10,
  user: 20,
  engine: 30,
  plugin: 40,
}

function normalizeResourceName(name: string): string {
  return name.trim().toLowerCase()
}

function buildConflictKey(resource: SharedResource): string | undefined {
  if (!GOVERNED_RESOURCE_KINDS.has(resource.kind)) return undefined

  const engineKey = ["mcp", "memory", "config", "automation", "connector", "app", "tool"].includes(resource.kind)
    ? resource.engine ?? "shared"
    : "shared"
  return `${resource.kind}:${engineKey}:${normalizeResourceName(resource.name)}`
}

function getPrecedenceRank(resource: SharedResource): number {
  const scopeRank = SCOPE_PRECEDENCE[resource.scope] ?? 90
  const disabledPenalty = resource.enabled === false ? 100 : 0
  const approvalPenalty =
    resource.approval?.required && !resource.approval.approved ? 50 : 0
  return scopeRank + disabledPenalty + approvalPenalty
}

function getPrecedenceLabel(resource: SharedResource): string {
  if (resource.scope === "moss") return "Moss Unified Source is canonical"
  if (resource.scope === "project") return "project overrides user, engine, and plugin"
  if (resource.scope === "user") return "user overrides engine and plugin"
  if (resource.scope === "engine") return "engine-native config overrides plugin"
  return "plugin is lowest precedence and may require approval"
}

function getDiscoverySource(resource: SharedResource): string {
  if (resource.scope === "moss") return "Moss Unified Source"

  const codexResourceRole = resource.metadata?.codexResourceRole
  if (resource.engine === "codex" && codexResourceRole === "plugin-manifest") {
    return "Codex plugin manifest"
  }
  if (resource.engine === "codex" && codexResourceRole === "plugin-skill") {
    return "Codex plugin cache skill"
  }
  if (resource.engine === "codex" && codexResourceRole === "user-skill") {
    return "Codex skill directory"
  }
  if (resource.engine === "codex" && codexResourceRole === "config") {
    return "Codex config.toml"
  }
  if (resource.engine === "codex" && codexResourceRole === "browser-config") {
    return "Codex browser config.toml"
  }
  if (resource.engine === "codex" && codexResourceRole === "auth") {
    return "Codex auth state"
  }
  if (resource.engine === "codex" && codexResourceRole === "hooks") {
    return "Codex hooks.json"
  }
  if (resource.engine === "codex" && codexResourceRole === "automation") {
    return "Codex automation.toml"
  }
  if (resource.engine === "codex" && codexResourceRole === "connector") {
    return "Codex connector directory cache"
  }
  if (resource.engine === "codex" && codexResourceRole === "codex-apps-server") {
    return "Codex apps MCP server cache"
  }
  if (resource.engine === "codex" && codexResourceRole === "codex-app-tool") {
    return "Codex apps tool cache"
  }
  if (resource.engine === "codex" && codexResourceRole === "remote-plugin-app") {
    return "Codex remote plugin app catalog"
  }
  if (resource.engine === "codex" && codexResourceRole === "plugin-app") {
    return "Codex plugin app manifest"
  }
  if (resource.engine === "codex" && codexResourceRole === "plugin-mcp-server") {
    return "Codex plugin MCP manifest"
  }

  if (resource.kind === "mcp") {
    if (resource.scope === "plugin") return "plugin MCP manifest"
    if (resource.engine === "codex") return "Codex MCP config"
    if (resource.engine === "claude-code") return "Claude MCP config"
    return "MCP config"
  }

  if (resource.scope === "plugin") return "plugin component directory"
  if (resource.kind === "memory") return "memory file"
  if (resource.kind === "instruction") return "project instruction file"
  return `${resource.scope} ${resource.kind} directory`
}

function getMossEntryName(resource: SharedResource): string {
  const entryName = resource.metadata?.entryName
  if (typeof entryName === "string" && entryName.trim()) {
    return entryName
  }

  if (resource.path) return path.basename(resource.path)
  return resource.name
}

function getMossRole(resource: SharedResource): string | undefined {
  const role = resource.metadata?.mossRole
  return typeof role === "string" ? role : undefined
}

function getMossProjectionSourcePath(resource: SharedResource): string | undefined {
  const sourcePath = resource.path
  if (!sourcePath) return undefined

  if (
    resource.kind === "skill" &&
    path.basename(sourcePath) === "SKILL.md"
  ) {
    return path.dirname(sourcePath)
  }

  return sourcePath
}

function buildMossProjectionMapping(
  engineId: AgentEngineId,
  resource: SharedResource,
): ResourcePathMapping | null {
  const sourcePath = getMossProjectionSourcePath(resource)
  if (!sourcePath) return null

  const role = getMossRole(resource)
  const entryName = getMossEntryName(resource)

  if (engineId === "hermes") {
    return {
      resourceId: resource.id,
      action: "native",
      sourcePath,
      targetPath: sourcePath,
      reason: "Hermes/Moss consumes the .moss Unified Source natively.",
    }
  }

  if (engineId === "claude-code") {
    if (resource.kind === "instruction" && role === "source-instruction") {
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: "CLAUDE.md",
        reason: "Claude Code reads project instructions from CLAUDE.md.",
      }
    }
    if (resource.kind === "memory") {
      if (role === "memory-entry") {
        return {
          resourceId: resource.id,
          action: "native",
          sourcePath,
          targetPath: path.join(".claude", "memory", entryName),
          reason: "Claude Code sees this entry through the projected Moss memory root.",
        }
      }
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: ".claude/memory",
        reason: "Claude Code project memory is mapped to Moss memory.",
      }
    }
    if (resource.kind === "skill") {
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: path.join(".claude", "skills", entryName.replace(/\/SKILL\.md$/, "")),
        reason: "Claude Code skills can be projected from Moss skills.",
      }
    }
    if (resource.kind === "subagent") {
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: path.join(".claude", "agents", entryName),
        reason: "Claude Code subagents are projected from Moss subagents.",
      }
    }
    if (resource.kind === "mcp") {
      return {
        resourceId: resource.id,
        action: "managed-bridge",
        sourcePath,
        targetPath: ".mcp.json",
        reason: "Moss writes Claude-compatible MCP config from the canonical Moss MCP config.",
      }
    }
    if (resource.kind === "hook") {
      return {
        resourceId: resource.id,
        action: "adapter-inject",
        sourcePath,
        targetPath: ".claude/hooks",
        reason: "Moss adapts hook events to Claude-compatible hooks without duplicating user config.",
      }
    }
    if (resource.kind === "provider") {
      return {
        resourceId: resource.id,
        action: "managed-bridge",
        sourcePath,
        targetPath: ".claude/settings.local.json",
        reason: "Moss bridges provider credentials and routing into Claude Code native config.",
      }
    }
    if (resource.kind === "plugin") {
      return {
        resourceId: resource.id,
        action: "adapter-inject",
        sourcePath,
        targetPath: ".claude/plugins",
        reason: "Moss exposes installed plugins through a Claude-compatible adapter.",
      }
    }
  }

  if (engineId === "codex") {
    if (resource.kind === "instruction" && role === "source-instruction") {
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: "AGENTS.md",
        reason: "Codex reads project instructions from AGENTS.md.",
      }
    }
    if (resource.kind === "memory") {
      if (role === "memory-entry") {
        return {
          resourceId: resource.id,
          action: "native",
          sourcePath,
          targetPath: path.join(".codex", "memories", entryName),
          reason: "Codex sees this entry through the projected Moss memory root.",
        }
      }
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: ".codex/memories",
        reason: "Codex project memory is mapped to Moss memory.",
      }
    }
    if (resource.kind === "skill") {
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: path.join(".codex", "skills", entryName.replace(/\/SKILL\.md$/, "")),
        reason: "Codex skills are projected from Moss skills.",
      }
    }
    if (resource.kind === "subagent") {
      return {
        resourceId: resource.id,
        action: "symlink",
        sourcePath,
        targetPath: path.join(".codex", "agents", entryName),
        reason: "Codex subagents are projected from Moss subagents without a second real definition.",
      }
    }
    if (resource.kind === "mcp") {
      return {
        resourceId: resource.id,
        action: "managed-bridge",
        sourcePath,
        targetPath: ".codex/config.toml",
        reason: "Moss writes Codex MCP TOML from the canonical Moss MCP config.",
      }
    }
    if (resource.kind === "hook") {
      return {
        resourceId: resource.id,
        action: "adapter-inject",
        sourcePath,
        targetPath: ".codex/hooks",
        reason: "Moss adapts hook events to Codex-compatible hooks without duplicating user config.",
      }
    }
    if (resource.kind === "provider") {
      return {
        resourceId: resource.id,
        action: "managed-bridge",
        sourcePath,
        targetPath: ".codex/config.toml",
        reason: "Moss bridges provider credentials and routing into Codex native config.",
      }
    }
    if (resource.kind === "plugin") {
      return {
        resourceId: resource.id,
        action: "adapter-inject",
        sourcePath,
        targetPath: ".codex/plugins",
        reason: "Moss exposes installed plugins through a Codex-compatible adapter without duplicating user config.",
      }
    }
  }

  return {
    resourceId: resource.id,
    action: "prompt-inject",
    sourcePath,
    reason: "Moss source is injected as shared prompt/context for this engine.",
  }
}

function getApproval(resource: SharedResource): SharedResourceApproval {
  const metadataApproved = resource.metadata?.approved

  if (resource.kind === "mcp" && resource.scope === "plugin") {
    const approved = metadataApproved === true
    return {
      required: true,
      approved,
      reason: approved
        ? "Approved plugin MCP server."
        : "Plugin MCP server must be approved before projection.",
    }
  }

  if (resource.scope === "plugin" && resource.enabled === false) {
    return {
      required: false,
      approved: false,
      reason: "Plugin is installed but disabled.",
    }
  }

  return {
    required: false,
    approved: resource.enabled !== false,
  }
}

function applyResourceGovernance(resources: SharedResource[]): {
  resources: SharedResource[]
  conflicts: SharedResourceConflict[]
} {
  const governedResources = resources.map((resource) => {
    const approval = getApproval(resource)
    const withApproval: SharedResource = {
      ...resource,
      approval,
    }
    const precedenceRank = getPrecedenceRank(withApproval)
    const conflictKey = buildConflictKey(resource)

    return {
      ...withApproval,
      precedenceRank,
      conflictKey,
      provenance: {
        source: resource.scope,
        sourceId: resource.pluginSource ?? resource.engine ?? resource.scope,
        engine: resource.engine,
        displayPath: resource.path,
        discoveredBy: getDiscoverySource(resource),
        precedenceRank,
        precedenceLabel: getPrecedenceLabel(resource),
      },
    }
  })

  const groups = new Map<string, SharedResource[]>()
  for (const resource of governedResources) {
    if (!resource.conflictKey) continue
    const group = groups.get(resource.conflictKey) ?? []
    group.push(resource)
    groups.set(resource.conflictKey, group)
  }

  const conflicts: SharedResourceConflict[] = []
  const conflictByResourceId = new Map<string, SharedResourceConflict>()

  for (const [key, group] of groups) {
    if (group.length < 2) continue

    const ordered = [...group].sort((left, right) => {
      const rankDelta = (left.precedenceRank ?? 90) - (right.precedenceRank ?? 90)
      if (rankDelta !== 0) return rankDelta
      return left.id.localeCompare(right.id)
    })
    const winner = ordered[0]
    const conflict: SharedResourceConflict = {
      key,
      kind: winner.kind,
      name: winner.name,
      winnerResourceId: winner.id,
      resourceIds: ordered.map((resource) => resource.id),
      reason: `${winner.scope} resource wins by precedence.`,
      resolution: "winner-by-precedence",
    }
    conflicts.push(conflict)
    for (const resource of ordered) {
      conflictByResourceId.set(resource.id, conflict)
    }
  }

  return {
    resources: governedResources.map((resource) => ({
      ...resource,
      conflict: conflictByResourceId.get(resource.id),
    })),
    conflicts,
  }
}

function canProjectResource(
  resource: SharedResource,
  warnings: string[],
): boolean {
  if (resource.enabled === false) {
    return false
  }

  if (resource.approval?.required && !resource.approval.approved) {
    warnings.push(`${resource.name} is withheld because approval is pending.`)
    return false
  }

  if (
    resource.conflict &&
    resource.conflict.resolution === "winner-by-precedence" &&
    resource.conflict.winnerResourceId !== resource.id
  ) {
    warnings.push(`${resource.name} is shadowed by a higher precedence resource.`)
    return false
  }

  return true
}

function buildEngineProjection(
  engineId: AgentEngineId,
  projectPath: string | undefined,
  resources: SharedResource[],
): EngineResourceProjection {
  const manifest = AGENT_RUNTIME_MANIFESTS[engineId]
  const mappings: ResourcePathMapping[] = []
  const warnings: string[] = []

  for (const resource of resources) {
    if (!resource.path) continue
    if (!canProjectResource(resource, warnings)) continue

    if (resource.scope === "moss") {
      const mossMapping = buildMossProjectionMapping(engineId, resource)
      if (mossMapping) mappings.push(mossMapping)
      continue
    }

    if (engineId === "claude-code") {
      if (["agent", "subagent", "skill", "command", "plugin", "mcp", "memory", "instruction", "hook", "provider"].includes(resource.kind)) {
        mappings.push({
          resourceId: resource.id,
          action: "native",
          sourcePath: resource.path,
          targetPath: resource.path,
        })
      }
      continue
    }

    if (engineId === "codex") {
      if (
        resource.engine === "codex" &&
        ["skill", "plugin", "config", "provider", "hook", "automation", "connector", "app", "tool"].includes(resource.kind)
      ) {
        mappings.push({
          resourceId: resource.id,
          action: "native",
          sourcePath: resource.path,
          targetPath: resource.path,
        })
      } else if (resource.kind === "mcp" && resource.engine === "codex") {
        mappings.push({
          resourceId: resource.id,
          action: "native",
          sourcePath: resource.path,
          targetPath: resource.path,
        })
      } else if (["agent", "subagent", "skill", "command", "memory", "instruction", "hook", "provider"].includes(resource.kind)) {
        mappings.push({
          resourceId: resource.id,
          action: "prompt-inject",
          sourcePath: resource.path,
          reason: "Codex ACP does not consume Claude-native resource directories directly yet.",
        })
      }
      continue
    }

    mappings.push({
      resourceId: resource.id,
      action: "unsupported",
      sourcePath: resource.path,
      reason: "This engine does not have native resource projection implemented yet.",
    })
  }

  if (engineId === "hermes" && manifest.availability === "unsupported") {
    warnings.push("Hermes runtime is unavailable; Moss source remains canonical but cannot be launched natively.")
  }

  if (engineId === "codex") {
    warnings.push("Codex receives agents, skills, commands, and memory by prompt/context projection until native projection is implemented.")
  }

  return {
    engineId,
    status: manifest.availability === "unsupported" ? "unsupported" : warnings.length > 0 ? "partial" : "ready",
    userRoot: manifest.configRoots.user,
    projectRoot: projectPath ? path.join(projectPath, manifest.configRoots.project || "") : manifest.configRoots.project,
    mappings,
    warnings,
  }
}

export function buildGovernedResourceProjection(params: {
  resources: SharedResource[]
  projectPath?: string
}): Pick<SharedResourceSnapshot, "resources" | "conflicts" | "projections"> {
  const governed = applyResourceGovernance(params.resources)
  const projections = (Object.keys(AGENT_RUNTIME_MANIFESTS) as AgentEngineId[]).map((engineId) =>
    buildEngineProjection(engineId, params.projectPath, governed.resources),
  )

  return {
    resources: governed.resources,
    conflicts: governed.conflicts,
    projections,
  }
}
