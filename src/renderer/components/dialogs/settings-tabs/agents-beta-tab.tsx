import { useAtom } from "jotai"
import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"
import {
  autoOfflineModeAtom,
  historyEnabledAtom,
  selectedOllamaModelAtom,
  showOfflineModeFeaturesAtom,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { useI18n } from "../../../lib/i18n"
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
  const { t } = useI18n()
  const isNarrowScreen = useIsNarrowScreen()
  const [historyEnabled, setHistoryEnabled] = useAtom(historyEnabledAtom)
  const [showOfflineFeatures, setShowOfflineFeatures] = useAtom(showOfflineModeFeaturesAtom)
  const [autoOffline, setAutoOffline] = useAtom(autoOfflineModeAtom)
  const [selectedOllamaModel, setSelectedOllamaModel] = useAtom(selectedOllamaModelAtom)
  const [copied, setCopied] = useState(false)

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
          <h3 className="text-sm font-semibold text-foreground">
            {t("settings.beta.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.beta.subtitle")}
          </p>
        </div>
      )}

      {/* Beta Features Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        {/* Rollback Toggle */}
        <div className="flex items-center justify-between p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              {t("settings.beta.rollback")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("settings.beta.rollbackDescription")}
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
              {t("settings.beta.offlineMode")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("settings.beta.offlineModeDescription")}
            </span>
          </div>
          <Switch
            checked={showOfflineFeatures}
            onCheckedChange={setShowOfflineFeatures}
          />
        </div>

      </div>

      {/* Offline Mode Settings - only show when feature is enabled */}
      {showOfflineFeatures && (
        <div className="space-y-2">
          <div className="pb-2">
            <h4 className="text-sm font-medium text-foreground">
              {t("settings.beta.offlineModeSettings")}
            </h4>
          </div>

          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="p-4 space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    {t("settings.beta.ollamaStatus")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {ollamaStatus?.ollama.available
                      ? t("settings.beta.ollamaRunning", {
                          count: ollamaStatus.ollama.models.length,
                        })
                      : t("settings.beta.ollamaNotRunning")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {ollamaStatus?.ollama.available ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-sm text-emerald-500">
                        {t("settings.beta.available")}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground">
                        {t("settings.beta.unavailable")}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Model selector */}
              {ollamaStatus?.ollama.available && ollamaStatus.ollama.models.length > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {t("settings.beta.model")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.beta.modelDescription")}
                    </p>
                  </div>
                  <Select
                    value={selectedOllamaModel || ollamaStatus.ollama.recommendedModel || ollamaStatus.ollama.models[0]}
                    onValueChange={(value) => setSelectedOllamaModel(value)}
                  >
                    <SelectTrigger className="w-auto shrink-0">
                      <SelectValue placeholder={t("settings.beta.selectModel")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ollamaStatus.ollama.models.map((model) => {
                        const isRecommended = model === ollamaStatus.ollama.recommendedModel
                        return (
                          <SelectItem key={model} value={model}>
                            <span className="truncate">
                              {model}
                              {isRecommended && (
                                <span className="text-muted-foreground ml-1 text-xs">
                                  {t("settings.beta.recommended")}
                                </span>
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
                    {t("settings.beta.autoOfflineMode")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.beta.autoOfflineModeDescription")}
                  </p>
                </div>
                <Switch
                  checked={autoOffline}
                  onCheckedChange={setAutoOffline}
                />
              </div>

              {/* Installation instructions - always show */}
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded space-y-2">
                <p className="font-medium">{t("settings.beta.setupInstructions")}</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>
                    {t("settings.beta.installOllamaPrefix", {
                      version: MINIMUM_OLLAMA_VERSION,
                    })}{" "}
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
                    {t("settings.beta.pullRecommendedModel")}{" "}
                    <code className="relative inline-flex items-center gap-1 bg-background pl-1.5 pr-0.5 py-0.5 rounded-md">
                      <span>ollama pull {RECOMMENDED_MODEL}</span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title={
                          copied
                            ? t("settings.beta.copied")
                            : t("settings.beta.copyCommand")
                        }
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
                  <li>{t("settings.beta.ollamaRunsAutomatically")}</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
