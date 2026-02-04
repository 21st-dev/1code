"use client"

import "./automations-styles.css"
import { useAtomValue, useSetAtom, useAtom } from "jotai"
import { selectedTeamIdAtom } from "../../lib/atoms"
import {
  automationDetailIdAtom,
  automationTemplateParamsAtom,
  agentsSidebarOpenAtom,
} from "../agents/atoms"
import { Logo } from "../../components/ui/logo"
import { useState, useMemo, useCallback } from "react"
import { Plus, AlignJustify } from "lucide-react"
import { useIsMobile } from "../../lib/hooks/use-mobile"
import { remoteTrpc } from "../../lib/remote-trpc"
import { useQuery } from "@tanstack/react-query"

import {
  AutomationCard,
  TemplateCard,
  TabToggle,
  AUTOMATION_TEMPLATES,
  type ViewTab,
  type Platform,
} from "./_components"

export function AutomationsView() {
  const teamId = useAtomValue(selectedTeamIdAtom)
  const setAutomationDetailId = useSetAtom(automationDetailIdAtom)
  const setTemplateParams = useSetAtom(automationTemplateParamsAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const isMobile = useIsMobile()

  const handleSidebarToggle = useCallback(() => {
    // Just open the main sidebar - drawer will handle the rest
    setSidebarOpen(true)
  }, [setSidebarOpen])

  const [activeTab, setActiveTab] = useState<ViewTab>("active")
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch automations via remoteTrpc
  const { data: automationsData, isLoading } = useQuery({
    queryKey: ["automations", "list", teamId],
    queryFn: () => remoteTrpc.automations.listAutomations.query({ teamId: teamId! }),
    enabled: !!teamId,
  })

  // Fetch GitHub connection status
  const { data: githubStatus } = useQuery({
    queryKey: ["github", "connectionStatus", teamId],
    queryFn: () => remoteTrpc.github.getConnectionStatus.query({ teamId: teamId! }),
    enabled: !!teamId,
  })

  // Fetch Linear integration status
  const { data: linearStatus } = useQuery({
    queryKey: ["linear", "integration", teamId],
    queryFn: () => remoteTrpc.linear.getIntegration.query({ teamId: teamId! }),
    enabled: !!teamId,
  })

  const automations = automationsData ?? []

  // Filter automations by search query
  const filteredAutomations = useMemo(() => {
    if (!searchQuery.trim()) return automations
    const query = searchQuery.toLowerCase()
    return automations.filter((a: any) =>
      a.name?.toLowerCase().includes(query)
    )
  }, [automations, searchQuery])

  const handleNewAutomation = () => {
    setAutomationDetailId("new")
    setTemplateParams(null)
    // Navigation handled by drawer system
  }

  const handleUseTemplate = (template: typeof AUTOMATION_TEMPLATES[number]) => {
    setAutomationDetailId("new")
    setTemplateParams({
      name: template.name,
      platform: template.platform,
      trigger: template.triggerType,
      instructions: template.instructions,
    })
    // Navigation handled by drawer system
  }

  const handleAutomationClick = (automationId: string) => {
    setAutomationDetailId(automationId)
    setTemplateParams(null)
    // Navigation handled by drawer system
  }

  const isGithubConnected = githubStatus?.isConnected ?? false
  const isLinearConnected = linearStatus?.isConnected ?? false

  const getTemplateDisabledReason = (platform: Platform): string | undefined => {
    if (platform === "github" && !isGithubConnected) {
      return "Connect GitHub in Settings to use this template"
    }
    if (platform === "linear" && !isLinearConnected) {
      return "Connect Linear in Settings to use this template"
    }
    return undefined
  }

  // Loading state
  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Logo className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" data-automations-page>
      <div className="flex-1 overflow-y-auto px-4 md:px-2 py-4">
        <div className={isMobile ? "max-w-full" : "max-w-2xl mx-auto"}>
          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 flex items-center gap-2">
              {(!sidebarOpen || isMobile) && (
                <button
                  onClick={handleSidebarToggle}
                  className="h-7 w-7 p-0 flex items-center justify-center hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                  aria-label={isMobile ? "Back to chats" : "Open sidebar"}
                >
                  <AlignJustify className="h-4 w-4" />
                </button>
              )}
              <div>
                <h1 className="text-lg font-semibold text-foreground">Automations</h1>
                <p className="text-sm text-muted-foreground hidden min-420:block">
                  Background automations for your repositories
                </p>
              </div>
            </div>
            <button
              onClick={handleNewAutomation}
              className="h-8 px-3 rounded-lg text-sm font-medium border border-border hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex items-center gap-1.5 flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium hidden min-420:inline">New</span>
            </button>
          </div>

          {/* Tabs and Search */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <TabToggle value={activeTab} onChange={setActiveTab} />

            {activeTab !== "templates" && (
              <input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-[160px] h-8 rounded-lg text-sm bg-muted border-0 px-3 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 min-420:grid-cols-2 md:grid-cols-3 gap-2 mt-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-background border border-border rounded-[10px] p-4 animate-pulse"
                >
                  {/* Icons row skeleton */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-7 h-7 rounded-md bg-muted/50" />
                    <div className="h-4 w-4 bg-muted/30 mx-1 rounded" />
                    <div className="w-7 h-7 rounded-md bg-muted/50" />
                  </div>
                  {/* Text skeleton */}
                  <div className="flex flex-col gap-2">
                    <div className="h-4 bg-muted/50 rounded w-2/3" />
                    <div className="h-3 bg-muted/30 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Template Library View */}
              {activeTab === "templates" && (
                <div className="grid grid-cols-1 min-420:grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                  {AUTOMATION_TEMPLATES.map((template) => {
                    const disabledReason = getTemplateDisabledReason(template.platform)
                    return (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onUseTemplate={() => handleUseTemplate(template)}
                        disabled={!!disabledReason}
                        disabledReason={disabledReason}
                      />
                    )
                  })}
                </div>
              )}

              {/* Active Automations View */}
              {activeTab !== "templates" && (
                <>
                  {filteredAutomations.length > 0 ? (
                    <div className="grid grid-cols-1 min-420:grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                      {filteredAutomations.map((automation: any) => (
                        <AutomationCard
                          key={automation.id}
                          automation={automation}
                          onClick={() => handleAutomationClick(automation.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {searchQuery ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <p className="text-sm">No automations match your search.</p>
                        </div>
                      ) : (
                        <>
                          <div className="text-center py-8 text-muted-foreground">
                            <p className="text-sm">
                              No automations yet. Get started with a template below.
                            </p>
                          </div>

                          {/* Templates section */}
                          <div className="mt-2">
                            <h3 className="text-xs font-medium text-muted-foreground mb-3">
                              Templates
                            </h3>
                            <div className="grid grid-cols-1 min-420:grid-cols-2 md:grid-cols-3 gap-2">
                              {AUTOMATION_TEMPLATES.map((template) => {
                                const disabledReason = getTemplateDisabledReason(template.platform)
                                return (
                                  <TemplateCard
                                    key={template.id}
                                    template={template}
                                    onUseTemplate={() => handleUseTemplate(template)}
                                    disabled={!!disabledReason}
                                    disabledReason={disabledReason}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
