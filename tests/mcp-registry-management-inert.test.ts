import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const registryDir = join(process.cwd(), "src/main/lib/mcp-registry")
const registrySources = readdirSync(registryDir)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => ({
    file,
    source: readFileSync(join(registryDir, file), "utf8"),
  }))
const pluginsRouterSource = readFileSync(
  join(process.cwd(), "src/main/lib/trpc/routers/plugins.ts"),
  "utf8",
)
const pluginsTabSource = readFileSync(
  join(
    process.cwd(),
    "src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx",
  ),
  "utf8",
)
const mcpTabSource = readFileSync(
  join(
    process.cwd(),
    "src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx",
  ),
  "utf8",
)
const claudeRuntimeMcpSource = readFileSync(
  join(process.cwd(), "src/main/lib/runtime-mcp-config/claude.ts"),
  "utf8",
)

describe("MCP registry management-time inert boundary", () => {
  test("does not import process execution or route-local MCP helpers", () => {
    for (const { file, source } of registrySources) {
      expect(source, file).not.toMatch(/from ["']node:child_process["']/)
      expect(source, file).not.toMatch(/from ["']child_process["']/)
      expect(source, file).not.toContain("runCodexCliChecked")
      expect(source, file).not.toContain("addCodexMcpServer")
      expect(source, file).not.toContain("addClaudeMcpServer")
      expect(source, file).not.toContain("removeCodexMcpServer")
      expect(source, file).not.toContain("removeClaudeMcpServer")
      expect(source, file).not.toContain("startCodexMcpOAuth")
      expect(source, file).not.toContain("startClaudeMcpOAuth")
    }
  })

  test("does not call MCP tools or launch package managers during browse preview work", () => {
    for (const { file, source } of registrySources) {
      expect(source, file).not.toContain("fetchMcpTools")
      expect(source, file).not.toContain("fetchMcpToolsStdio")
      expect(source, file).not.toMatch(/\bspawn\s*\(/)
      expect(source, file).not.toMatch(/\bexecFile\s*\(/)
      expect(source, file).not.toMatch(/\bexec\s*\(/)
      expect(source, file).not.toMatch(/\bdocker\b/i)
      expect(source, file).not.toMatch(/\bnpm\s+(?:install|exec|run)\b/i)
      expect(source, file).not.toMatch(/\bnpx\b.*\b-y\b/i)
    }
  })

  test("keeps registry-sourced servers out of plugin execution surfaces", () => {
    for (const { file, source } of registrySources) {
      expect(source, file).not.toContain("_locusPluginMcp")
    }

    expect(pluginsRouterSource).not.toContain("_locusMcpRegistry")
    expect(pluginsRouterSource).not.toContain("mcpRegistry")
    expect(pluginsRouterSource).not.toContain("McpRegistry")
    expect(pluginsTabSource).not.toContain("_locusMcpRegistry")
    expect(pluginsTabSource).not.toContain("mcpRegistry")
    expect(pluginsTabSource).not.toContain("McpRegistry")
  })

  test("keeps plugin-sourced MCP controls owned by Plugins in the MCP tab", () => {
    const editableBlock = mcpTabSource.slice(
      mcpTabSource.indexOf("const isEditableServer"),
      mcpTabSource.indexOf("const getScopeFromServer"),
    )
    const toggleableBlock = mcpTabSource.slice(
      mcpTabSource.indexOf("const isToggleableServer"),
      mcpTabSource.indexOf("const selectedCodexLogoutFailure"),
    )

    expect(mcpTabSource).toContain(
      'groupName.toLowerCase().startsWith("plugin:")',
    )
    expect(editableBlock).toContain(
      'return !item.groupName.toLowerCase().includes("plugin")',
    )
    expect(toggleableBlock).toContain('item.provider === "claude-code"')
    expect(toggleableBlock).toContain(
      '!item.groupName.toLowerCase().includes("plugin")',
    )
  })

  test("keeps explicit registry check connect-list only without unclassified tool calls", () => {
    const checkBlock = claudeRuntimeMcpSource.slice(
      claudeRuntimeMcpSource.indexOf(
        "export async function checkClaudeMcpRegistryServer",
      ),
      claudeRuntimeMcpSource.indexOf(
        "export async function getPendingPluginMcpApprovals",
      ),
    )

    expect(checkBlock).toContain("fetchToolsForServer")
    expect(checkBlock).toContain('status: "ready-to-verify"')
    expect(checkBlock).not.toMatch(/\bcallTool\b/)
    expect(checkBlock).not.toMatch(/\btools\/call\b/)
    expect(checkBlock).not.toMatch(/\binvoke[A-Za-z]*Tool\b/)
    expect(checkBlock).not.toContain('status: "verified-local"')
  })
})
