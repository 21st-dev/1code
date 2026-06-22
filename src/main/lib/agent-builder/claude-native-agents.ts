import * as os from "node:os"
import * as path from "node:path"
import { getPluginComponentPaths } from "../plugins"
import { discoverAllowedClaudePluginRuntimeComponents } from "../plugins/runtime-gates"
import {
  type FileAgent,
  scanAgentsDirectory,
} from "../trpc/routers/agent-utils"
import { getEnabledPlugins } from "../trpc/routers/claude-settings"

export async function listClaudeNativeAgents(
  input: { cwd?: string } = {},
): Promise<FileAgent[]> {
  const userAgentsDir = path.join(os.homedir(), ".claude", "agents")
  const userAgentsPromise = scanAgentsDirectory(userAgentsDir, "user")

  let projectAgentsPromise = Promise.resolve<FileAgent[]>([])
  if (input.cwd) {
    const projectAgentsDir = path.join(input.cwd, ".claude", "agents")
    projectAgentsPromise = scanAgentsDirectory(
      projectAgentsDir,
      "project",
      input.cwd,
    )
  }

  const enabledPluginSources = await getEnabledPlugins()
  const allowedPluginComponents =
    await discoverAllowedClaudePluginRuntimeComponents(enabledPluginSources)
  const pluginAgentsPromises = allowedPluginComponents.map(
    async ({ plugin }) => {
      const paths = getPluginComponentPaths(plugin)
      try {
        const agents = await scanAgentsDirectory(paths.agents, "plugin")
        return agents.map((agent) => ({ ...agent, pluginName: plugin.source }))
      } catch {
        return []
      }
    },
  )

  const [userAgents, projectAgents, ...pluginAgentsArrays] = await Promise.all([
    userAgentsPromise,
    projectAgentsPromise,
    ...pluginAgentsPromises,
  ])
  const pluginAgents = pluginAgentsArrays.flat()

  return [...projectAgents, ...userAgents, ...pluginAgents]
}
