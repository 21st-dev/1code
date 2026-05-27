import { useState, useEffect } from "react"
import { useAtom } from "jotai"
import { Button } from "../../ui/button"
import { Switch } from "../../ui/switch"
import { trpc } from "../../../lib/trpc"
import { useI18n } from "../../../lib/i18n"
import { toast } from "sonner"
import { Copy, FolderOpen, RefreshCw, Terminal, Check, Scan, WifiOff, FileJson } from "lucide-react"
import { showMessageJsonAtom } from "../../../features/agents/atoms"

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

// React Scan state management (only available in dev mode)
const REACT_SCAN_SCRIPT_ID = "react-scan-script"
const REACT_SCAN_STORAGE_KEY = "react-scan-enabled"

function loadReactScan(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(REACT_SCAN_SCRIPT_ID)) {
      resolve()
      return
    }

    const script = document.createElement("script")
    script.id = REACT_SCAN_SCRIPT_ID
    script.src = "https://unpkg.com/react-scan/dist/auto.global.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load React Scan"))
    document.head.appendChild(script)
  })
}

function unloadReactScan(): void {
  const script = document.getElementById(REACT_SCAN_SCRIPT_ID)
  if (script) {
    script.remove()
  }
  // React Scan adds a toolbar element, try to remove it
  const toolbar = document.querySelector("[data-react-scan]")
  if (toolbar) {
    toolbar.remove()
  }
}

