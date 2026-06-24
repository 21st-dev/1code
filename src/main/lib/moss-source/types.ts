import type { AgentEngineId } from "../agent-runtime"

export const MOSS_SOURCE_VERSION = 1
export const MOSS_ROOT_DIR = ".moss"

export type MossSourceFileRole =
  | "source-instruction"
  | "workspace-config"
  | "memory-root"
  | "skill"
  | "mcp-config"
  | "plugin"
  | "hook"
  | "subagent"
  | "provider-config"

export interface MossSourceLayout {
  version: typeof MOSS_SOURCE_VERSION
  projectPath: string
  root: string
  sourceInstruction: string
  workspaceConfig: string
  memoryRoot: string
  skillsRoot: string
  mcpConfig: string
  pluginsRoot: string
  hooksRoot: string
  subagentsRoot: string
  providersConfig: string
}

export interface MossEnginePathTarget {
  engineId: AgentEngineId
  sourceRole: MossSourceFileRole
  sourcePath: string
  targetPath: string
  action: "native" | "symlink" | "adapter-inject" | "managed-bridge"
  reason: string
}
