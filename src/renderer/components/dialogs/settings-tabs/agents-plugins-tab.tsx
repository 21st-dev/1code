import { useState, useEffect, useMemo } from "react"
import { ChevronRight, RefreshCw, Loader2, Check, Shield } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { PluginFilledIcon } from "../../ui/icons"
import { Switch } from "../../ui/switch"
import { Button } from "../../ui/button"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

interface PluginComponent {
  name: string
  description?: string
}

interface PluginWithComponents {
  name: string
  version: string
  path: string
  source: string
  isDisabled: boolean
  components: {
    commands: PluginComponent[]
    skills: PluginComponent[]
    agents: PluginComponent[]
    mcpServers: string[]
  }
}

export function AgentsPluginsTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [expandedPluginSource, setExpandedPluginSource] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const { data: plugins = [], isLoading, refetch } = trpc.plugins.list.useQuery()
  const { data: approvedServers = [] } = trpc.claudeSettings.getApprovedPluginMcpServers.useQuery()
  const clearCacheMutation = trpc.plugins.clearCache.useMutation()
  const setPluginDisabledMutation = trpc.claudeSettings.setPluginDisabled.useMutation()
  const approveServerMutation = trpc.claudeSettings.approvePluginMcpServer.useMutation()
  const revokeServerMutation = trpc.claudeSettings.revokePluginMcpServer.useMutation()
  const openInFinderMutation = trpc.external.openInFinder.useMutation()

  // Build a set of approved servers for quick lookup
  const approvedServersSet = useMemo(() => new Set(approvedServers), [approvedServers])

  const handleExpandPlugin = (pluginSource: string) => {
    setExpandedPluginSource(expandedPluginSource === pluginSource ? null : pluginSource)
  }

  const handleToggleEnabled = async (pluginSource: string, enabled: boolean) => {
    await setPluginDisabledMutation.mutateAsync({
      pluginSource,
      disabled: !enabled,
    })
    // Invalidate queries that depend on disabled plugins
    utils.plugins.list.invalidate()
    utils.skills.list.invalidate()
    utils.agents.list.invalidate()
    utils.commands.list.invalidate()
  }

  const handleRefresh = async () => {
    await clearCacheMutation.mutateAsync()
    refetch()
  }

  const handleOpenInFinder = (path: string) => {
    openInFinderMutation.mutate(path)
  }

  const handleApproveServer = async (pluginSource: string, serverName: string) => {
    const identifier = `${pluginSource}:${serverName}`
    await approveServerMutation.mutateAsync({ identifier })
    utils.claudeSettings.getApprovedPluginMcpServers.invalidate()
    utils.claude.getAllMcpConfig.invalidate()
  }

  const handleRevokeServer = async (pluginSource: string, serverName: string) => {
    const identifier = `${pluginSource}:${serverName}`
    await revokeServerMutation.mutateAsync({ identifier })
    utils.claudeSettings.getApprovedPluginMcpServers.invalidate()
    utils.claude.getAllMcpConfig.invalidate()
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
      {/* Header - hidden on narrow screens */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Plugins</h3>
            <button
              onClick={handleRefresh}
              disabled={clearCacheMutation.isPending}
              className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
              title="Refresh plugins"
            >
              {clearCacheMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="pb-4 border-b border-border space-y-3">
        <div>
          <h4 className="text-xs font-medium text-foreground mb-1.5">
            How Plugins Work
          </h4>
          <p className="text-xs text-muted-foreground">
            Plugins extend 1Code with additional commands, skills, agents, and MCP servers.
            Disable a plugin to hide its components from the UI.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-medium text-foreground mb-1.5">
            Installing Plugins
          </h4>
          <p className="text-xs text-muted-foreground">
            Install plugins using <code className="px-1 py-0.5 bg-muted rounded">claude /plugin install &lt;name&gt;</code>
          </p>
        </div>
      </div>

      {/* Plugins List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-background rounded-lg border border-border p-4 text-sm text-muted-foreground text-center">
            Loading plugins...
          </div>
        ) : plugins.length === 0 ? (
          <div className="bg-background rounded-lg border border-border p-6 text-center">
            <PluginFilledIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              No plugins installed
            </p>
            <p className="text-xs text-muted-foreground">
              Install plugins from <code className="px-1 py-0.5 bg-muted rounded">~/.claude/plugins/marketplaces/</code>
            </p>
          </div>
        ) : (
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {plugins.map((plugin) => (
                <PluginRow
                  key={plugin.source}
                  plugin={plugin}
                  isExpanded={expandedPluginSource === plugin.source}
                  onToggle={() => handleExpandPlugin(plugin.source)}
                  onToggleEnabled={(enabled) => handleToggleEnabled(plugin.source, enabled)}
                  onOpenInFinder={() => handleOpenInFinder(plugin.path)}
                  isToggling={setPluginDisabledMutation.isPending}
                  approvedServersSet={approvedServersSet}
                  onApproveServer={(serverName) => handleApproveServer(plugin.source, serverName)}
                  onRevokeServer={(serverName) => handleRevokeServer(plugin.source, serverName)}
                  isApprovingOrRevoking={approveServerMutation.isPending || revokeServerMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PluginRow({
  plugin,
  isExpanded,
  onToggle,
  onToggleEnabled,
  onOpenInFinder,
  isToggling,
  approvedServersSet,
  onApproveServer,
  onRevokeServer,
  isApprovingOrRevoking,
}: {
  plugin: PluginWithComponents
  isExpanded: boolean
  onToggle: () => void
  onToggleEnabled: (enabled: boolean) => void
  onOpenInFinder: () => void
  isToggling: boolean
  approvedServersSet: Set<string>
  onApproveServer: (serverName: string) => void
  onRevokeServer: (serverName: string) => void
  isApprovingOrRevoking: boolean
}) {
  const totalComponents =
    plugin.components.commands.length +
    plugin.components.skills.length +
    plugin.components.agents.length +
    plugin.components.mcpServers.length

  return (
    <div className={cn(plugin.isDisabled && "opacity-60")}>
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 text-left hover:bg-muted/30 transition-colors rounded -m-2 p-2"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
              isExpanded && "rotate-90",
            )}
          />
          <PluginFilledIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex flex-col space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {plugin.name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                v{plugin.version}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {plugin.components.commands.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                  {plugin.components.commands.length} cmd
                </span>
              )}
              {plugin.components.skills.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  {plugin.components.skills.length} skill{plugin.components.skills.length !== 1 ? "s" : ""}
                </span>
              )}
              {plugin.components.agents.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  {plugin.components.agents.length} agent{plugin.components.agents.length !== 1 ? "s" : ""}
                </span>
              )}
              {plugin.components.mcpServers.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/10 text-green-600 dark:text-green-400">
                  {plugin.components.mcpServers.length} MCP
                </span>
              )}
              {totalComponents === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  No components
                </span>
              )}
            </div>
          </div>
        </button>
        <Switch
          checked={!plugin.isDisabled}
          onCheckedChange={onToggleEnabled}
          disabled={isToggling}
          className="flex-shrink-0"
        />
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-border bg-muted/20">
              <div className="pt-3 space-y-3">
                {/* Path */}
                <div>
                  <span className="text-xs font-medium text-foreground">Path</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenInFinder()
                    }}
                    className="block text-xs text-muted-foreground font-mono mt-0.5 break-all text-left hover:text-foreground hover:underline transition-colors cursor-pointer"
                  >
                    {plugin.path}
                  </button>
                </div>

                {/* Source */}
                <div>
                  <span className="text-xs font-medium text-foreground">Source</span>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {plugin.source}
                  </p>
                </div>

                {/* Commands */}
                {plugin.components.commands.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-foreground">Commands</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {plugin.components.commands.map((cmd) => (
                        <span
                          key={cmd.name}
                          className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground"
                          title={cmd.description}
                        >
                          /{cmd.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {plugin.components.skills.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-foreground">Skills</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {plugin.components.skills.map((skill) => (
                        <span
                          key={skill.name}
                          className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          title={skill.description}
                        >
                          @{skill.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agents */}
                {plugin.components.agents.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-foreground">Agents</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {plugin.components.agents.map((agent) => (
                        <span
                          key={agent.name}
                          className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-purple-500/10 text-purple-600 dark:text-purple-400"
                          title={agent.description}
                        >
                          @{agent.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* MCP Servers */}
                {plugin.components.mcpServers.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-foreground">MCP Servers</span>
                    <div className="space-y-1.5 mt-1.5">
                      {plugin.components.mcpServers.map((server) => {
                        const identifier = `${plugin.source}:${server}`
                        const isApproved = approvedServersSet.has(identifier)
                        return (
                          <div
                            key={server}
                            className="flex items-center gap-2 p-2 rounded bg-background border border-border"
                          >
                            <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-green-500/10 text-green-600 dark:text-green-400">
                              {server}
                            </span>
                            <div className="flex-1" />
                            {isApproved ? (
                              <div className="flex items-center gap-1.5">
                                <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                                  <Check className="h-3 w-3" />
                                  Approved
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onRevokeServer(server)
                                  }}
                                  disabled={isApprovingOrRevoking || plugin.isDisabled}
                                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                                >
                                  Revoke
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                  <Shield className="h-3 w-3" />
                                  Pending
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onApproveServer(server)
                                  }}
                                  disabled={isApprovingOrRevoking || plugin.isDisabled}
                                  className="h-6 px-2 text-[10px]"
                                >
                                  Approve
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