export function AgentsDebugTab() {
  const { t } = useI18n()
  const [copiedPath, setCopiedPath] = useState(false)
  const [copiedInfo, setCopiedInfo] = useState(false)
  const [reactScanEnabled, setReactScanEnabled] = useState(false)
  const [reactScanLoading, setReactScanLoading] = useState(false)
  const [showMessageJson, setShowMessageJson] = useAtom(showMessageJsonAtom)
  const isNarrowScreen = useIsNarrowScreen()

  // Check if we're in dev mode (only show React Scan in dev)
  const isDev = import.meta.env.DEV

  // Fetch system info
  const { data: systemInfo, isLoading: isLoadingSystem } =
    trpc.debug.getSystemInfo.useQuery()

  // Offline simulation state
  const { data: offlineSimulation, refetch: refetchOfflineSimulation } =
    trpc.debug.getOfflineSimulation.useQuery()
  const setOfflineSimulationMutation = trpc.debug.setOfflineSimulation.useMutation({
    onSuccess: (data) => {
      refetchOfflineSimulation()
      toast.success(data.enabled ? t("settings.debug.toast.offlineEnabled") : t("settings.debug.toast.offlineDisabled"), {
        description: data.enabled
          ? t("settings.debug.toast.offlineEnabledDescription")
          : t("settings.debug.toast.offlineDisabledDescription")
      })
    },
    onError: (error) => toast.error(error.message),
  })


  // Fetch DB stats
  const { data: dbStats, isLoading: isLoadingDb, refetch: refetchDb } =
    trpc.debug.getDbStats.useQuery()

  // Mutations
  const clearChatsMutation = trpc.debug.clearChats.useMutation({
    onSuccess: () => {
      toast.success(t("settings.debug.toast.allChatsCleared"))
      refetchDb()
    },
    onError: (error) => toast.error(error.message),
  })

  const clearAllDataMutation = trpc.debug.clearAllData.useMutation({
    onSuccess: () => {
      toast.success(t("settings.debug.toast.allDataCleared"))
      setTimeout(() => window.location.reload(), 500)
    },
    onError: (error) => toast.error(error.message),
  })

  const logoutMutation = trpc.debug.logout.useMutation({
    onSuccess: () => {
      toast.success(t("settings.debug.toast.loggedOut"))
      setTimeout(() => window.location.reload(), 500)
    },
    onError: (error) => toast.error(error.message),
  })

  const openFolderMutation = trpc.debug.openUserDataFolder.useMutation({
    onError: (error) => toast.error(error.message),
  })

  const handleCopyPath = async () => {
    if (systemInfo?.userDataPath) {
      await navigator.clipboard.writeText(systemInfo.userDataPath)
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 2000)
    }
  }

  const handleCopyDebugInfo = async () => {
    const info = {
      ...systemInfo,
      dbStats,
      timestamp: new Date().toISOString(),
    }
    await navigator.clipboard.writeText(JSON.stringify(info, null, 2))
    setCopiedInfo(true)
    toast.success(t("settings.debug.toast.debugInfoCopied"))
    setTimeout(() => setCopiedInfo(false), 2000)
  }

  const handleOpenDevTools = () => {
    window.desktopApi?.toggleDevTools()
  }

  const handleReactScanToggle = async (enabled: boolean) => {
    if (!isDev) return

    setReactScanLoading(true)
    try {
      if (enabled) {
        await loadReactScan()
        localStorage.setItem(REACT_SCAN_STORAGE_KEY, "true")
        setReactScanEnabled(true)
        toast.success(t("settings.debug.toast.reactScanEnabled"), {
          description: t("settings.debug.toast.reactScanEnabledDescription"),
        })
      } else {
        unloadReactScan()
        localStorage.removeItem(REACT_SCAN_STORAGE_KEY)
        setReactScanEnabled(false)
        toast.success(t("settings.debug.toast.reactScanDisabled"), {
          description: t("settings.debug.toast.reactScanDisabledDescription"),
        })
      }
    } catch (error) {
      toast.error(t("settings.debug.toast.failedToToggleReactScan"))
      console.error(error)
    } finally {
      setReactScanLoading(false)
    }
  }

  // Initialize React Scan state from localStorage (dev only)
  useEffect(() => {
    if (isDev && localStorage.getItem(REACT_SCAN_STORAGE_KEY) === "true") {
      loadReactScan()
        .then(() => setReactScanEnabled(true))
        .catch(console.error)
    }
  }, [isDev])

  const isLoading = isLoadingSystem || isLoadingDb

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div>
          <h3 className="text-lg font-semibold mb-1">{t("settings.debug.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.debug.subtitle")}
          </p>
        </div>
      )}

      {/* System Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.debug.systemInfo")}
        </h4>
        <div className="rounded-lg border bg-muted/30 divide-y">
          <InfoRow label={t("settings.debug.version")} value={systemInfo?.version} isLoading={isLoading} />
          <InfoRow
            label={t("settings.debug.platform")}
            value={systemInfo ? `${systemInfo.platform} (${systemInfo.arch})` : undefined}
            isLoading={isLoading}
          />
          <InfoRow
            label={t("settings.debug.devMode")}
            value={systemInfo?.isDev ? t("settings.debug.yes") : t("settings.debug.no")}
            isLoading={isLoading}
          />
          <InfoRow
            label={t("settings.debug.protocol")}
            value={systemInfo?.protocolRegistered ? t("settings.debug.registered") : t("settings.debug.notRegistered")}
            isLoading={isLoading}
            status={systemInfo?.protocolRegistered ? "success" : "warning"}
          />
          <div className="flex items-center justify-between p-3">
            <span className="text-sm text-muted-foreground">userData</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono truncate max-w-[200px]">
                {isLoading ? "..." : systemInfo?.userDataPath}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyPath}
                disabled={!systemInfo?.userDataPath}
              >
                {copiedPath ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* DB Stats */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.debug.database")}
        </h4>
        <div className="rounded-lg border bg-muted/30 divide-y">
          <InfoRow label={t("settings.debug.projects")} value={dbStats?.projects?.toString()} isLoading={isLoading} />
          <InfoRow label={t("settings.debug.chats")} value={dbStats?.chats?.toString()} isLoading={isLoading} />
          <InfoRow label={t("settings.debug.subChats")} value={dbStats?.subChats?.toString()} isLoading={isLoading} />
        </div>
      </div>

      {/* Developer Tools (dev mode only) */}
      {isDev && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t("settings.debug.developerTools")}
          </h4>
          <div className="rounded-lg border bg-muted/30 divide-y">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <Scan className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm">React Scan</span>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.debug.reactScanDescription")}
                  </p>
                </div>
              </div>
              <Switch
                checked={reactScanEnabled}
                onCheckedChange={handleReactScanToggle}
                disabled={reactScanLoading}
              />
            </div>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm">{t("settings.debug.simulateOffline")}</span>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.debug.simulateOfflineDescription")}
                  </p>
                </div>
              </div>
              <Switch
                checked={offlineSimulation?.enabled ?? false}
                onCheckedChange={(enabled) =>
                  setOfflineSimulationMutation.mutate({ enabled })
                }
                disabled={setOfflineSimulationMutation.isPending}
              />
            </div>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm">{t("settings.debug.showMessageJson")}</span>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.debug.showMessageJsonDescription")}
                  </p>
                </div>
              </div>
              <Switch
                checked={showMessageJson}
                onCheckedChange={setShowMessageJson}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.debug.quickActions")}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openFolderMutation.mutate()}
            disabled={openFolderMutation.isPending}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            {t("settings.debug.openUserData")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenDevTools}>
            <Terminal className="h-4 w-4 mr-2" />
            DevTools
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("settings.debug.reload")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyDebugInfo}
            disabled={isLoading}
          >
            {copiedInfo ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {t("settings.debug.copyInfo")}
          </Button>
        </div>
      </div>

      {/* Toast Testing */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.debug.toastTesting")}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.info(t("settings.debug.sampleCancelationSent"), {
                description: t("settings.debug.sampleSentTo"),
                action: {
                  label: t("settings.debug.sampleUndo"),
                  onClick: () => toast(t("settings.debug.sampleUndone")),
                },
              })
            }
          >
            {t("settings.debug.sampleInfoUndoButton")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(t("settings.debug.sampleSuccess"), { description: t("settings.debug.sampleOperationCompleted") })}
          >
            {t("settings.debug.sampleSuccessButton")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.error(t("settings.debug.sampleError"), { description: t("settings.debug.sampleSomethingWentWrong") })}
          >
            {t("settings.debug.sampleErrorButton")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast(t("settings.debug.sampleDefaultToast"), { description: t("settings.debug.sampleDescription") })}
          >
            {t("settings.debug.sampleDefaultButton")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const id = toast.loading(t("common.loading"), { description: t("settings.debug.samplePleaseWait") })
              setTimeout(() => toast.dismiss(id), 3000)
            }}
          >
            {t("settings.debug.sampleLoadingButton")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const id = toast.loading(t("settings.debug.sampleProcessing"))
              setTimeout(() => {
                toast.success(t("settings.debug.sampleDone"), { id })
              }, 2000)
            }}
          >
            {t("settings.debug.samplePromiseButton")}
          </Button>
        </div>
      </div>

      {/* Data Management */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.debug.dataManagement")}
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(t("settings.debug.confirmClearChats"))) {
                clearChatsMutation.mutate()
              }
            }}
            disabled={clearChatsMutation.isPending}
          >
            {clearChatsMutation.isPending ? "..." : t("settings.debug.clearChats")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(t("settings.debug.confirmLogout"))) {
                logoutMutation.mutate()
              }
            }}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? "..." : t("settings.debug.logout")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (
                confirm(
                  t("settings.debug.confirmResetAll"),
                )
              ) {
                clearAllDataMutation.mutate()
              }
            }}
            disabled={clearAllDataMutation.isPending}
          >
            {clearAllDataMutation.isPending ? "..." : t("settings.debug.resetAll")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Helper component for info rows
function InfoRow({
  label,
  value,
  isLoading,
  status,
}: {
  label: string
  value?: string
  isLoading?: boolean
  status?: "success" | "warning" | "error"
}) {
  return (
    <div className="flex items-center justify-between p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${
          status === "success"
            ? "text-green-500"
            : status === "warning"
              ? "text-yellow-500"
              : status === "error"
                ? "text-red-500"
                : ""
        }`}
      >
        {isLoading ? "..." : value ?? "-"}
      </span>
    </div>
  )
}
