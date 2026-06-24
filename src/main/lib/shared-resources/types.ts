import type { AgentEngineId } from "../agent-runtime"

export type SharedResourceKind =
  | "agent"
  | "subagent"
  | "skill"
  | "command"
  | "plugin"
  | "mcp"
  | "memory"
  | "instruction"
  | "hook"
  | "provider"
  | "config"
  | "automation"
  | "connector"
  | "app"
  | "tool"

export type SharedResourceScope = "moss" | "project" | "user" | "plugin" | "engine"

export interface SharedResourceProvenance {
  source: SharedResourceScope
  sourceId?: string
  engine?: AgentEngineId
  displayPath?: string
  discoveredBy: string
  precedenceRank: number
  precedenceLabel: string
}

export interface SharedResourceApproval {
  required: boolean
  approved: boolean
  reason?: string
}

export interface SharedResourceConflict {
  key: string
  kind: SharedResourceKind
  name: string
  winnerResourceId: string
  resourceIds: string[]
  reason: string
  resolution: "unique" | "winner-by-precedence" | "manual-review"
}

export interface SharedResource {
  id: string
  kind: SharedResourceKind
  name: string
  scope: SharedResourceScope
  path?: string
  engine?: AgentEngineId
  pluginSource?: string
  description?: string
  enabled?: boolean
  provenance?: SharedResourceProvenance
  approval?: SharedResourceApproval
  precedenceRank?: number
  conflictKey?: string
  conflict?: SharedResourceConflict
  metadata?: Record<string, unknown>
}

export interface ResourcePathMapping {
  resourceId: string
  action:
    | "native"
    | "symlink"
    | "copy"
    | "prompt-inject"
    | "adapter-inject"
    | "managed-bridge"
    | "unsupported"
  sourcePath?: string
  targetPath?: string
  reason?: string
}

export interface EngineResourceProjection {
  engineId: AgentEngineId
  status: "ready" | "partial" | "unsupported"
  userRoot?: string
  projectRoot?: string
  mappings: ResourcePathMapping[]
  warnings: string[]
}

export interface SharedResourceSnapshot {
  generatedAt: string
  projectPath?: string
  resources: SharedResource[]
  conflicts: SharedResourceConflict[]
  projections: EngineResourceProjection[]
}
