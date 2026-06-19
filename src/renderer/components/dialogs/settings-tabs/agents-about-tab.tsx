import { useAtom } from "jotai"
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Github,
  RefreshCw,
  RotateCcw,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { devToolsUnlockedAtom } from "../../../lib/atoms"
import { useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import { Progress } from "../../ui/progress"
import { Switch } from "../../ui/switch"

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

function formatDate(value?: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const DEVTOOLS_UNLOCK_CLICKS = 5

export function AgentsAboutTab() {
  const { t } = useI18n()
  const utils = trpc.useUtils()
  const isNarrowScreen = useIsNarrowScreen()
  const [devToolsUnlocked, setDevToolsUnlocked] = useAtom(devToolsUnlockedAtom)
  const versionClickCountRef = useRef(0)
  const versionClickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentQuery = trpc.appUpdates.getCurrent.useQuery(undefined, {
    refetchInterval: 3000,
  })

  useEffect(() => {
    return () => {
      if (versionClickTimeoutRef.current) {
        clearTimeout(versionClickTimeoutRef.current)
      }
    }
  }, [])
  const openExternalMutation = trpc.external.openExternal.useMutation({
    onError: (error) => toast.error(error.message),
  })
  const checkMutation = trpc.appUpdates.checkNow.useMutation({
    onSuccess: (data) => {
      void utils.appUpdates.getCurrent.invalidate()
      if (data.status === "update-available") {
        toast.success(t("settings.about.updateAvailableToast"))
      } else if (data.status === "up-to-date") {
        toast.success(t("settings.about.upToDateToast"))
      } else if (data.status === "disabled") {
        toast.info(t("settings.about.autoUpdateDisabledToast"))
      } else if (data.status === "error") {
        toast.error(data.error || t("settings.about.checkFailed"))
      } else {
        toast.info(t("settings.about.checkCompleteToast"))
      }
    },
    onError: (error) => toast.error(error.message),
  })
  const downloadMutation = trpc.appUpdates.download.useMutation({
    onSuccess: (data) => {
      void utils.appUpdates.getCurrent.invalidate()
      if (data.status === "error") {
        toast.error(data.error || t("settings.about.checkFailed"))
      } else if (data.status === "downloaded") {
        toast.success(t("settings.about.downloadCompleteToast"))
      } else {
        toast.success(t("settings.about.downloadStartedToast"))
      }
    },
    onError: (error) => toast.error(error.message),
  })
  const quitAndInstallMutation = trpc.appUpdates.quitAndInstall.useMutation({
    onError: (error) => toast.error(error.message),
  })
  const setAutoCheckMutation = trpc.appUpdates.setAutoCheckEnabled.useMutation({
    onSuccess: () => {
      void utils.appUpdates.getCurrent.invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const data = currentQuery.data
  const state = data?.state
  const sourceRepo = data?.releasesRepo ?? "lupanpan1030/agent-code-for-me"
  const releaseDate = formatDate(state?.releaseDate ?? state?.checkedAt)
  const progressPercent = Math.round(state?.progress?.percent ?? 0)
  const isChecking = state?.status === "checking" || checkMutation.isPending
  const isDownloading =
    state?.status === "downloading" || downloadMutation.isPending
  const canCheck = Boolean(state?.supported) && !isChecking && !isDownloading
  const canDownload =
    state?.status === "update-available" && !downloadMutation.isPending
  const canRestart =
    state?.status === "downloaded" && !quitAndInstallMutation.isPending

  const handleOpenRelease = () => {
    const url = data?.latestPageUrl || data?.releasesPageUrl
    if (!url) return
    openExternalMutation.mutate(url)
  }

  const handleVersionClick = () => {
    if (devToolsUnlocked) return
    versionClickCountRef.current++
    if (versionClickTimeoutRef.current) {
      clearTimeout(versionClickTimeoutRef.current)
    }
    versionClickTimeoutRef.current = setTimeout(() => {
      versionClickCountRef.current = 0
    }, 2000)
    if (versionClickCountRef.current >= DEVTOOLS_UNLOCK_CLICKS) {
      setDevToolsUnlocked(true)
      versionClickCountRef.current = 0
      window.desktopApi?.unlockDevTools()
    }
  }

  const statusTitle = (() => {
    if (!state) return t("settings.about.updateIdle")
    if (state.status === "disabled") {
      if (state.disabledReason === "development") {
        return t("settings.about.autoUpdateDevelopment")
      }
      if (state.disabledReason === "portable") {
        return t("settings.about.autoUpdatePortable")
      }
      if (state.disabledReason === "unsupported-platform") {
        return t("settings.about.autoUpdateUnsupported")
      }
      return t("settings.about.autoUpdateDisabled")
    }
    if (state.status === "checking") return t("settings.about.checking")
    if (state.status === "up-to-date") return t("settings.about.upToDate")
    if (state.status === "update-available") {
      return t("settings.about.updateAvailable")
    }
    if (state.status === "downloading") {
      return t("settings.about.downloadingUpdate")
    }
    if (state.status === "downloaded") {
      return t("settings.about.updateReadyToInstall")
    }
    if (state.status === "error") return t("settings.about.checkFailed")
    return t("settings.about.updateIdle")
  })()

  const statusDetail = (() => {
    if (!state) return t("settings.about.updateIdleDescription")
    if (state.status === "disabled") {
      if (state.disabledReason === "disabled-by-user") {
        return t("settings.about.autoUpdateDisabledDescription")
      }
      return t("settings.about.autoUpdateUnsupportedDescription")
    }
    if (state.latestVersion) {
      return t("settings.about.versionSummary", {
        current: state.currentVersion,
        latest: state.latestVersion,
      })
    }
    return t("settings.about.currentVersionSummary", {
      current: state.currentVersion,
    })
  })()

  return (
    <div className="p-6 space-y-6">
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">
            {t("settings.about.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.about.subtitle")}
          </p>
        </div>
      )}

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-6 p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">Locus</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.about.description")}
            </span>
          </div>
          <button
            type="button"
            onClick={handleVersionClick}
            className="text-sm font-mono text-muted-foreground cursor-default"
          >
            v{data?.currentVersion ?? "..."}
          </button>
        </div>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                {t("settings.about.updates")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("settings.about.updatesDescription")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("settings.about.autoCheck")}
              </span>
              <Switch
                checked={state?.enabled ?? true}
                disabled={!state?.supported || setAutoCheckMutation.isPending}
                onCheckedChange={(enabled) =>
                  setAutoCheckMutation.mutate({ enabled })
                }
              />
            </div>
          </div>

          <div
            className={cn(
              "rounded-md border p-3",
              state?.status === "update-available" ||
                state?.status === "downloading" ||
                state?.status === "downloaded"
                ? "border-blue-500/30 bg-blue-500/10"
                : state?.status === "up-to-date"
                  ? "border-green-500/30 bg-green-500/10"
                  : state?.status === "error"
                    ? "border-destructive/30 bg-destructive/10"
                    : "border-border bg-muted/20",
            )}
          >
            <div className="flex items-start gap-3">
              {state?.status === "up-to-date" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle
                  className={cn(
                    "mt-0.5 h-4 w-4",
                    state?.status === "error"
                      ? "text-destructive"
                      : state?.status === "update-available" ||
                          state?.status === "downloading" ||
                          state?.status === "downloaded"
                        ? "text-blue-500"
                        : "text-muted-foreground",
                  )}
                />
              )}
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {statusTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {statusDetail}
                    {releaseDate ? ` · ${releaseDate}` : ""}
                  </p>
                </div>

                {state?.releaseName ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {state.releaseName}
                  </p>
                ) : null}

                {state?.status === "downloading" ? (
                  <div className="space-y-1.5">
                    <Progress value={progressPercent} />
                    <p className="text-xs text-muted-foreground">
                      {t("settings.about.downloadProgress", {
                        percent: progressPercent,
                        transferred: formatBytes(state.progress?.transferred),
                        total: formatBytes(state.progress?.total),
                      })}
                    </p>
                  </div>
                ) : null}

                {state?.error ? (
                  <p className="text-xs text-destructive">{state.error}</p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkMutation.mutate()}
                    disabled={!canCheck}
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4 mr-2",
                        isChecking && "animate-spin",
                      )}
                    />
                    {isChecking
                      ? t("settings.about.checking")
                      : t("settings.about.checkNow")}
                  </Button>

                  {canDownload ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => downloadMutation.mutate()}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t("settings.about.downloadUpdate")}
                    </Button>
                  ) : null}

                  {canRestart ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => quitAndInstallMutation.mutate()}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t("settings.about.restartToInstall")}
                    </Button>
                  ) : null}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenRelease}
                    disabled={openExternalMutation.isPending}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t("settings.about.openGitHubRelease")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-6 p-4">
          <div className="flex items-center gap-3">
            <Github className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                {t("settings.about.sourceCode")}
              </span>
              <span className="text-xs text-muted-foreground">
                {sourceRepo}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              openExternalMutation.mutate(`https://github.com/${sourceRepo}`)
            }
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {t("settings.about.openGitHub")}
          </Button>
        </div>
      </div>
    </div>
  )
}
