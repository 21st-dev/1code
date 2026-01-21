/**
 * Addons Tab Component
 *
 * Tab 6: Addons - Contains sub-tabs for MCP, Plugins, Skills, and Custom Agents.
 * Uses a top button bar for sub-tab navigation.
 *
 * #NP - Settings Tab Component
 */

import { useAtom } from "jotai"
import { cn } from "@/lib/utils"
import { addonsActiveSubTabAtom, type AddonsSubTab } from "@/lib/atoms"
import { Server, Puzzle, Sparkles, Bot } from "lucide-react"
import { AgentsMcpTab } from "./agents-mcp-tab"
import { AgentsSkillsTab } from "./agents-skills-tab"
import { AgentsCustomAgentsTab } from "./agents-custom-agents-tab"

// Sub-tab definitions
const SUB_TABS: {
  id: AddonsSubTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}[] = [
  {
    id: "mcp",
    label: "MCP",
    icon: Server,
    description: "Model Context Protocol servers",
  },
  {
    id: "plugins",
    label: "Plugins",
    icon: Puzzle,
    description: "Plugin management",
  },
  {
    id: "skills",
    label: "Skills",
    icon: Sparkles,
    description: "Custom Claude skills",
  },
  {
    id: "customAgents",
    label: "Agents",
    icon: Bot,
    description: "Custom agent definitions",
  },
]

// Sub-tab button component
function SubTabButton({
  tab,
  isActive,
  onClick,
}: {
  tab: (typeof SUB_TABS)[number]
  isActive: boolean
  onClick: () => void
}) {
  const Icon = tab.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{tab.label}</span>
    </button>
  )
}

// Plugins placeholder (will be implemented later)
function PluginsSubTab() {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="p-6 text-center">
          <Puzzle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Plugins</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Plugin management coming soon. This will allow you to install,
            configure, and manage extensions that add new capabilities to your
            AI assistant.
          </p>
        </div>
      </div>
    </div>
  )
}

export function AgentsAddonsTab() {
  const [activeSubTab, setActiveSubTab] = useAtom(addonsActiveSubTabAtom)

  const renderSubTabContent = () => {
    switch (activeSubTab) {
      case "mcp":
        return <AgentsMcpTab />
      case "plugins":
        return <PluginsSubTab />
      case "skills":
        return <AgentsSkillsTab />
      case "customAgents":
        return <AgentsCustomAgentsTab />
      default:
        return <AgentsMcpTab />
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab Navigation Bar */}
      <div className="flex-none border-b border-border bg-muted/30">
        <div className="flex items-center gap-1 px-4 py-3">
          {SUB_TABS.map((tab) => (
            <SubTabButton
              key={tab.id}
              tab={tab}
              isActive={activeSubTab === tab.id}
              onClick={() => setActiveSubTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Sub-tab Content */}
      <div className="flex-1 overflow-y-auto">{renderSubTabContent()}</div>
    </div>
  )
}

export default AgentsAddonsTab
