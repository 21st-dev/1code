import { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Github,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "../../ui/button"
import { trpc } from "../../../lib/trpc"
import { useI18n } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"

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

export function AgentsAboutTab() {
  const { t } = useI18n()
  const isNarrowScreen = useIsNarrowScreen()
  const currentQuery = trpc.appUpdates.getCurrent.useQuery()
  const checkMutation = trpc.appUpdates.check.useMutation()
  const openExternalMutation = trpc.external.openExternal.useMutation({
    onError: (error) => toast.error(error.message),
  })

  const result = checkMutation.data
  const publishedDate = formatDate(result?.publishedAt)
  const resultIsAvailable = result?.status === "update-available"
  const resultIsUpToDate = result?.status === "up-to-date"
  const resultIsNoRelease = result?.status === "no-release"
  const sourceRepo =
    currentQuery.data?.releasesRepo ?? "lupanpan1030/agent-code-for-me"

  const handleCheck = () => {
    checkMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.status === "update-available") {
          toast.success(t("settings.about.updateAvailableToast"))
        } else if (data.status === "up-to-date") {
          toast.success(t("settings.about.upToDateToast"))
        } else if (data.status === "no-release") {
          toast.info(t("settings.about.noReleaseToast"))
        } else {
          toast.info(t("settings.about.checkCompleteToast"))
        }
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const handleOpenRelease = () => {
    const url =
      result?.releasePageUrl ||
      currentQuery.data?.latestPageUrl ||
      currentQuery.data?.releasesPageUrl
    if (!url) return
    openExternalMutation.mutate(url)
  }

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
          <span className="text-sm font-mono text-muted-foreground">
            v{currentQuery.data?.currentVersion ?? "..."}
          </span>
        </div>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                {t("settings.about.manualUpdates")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("settings.about.manualUpdatesDescription")}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheck}
              disabled={checkMutation.isPending}
              className="shrink-0"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4 mr-2",
                  checkMutation.isPending && "animate-spin",
                )}
              />
              {checkMutation.isPending
                ? t("settings.about.checking")
                : t("settings.about.checkForUpdates")}
            </Button>
          </div>

          {result && (
            <div
              className={cn(
                "rounded-md border p-3",
                result.status === "update-available"
                  ? "border-blue-500/30 bg-blue-500/10"
                  : result.status === "up-to-date"
                    ? "border-green-500/30 bg-green-500/10"
                    : "border-yellow-500/30 bg-yellow-500/10",
              )}
            >
              <div className="flex items-start gap-3">
                {resultIsUpToDate ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle
                    className={cn(
                      "mt-0.5 h-4 w-4",
                      resultIsAvailable
                        ? "text-blue-500"
                        : "text-yellow-500",
                    )}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {resultIsAvailable
                        ? t("settings.about.updateAvailable")
                        : resultIsUpToDate
                          ? t("settings.about.upToDate")
                          : resultIsNoRelease
                            ? t("settings.about.noRelease")
                            : t("settings.about.versionComparisonUnknown")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.latestVersion
                        ? t("settings.about.versionSummary", {
                            current: result.currentVersion,
                            latest: result.latestVersion,
                          })
                        : t("settings.about.currentVersionSummary", {
                            current: result.currentVersion,
                          })}
                      {publishedDate ? ` · ${publishedDate}` : ""}
                    </p>
                  </div>
                  {result.releaseName ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {result.releaseName}
                    </p>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenRelease}
                    disabled={openExternalMutation.isPending}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {resultIsNoRelease
                      ? t("settings.about.openGitHubReleases")
                      : t("settings.about.openGitHubRelease")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {checkMutation.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm font-medium text-destructive">
                {t("settings.about.checkFailed")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {checkMutation.error.message}
              </p>
            </div>
          )}
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
