import * as path from "path"
import {
  MOSS_ROOT_DIR,
  MOSS_SOURCE_VERSION,
  type MossSourceLayout,
} from "./types"

export function getMossSourceLayout(projectPath: string): MossSourceLayout {
  const root = path.join(projectPath, MOSS_ROOT_DIR)

  return {
    version: MOSS_SOURCE_VERSION,
    projectPath,
    root,
    sourceInstruction: path.join(root, "source", "moss.md"),
    workspaceConfig: path.join(root, "source", "workspace.yaml"),
    memoryRoot: path.join(root, "memory"),
    skillsRoot: path.join(root, "skills"),
    mcpConfig: path.join(root, "mcp", "config.json"),
    pluginsRoot: path.join(root, "plugins"),
    hooksRoot: path.join(root, "hooks"),
    subagentsRoot: path.join(root, "subagents"),
    providersConfig: path.join(root, "providers.yaml"),
  }
}

export function toMossProjectPath(
  projectPath: string,
  filePath: string,
): string {
  if (!path.isAbsolute(filePath)) return filePath
  return path.relative(projectPath, filePath)
}

export function getMossBootstrapDirectories(
  layout: MossSourceLayout,
): string[] {
  return [
    path.dirname(layout.sourceInstruction),
    layout.memoryRoot,
    layout.skillsRoot,
    path.dirname(layout.mcpConfig),
    layout.pluginsRoot,
    layout.hooksRoot,
    layout.subagentsRoot,
  ]
}
