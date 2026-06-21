import * as fs from "fs/promises"
import * as path from "path"
import { getMossBootstrapDirectories, getMossSourceLayout } from "./layout"

export interface EnsureMossSourceOptions {
  projectPath: string
}

export interface EnsureMossSourceResult {
  projectPath: string
  root: string
  status: "created" | "updated" | "skipped" | "conflict"
  created: string[]
  skipped: string[]
  conflicts: Array<{ path: string; reason: string }>
  reason?: string
}

const DEFAULT_MOSS_INSTRUCTIONS = `# Moss

This workspace uses Moss Unified Source as the single source of truth for rules, memory, skills, MCP, plugins, hooks, subagents, and providers.

- Keep canonical configuration under .moss.
- Project Claude Code, Codex, Hermes, and custom ACP agent files from .moss instead of maintaining duplicate real data.
- Sessions may remain engine-native, but shared resources and provider routing belong to Moss.
`

const DEFAULT_WORKSPACE_CONFIG = `version: 1
name: Moss Workspace
source: moss-unified-source
`

const DEFAULT_PROVIDER_CONFIG = `version: 1
defaultProvider: moss
credentialPolicy:
  singleUserConfiguration: true
  allowCustomBaseUrl: true
  allowCustomApiKey: true
  shareAcrossEngines: true
providers:
  moss:
    label: Moss Managed
    mode: bundled-quota
    runtime: any
    engines:
      hermes:
        model: moss-default
      claude-code:
        model: opus
      codex:
        model: gpt-5.5/high
      custom-acp:
        model: custom-acp
  custom:
    label: Custom OpenAI-Compatible
    mode: custom-url-key
    runtime: any
    apiKeyEnv: MOSS_CUSTOM_API_KEY
    baseUrlEnv: MOSS_CUSTOM_BASE_URL
    engines:
      hermes:
        model: moss-custom
      claude-code:
        model: opus
      codex:
        model: gpt-5.5/high
        authMethod: openai-api-key
      custom-acp:
        model: custom-acp
`

const DEFAULT_MCP_CONFIG = `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`

const DEFAULT_STARTER_MEMORY = `---
name: moss-workspace
description: Canonical Moss workspace operating memory.
---

Moss owns one shared source for this workspace. Rules, memory, skills, MCP servers, plugins, hooks, subagents, and provider routing live under .moss and are projected into Claude Code, Codex, Hermes, and custom ACP agents as needed.

Do not maintain a second real copy in engine-native folders. If an engine needs a native path, use the Moss projection or adapter output.
`

const DEFAULT_STARTER_SKILL = `---
name: moss-workspace
description: Use the Moss unified workspace source and shared resource map.
---

# Moss Workspace

Use this skill when a task depends on workspace rules, shared memory, installed tools, hooks, or provider routing.

## Protocol

1. Treat .moss/source/moss.md as the canonical rules file.
2. Read .moss/source/workspace.yaml for workspace defaults.
3. Use .moss/memory, .moss/skills, .moss/mcp, .moss/plugins, .moss/hooks, .moss/subagents, and .moss/providers.yaml as the only real resource source.
4. If an engine needs a native path, use the Moss projection or adapter output instead of editing the native copy.
`

const DEFAULT_STARTER_HOOK = `---
name: session-start
description: Starter hook template projected from Moss Unified Source.
event: MossSessionStart
enabled: true
---

This hook is intentionally commandless. It proves that hooks are installed and projected from .moss without executing user code until the user adds an explicit command.
`

const DEFAULT_STARTER_PLUGIN = `---
name: moss-starter
description: Starter plugin manifest projected from Moss Unified Source.
enabled: true
---

Moss Starter is the built-in plugin entry that proves installed plugin metadata is owned once under .moss/plugins and exposed to each engine through projection or adapter manifests.
`

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function ensureDefaultFile(params: {
  filePath: string
  content: string
  created: string[]
  skipped: string[]
}) {
  if (await pathExists(params.filePath)) {
    params.skipped.push(params.filePath)
    return
  }

  await fs.mkdir(path.dirname(params.filePath), { recursive: true })
  await fs.writeFile(params.filePath, params.content, "utf-8")
  params.created.push(params.filePath)
}

export async function ensureMossSource(
  options: EnsureMossSourceOptions,
): Promise<EnsureMossSourceResult> {
  const projectPath = path.resolve(options.projectPath)
  const layout = getMossSourceLayout(projectPath)
  const result: EnsureMossSourceResult = {
    projectPath,
    root: layout.root,
    status: "skipped",
    created: [],
    skipped: [],
    conflicts: [],
  }

  try {
    const stat = await fs.lstat(layout.root)
    if (!stat.isDirectory()) {
      result.status = "conflict"
      result.conflicts.push({
        path: layout.root,
        reason: ".moss exists and is not a directory.",
      })
      return result
    }
  } catch {
    await fs.mkdir(layout.root, { recursive: true })
    result.created.push(layout.root)
  }

  for (const dirPath of getMossBootstrapDirectories(layout)) {
    if (await pathExists(dirPath)) {
      result.skipped.push(dirPath)
      continue
    }
    await fs.mkdir(dirPath, { recursive: true })
    result.created.push(dirPath)
  }

  await ensureDefaultFile({
    filePath: layout.sourceInstruction,
    content: DEFAULT_MOSS_INSTRUCTIONS,
    created: result.created,
    skipped: result.skipped,
  })
  await ensureDefaultFile({
    filePath: layout.workspaceConfig,
    content: DEFAULT_WORKSPACE_CONFIG,
    created: result.created,
    skipped: result.skipped,
  })
  await ensureDefaultFile({
    filePath: layout.providersConfig,
    content: DEFAULT_PROVIDER_CONFIG,
    created: result.created,
    skipped: result.skipped,
  })
  await ensureDefaultFile({
    filePath: layout.mcpConfig,
    content: DEFAULT_MCP_CONFIG,
    created: result.created,
    skipped: result.skipped,
  })
  await ensureDefaultFile({
    filePath: path.join(layout.memoryRoot, "moss-workspace.md"),
    content: DEFAULT_STARTER_MEMORY,
    created: result.created,
    skipped: result.skipped,
  })
  await ensureDefaultFile({
    filePath: path.join(layout.skillsRoot, "moss-workspace", "SKILL.md"),
    content: DEFAULT_STARTER_SKILL,
    created: result.created,
    skipped: result.skipped,
  })
  await ensureDefaultFile({
    filePath: path.join(layout.hooksRoot, "session-start.md"),
    content: DEFAULT_STARTER_HOOK,
    created: result.created,
    skipped: result.skipped,
  })
  await ensureDefaultFile({
    filePath: path.join(layout.pluginsRoot, "moss-starter.md"),
    content: DEFAULT_STARTER_PLUGIN,
    created: result.created,
    skipped: result.skipped,
  })

  if (result.created.length > 0) {
    result.status = result.skipped.length > 0 ? "updated" : "created"
    return result
  }

  result.reason = "Moss Unified Source already exists."
  return result
}
