import { useAtom } from "jotai"
import { Check, Copy, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  autoOfflineModeAtom,
  betaAutomationsEnabledAtom,
  betaKanbanEnabledAtom,
  betaUpdatesEnabledAtom,
  enableTasksAtom,
  historyEnabledAtom,
  selectedOllamaModelAtom,
  showOfflineModeFeaturesAtom,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { remoteTrpc } from "../../../lib/remote-trpc"
import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import { ExternalLinkIcon } from "../../ui/icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Switch } from "../../ui/switch"

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

const MINIMUM_OLLAMA_VERSION = "0.14.2"
const RECOMMENDED_MODEL = "qwen3-coder:30b"

export function AgentsBetaTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [historyEnabled, setHistoryEnabled] = useAtom(historyEnabledAtom)
  const [showOfflineFeatures, setShowOfflineFeatures] = useAtom(showOfflineModeFeaturesAtom)
  const [autoOffline, setAutoOffline] = useAtom(autoOfflineModeAtom)
  const [selectedOllamaModel, setSelectedOllamaModel] = useAtom(selectedOllamaModelAtom)
  const [kanbanEnabled, setKanbanEnabled] = useAtom(betaKanbanEnabledAtom)
  const [automationsEnabled, setAutomationsEnabled] = useAtom(betaAutomationsEnabledAtom)
  const [enableTasks, setEnableTasks] = useAtom(enableTasksAtom)
  const [betaUpdatesEnabled, setBetaUpdatesEnabled] = useAtom(betaUpdatesEnabledAtom)

  // Check subscription to gate automations behind paid plan
  const { data: subscription } = useQuery({
    queryKey: ["agents", "subscription"],
    queryFn: () => remoteTrpc.agents.getAgentsSubscription.query(),
  })
  const isPaidPlan = subscription?.type !== "free" && !!subscription?.type
  const isDev = process.env.NODE_ENV === "development"
  const canEnableAutomations = isPaidPlan || isDev
  const [copied, setCopied] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "not-available" | "error">("idle")
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)

  // Get current version on mount and sync update channel state
  useEffect(() => {
    window.desktopApi?.getVersion().then(setCurrentVersion)
    window.desktopApi?.getUpdateChannel().then((ch) => {
      setBetaUpdatesEnabled(ch === "beta")
    })
  }, [])

  // Check for updates with force flag to bypass cache
  const handleCheckForUpdates = async () => {
    // Check if we're in dev mode
    const isPackaged = await window.desktopApi?.isPackaged?.()
    if (!isPackaged) {
      setUpdateStatus("error")
      console.log("Update check skipped in dev mode")
      return
    }

    setUpdateStatus("checking")
    setUpdateVersion(null)
    try {
      const result = await window.desktopApi?.checkForUpdates(true)
      if (result) {
        setUpdateStatus("available")
        setUpdateVersion(result.version)
      } else {
        setUpdateStatus("not-available")
      }
    } catch (error) {
      console.error("Failed to check for updates:", error)
      setUpdateStatus("error")
    }
  }

  // Get Ollama status
  const { data: ollamaStatus } = trpc.ollama.getStatus.useQuery(undefined, {
    refetchInterval: showOfflineFeatures ? 30000 : false, // Only poll when feature is enabled
    enabled: showOfflineFeatures,
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(`ollama pull ${RECOMMENDED_MODEL}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Beta Features</h3>
          <p className="text-xs text-muted-foreground">
            Enable experimental features. These may be unstable or change without notice.
          </p>
        </div>
      )}

      {/* Beta Features Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        {/* Rollback Toggle */}
        <div className="flex items-center justify-between p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Rollback
            </span>
            <span className="text-xs text-muted-foreground">
              Allow rolling back to previous messages and restoring files.
            </span>
          </div>
          <Switch
            checked={historyEnabled}
            onCheckedChange={setHistoryEnabled}
          />
        </div>

        {/* Offline Mode Toggle */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Offline Mode
            </span>
            <span className="text-xs text-muted-foreground">
              Enable offline mode UI and Ollama integration.
            </span>
          </div>
          <Switch
            checked={showOfflineFeatures}
            onCheckedChange={setShowOfflineFeatures}
          />
        </div>

        {/* Kanban Board Toggle */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Kanban Board
            </span>
            <span className="text-xs text-muted-foreground">
              View workspaces as a Kanban board organized by status.
            </span>
          </div>
          <Switch
            checked={kanbanEnabled}
            onCheckedChange={setKanbanEnabled}
          />
        </div>

        {/* Automations & Inbox Toggle */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex flex-col space-y-1">
            <span className={cn("text-sm font-medium", canEnableAutomations ? "text-foreground" : "text-muted-foreground")}>
              Automations & Inbox
            </span>
            <span className="text-xs text-muted-foreground">
              {canEnableAutomations
                ? "Automate workflows with GitHub and Linear triggers, and manage inbox notifications."
                : "Requires a paid plan. Upgrade to enable automations and inbox."}
            </span>
          </div>
          <Switch
            checked={automationsEnabled && canEnableAutomations}
            onCheckedChange={(checked) => {
              if (canEnableAutomations) {
                setAutomationsEnabled(checked)
              }
            }}
            disabled={!canEnableAutomations}
          />
        </div>

        {/* Agent Tasks Toggle */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Agent Tasks
            </span>
            <span className="text-xs text-muted-foreground">
              Enable Task instead of legacy Todo system.
            </span>
          </div>
          <Switch
            checked={enableTasks}
            onCheckedChange={setEnableTasks}
          />
        </div>
      </div>

      {/* Offline Mode Settings - only show when feature is enabled */}
      {showOfflineFeatures && (
        <div className="space-y-2">
          <div className="pb-2">
            <h4 className="text-sm font-medium text-foreground">Offline Mode Settings</h4>
          </div>

          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="p-4 space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    Ollama Status
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {ollamaStatus?.ollama.available
                      ? `Running - ${ollamaStatus.ollama.models.length} model${ollamaStatus.ollama.models.length !== 1 ? 's' : ''} installed`
                      : 'Not running or not installed'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {ollamaStatus?.ollama.available ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-sm text-emerald-500">Available</span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground">Unavailable</span>
                    </>
                  )}
                </div>
              </div>

              {/* Model selector */}
              {ollamaStatus?.ollama.available && ollamaStatus.ollama.models.length > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      Model
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Select which model to use for offline mode
                    </p>
                  </div>
                  <Select
                    value={selectedOllamaModel || ollamaStatus.ollama.recommendedModel || ollamaStatus.ollama.models[0]}
                    onValueChange={(value) => setSelectedOllamaModel(value)}
                  >
                    <SelectTrigger className="w-auto shrink-0">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {ollamaStatus.ollama.models.map((model) => {
                        const isRecommended = model === ollamaStatus.ollama.recommendedModel
                        return (
                          <SelectItem key={model} value={model}>
                            <span className="truncate">
                              {model}
                              {isRecommended && (
                                <span className="text-muted-foreground ml-1 text-xs">(recommended)</span>
                              )}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Auto-fallback toggle */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    Auto Offline Mode
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Automatically use Ollama when internet is unavailable
                  </p>
                </div>
                <Switch
                  checked={autoOffline}
                  onCheckedChange={setAutoOffline}
                />
              </div>

              {/* Installation instructions - always show */}
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded space-y-2">
                <p className="font-medium">Setup Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>
                    Install Ollama {MINIMUM_OLLAMA_VERSION}+ from{" "}
                    <a
                      href="https://ollama.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline inline-flex items-center gap-0.5"
                    >
                      ollama.com
                      <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                  </li>
                  <li>
                    Pull the recommended model:{" "}
                    <code className="relative inline-flex items-center gap-1 bg-background pl-1.5 pr-0.5 py-0.5 rounded-md">
                      <span>ollama pull {RECOMMENDED_MODEL}</span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title={copied ? "Copied!" : "Copy command"}
                      >
                        <div className="relative w-3 h-3">
                          <Copy
                            className={cn(
                              "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out hover:text-foreground",
                              copied ? "opacity-0 scale-50" : "opacity-100 scale-100",
                            )}
                          />
                          <Check
                            className={cn(
                              "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                              copied ? "opacity-100 scale-100" : "opacity-0 scale-50",
                            )}
                          />
                        </div>
                      </button>
                    </code>
                  </li>
                  <li>Ollama will run automatically in the background</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Updates Section */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Updates</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Check for new versions manually (bypasses CDN cache)
          </p>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Early Access Toggle */}
          <div className="flex items-center justify-between p-4">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                Early Access
              </span>
              <span className="text-xs text-muted-foreground">
                Receive beta versions before they're released to everyone. Beta versions may be less stable.
              </span>
            </div>
            <Switch
              checked={betaUpdatesEnabled}
              onCheckedChange={(checked) => {
                setBetaUpdatesEnabled(checked)
                window.desktopApi?.setUpdateChannel(checked ? "beta" : "latest")
              }}
            />
          </div>

          {/* Version & Check */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  {currentVersion ? `Current: v${currentVersion}` : "Version"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {updateStatus === "checking" && "Checking for updates..."}
                  {updateStatus === "available" && `Update available: v${updateVersion}`}
                  {updateStatus === "not-available" && "You're on the latest version"}
                  {updateStatus === "error" && "Failed to check (dev mode?)"}
                  {updateStatus === "idle" && "Click to check for updates"}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckForUpdates}
                disabled={updateStatus === "checking"}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", updateStatus === "checking" && "animate-spin")} />
                {updateStatus === "checking" ? "Checking..." : "Check Now"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
