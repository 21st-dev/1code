import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import {
  type ProviderDiagnosticCheckId,
  type ProviderDiagnosticStatus,
  type ProviderProfileDefaultPurpose,
  providerProfileSource,
} from "../../../../shared/provider-profile-types"
import {
  type ClaudeModelSource,
  type CodexModelSource,
  lastSelectedClaudeModelSourceAtom,
  lastSelectedCodexModelSourceAtom,
} from "../../../features/agents/atoms"
import {
  getProviderAuthModeLabel,
  getProviderTargetLabel,
  ProviderProfileEditor,
} from "../../../features/agents/components/provider-profile-editor"
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
} from "../../../features/agents/lib/models"
import {
  agentsLoginModalOpenAtom,
  autoOfflineModeAtom,
  claudeLoginModalConfigAtom,
  codexLoginModalOpenAtom,
  hiddenModelsAtom,
  modelsSettingsTargetAtom,
  normalizeCodexApiKey,
  OPENAI_TRANSCRIPTION_BASE_URL,
  OPENAI_TRANSCRIPTION_MODEL,
  selectedOllamaModelAtom,
  showOfflineModeFeaturesAtom,
} from "../../../lib/atoms"
import { useLocalOnlyMode } from "../../../lib/hooks/use-local-only-mode"
import { type TranslationKey, useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"
import {
  ClaudeCodeIcon,
  CodexIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
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

function LocalModelsSettingsSection() {
  const { t } = useI18n()
  const [showOfflineFeatures, setShowOfflineFeatures] = useAtom(
    showOfflineModeFeaturesAtom,
  )
  const [autoOffline, setAutoOffline] = useAtom(autoOfflineModeAtom)
  const [selectedOllamaModel, setSelectedOllamaModel] = useAtom(
    selectedOllamaModelAtom,
  )
  const [copied, setCopied] = useState(false)
  const { data: ollamaStatus } = trpc.ollama.getStatus.useQuery(undefined, {
    enabled: showOfflineFeatures,
    refetchInterval: showOfflineFeatures ? 30000 : false,
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(`ollama pull ${RECOMMENDED_MODEL}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <div className="pb-2">
        <h4 className="text-sm font-medium text-foreground">
          {t("settings.models.localModels.title")}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t("settings.models.localModels.description")}
        </p>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              {t("settings.models.offlineMode.title")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("settings.models.offlineMode.description")}
            </span>
          </div>
          <Switch
            checked={showOfflineFeatures}
            onCheckedChange={setShowOfflineFeatures}
          />
        </div>

        {showOfflineFeatures && (
          <>
            <div className="flex items-center justify-between gap-4 p-4 border-t border-border">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.models.ollamaStatus")}
                </span>
                <p className="text-xs text-muted-foreground">
                  {ollamaStatus?.ollama.available
                    ? t("settings.models.ollamaRunning", {
                        count: ollamaStatus.ollama.models.length,
                      })
                    : t("settings.models.ollamaNotRunning")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {ollamaStatus?.ollama.available ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-emerald-500">
                      {t("settings.models.available")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                    <span className="text-sm text-muted-foreground">
                      {t("settings.models.unavailable")}
                    </span>
                  </>
                )}
              </div>
            </div>

            {ollamaStatus?.ollama.available &&
              ollamaStatus.ollama.models.length > 0 && (
                <div className="flex items-center justify-between gap-4 p-4 border-t border-border">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground">
                      {t("settings.models.offlineModel.title")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.models.offlineModel.description")}
                    </p>
                  </div>
                  <Select
                    value={
                      selectedOllamaModel ||
                      ollamaStatus.ollama.recommendedModel ||
                      ollamaStatus.ollama.models[0]
                    }
                    onValueChange={(value) => setSelectedOllamaModel(value)}
                  >
                    <SelectTrigger className="w-auto shrink-0">
                      <SelectValue
                        placeholder={t("settings.models.offlineModel.select")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {ollamaStatus.ollama.models.map((model) => {
                        const isRecommended =
                          model === ollamaStatus.ollama.recommendedModel
                        return (
                          <SelectItem key={model} value={model}>
                            <span className="truncate">
                              {model}
                              {isRecommended && (
                                <span className="text-muted-foreground ml-1 text-xs">
                                  {t("settings.models.recommended")}
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

            <div className="flex items-center justify-between gap-4 p-4 border-t border-border">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.models.autoOfflineMode.title")}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("settings.models.autoOfflineMode.description")}
                </p>
              </div>
              <Switch checked={autoOffline} onCheckedChange={setAutoOffline} />
            </div>

            <div className="p-4 border-t border-border">
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded space-y-2">
                <p className="font-medium">
                  {t("settings.models.setupInstructions")}
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>
                    {t("settings.models.installOllamaPrefix", {
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
                    {t("settings.models.pullRecommendedModel")}{" "}
                    <code className="relative inline-flex items-center gap-1 bg-background pl-1.5 pr-0.5 py-0.5 rounded-md">
                      <span>ollama pull {RECOMMENDED_MODEL}</span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title={
                          copied
                            ? t("settings.models.copied")
                            : t("settings.models.copyCommand")
                        }
                      >
                        <div className="relative w-3 h-3">
                          <Copy
                            className={cn(
                              "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out hover:text-foreground",
                              copied
                                ? "opacity-0 scale-50"
                                : "opacity-100 scale-100",
                            )}
                          />
                          <Check
                            className={cn(
                              "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                              copied
                                ? "opacity-100 scale-100"
                                : "opacity-0 scale-50",
                            )}
                          />
                        </div>
                      </button>
                    </code>
                  </li>
                  <li>{t("settings.models.ollamaRunsAutomatically")}</li>
                </ol>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Account row component
function AccountRow({
  account,
  isActive,
  onSetActive,
  onRename,
  onRemove,
  isLoading,
}: {
  account: {
    id: string
    displayName: string | null
    email: string | null
    connectedAt: string | null
    credential?: {
      refreshable?: boolean
      source?: string | null
      storageFormat?: string | null
      expiresAt?: string | null
    } | null
  }
  isActive: boolean
  onSetActive: () => void
  onRename: () => void
  onRemove: () => void
  isLoading: boolean
}) {
  const { resolvedLanguage, t } = useI18n()
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-sm font-medium">
            {account.displayName || t("settings.models.accountFallback")}
          </div>
          {account.email && (
            <div className="text-xs text-muted-foreground">{account.email}</div>
          )}
          {!account.email && account.connectedAt && (
            <div className="text-xs text-muted-foreground">
              {t("settings.models.accountConnected", {
                date: new Date(account.connectedAt).toLocaleDateString(
                  resolvedLanguage === "zh-CN" ? "zh-CN" : undefined,
                  {
                    dateStyle: "short",
                  },
                ),
              })}
            </div>
          )}
          {account.credential && (
            <div className="text-xs text-muted-foreground">
              {account.credential.refreshable
                ? t("settings.models.claudeCode.refreshable")
                : t("settings.models.claudeCode.nonRefreshable")}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSetActive}
            disabled={isLoading}
          >
            {t("common.switch")}
          </Button>
        )}
        {isActive && (
          <ActiveStatusBadge>{t("common.active")}</ActiveStatusBadge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={t("common.moreOptions")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              {t("common.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
              onClick={onRemove}
            >
              {t("common.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

type ConfirmActionState = {
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void | Promise<void>
} | null

function ConfirmActionDialog({
  action,
  onOpenChange,
}: {
  action: ConfirmActionState
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()

  return (
    <AlertDialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action?.title}</AlertDialogTitle>
          <AlertDialogDescription>{action?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => {
              const onConfirm = action?.onConfirm
              onOpenChange(false)
              void onConfirm?.()
            }}
          >
            {action?.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ActiveStatusBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-xs font-medium text-emerald-700 dark:text-emerald-300"
    >
      <CheckCircle2 className="h-3 w-3" />
      {children}
    </Badge>
  )
}

// Anthropic accounts section component
function AnthropicAccountsSection() {
  const { t } = useI18n()
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null)
  const {
    data: accounts,
    isLoading: isAccountsLoading,
    refetch: refetchList,
  } = trpc.anthropicAccounts.list.useQuery(undefined, {
    refetchOnMount: true,
    staleTime: 0,
  })
  const { data: activeAccount, refetch: refetchActive } =
    trpc.anthropicAccounts.getActive.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: claudeCodeIntegration } =
    trpc.claudeCode.getIntegration.useQuery()
  const trpcUtils = trpc.useUtils()

  // Auto-migrate legacy account if needed
  const migrateLegacy = trpc.anthropicAccounts.migrateLegacy.useMutation({
    onSuccess: async () => {
      await refetchList()
      await refetchActive()
    },
  })

  // Trigger migration if: no accounts, not loading, has legacy connection, not already migrating
  useEffect(() => {
    if (
      !isAccountsLoading &&
      accounts?.length === 0 &&
      claudeCodeIntegration?.isConnected &&
      !migrateLegacy.isPending &&
      !migrateLegacy.isSuccess
    ) {
      migrateLegacy.mutate()
    }
  }, [isAccountsLoading, accounts, claudeCodeIntegration, migrateLegacy])

  const setActiveMutation = trpc.anthropicAccounts.setActive.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success(t("toast.models.accountSwitched"))
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const renameMutation = trpc.anthropicAccounts.rename.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      toast.success(t("toast.models.accountRenamed"))
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const removeMutation = trpc.anthropicAccounts.remove.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success(t("toast.models.accountRemoved"))
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const handleRename = (accountId: string, currentName: string | null) => {
    const newName = window.prompt(
      t("settings.models.renamePrompt"),
      currentName || t("settings.models.accountFallback"),
    )
    if (newName && newName.trim()) {
      renameMutation.mutate({ accountId, displayName: newName.trim() })
    }
  }

  const handleRemove = (accountId: string, displayName: string | null) => {
    setConfirmAction({
      title: t("common.remove"),
      description: t("settings.models.removeConfirm", {
        name: displayName || t("settings.models.accountFallback"),
      }),
      actionLabel: t("common.remove"),
      onConfirm: () => removeMutation.mutate({ accountId }),
    })
  }

  const isLoading =
    setActiveMutation.isPending ||
    renameMutation.isPending ||
    removeMutation.isPending

  // Don't show section if no accounts
  if (!isAccountsLoading && (!accounts || accounts.length === 0)) {
    return null
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
      {isAccountsLoading ? (
        <div className="p-4 text-center text-sm text-muted-foreground">
          {t("settings.models.accountsLoading")}
        </div>
      ) : (
        accounts?.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            isActive={activeAccount?.id === account.id}
            onSetActive={() =>
              setActiveMutation.mutate({ accountId: account.id })
            }
            onRename={() => handleRename(account.id, account.displayName)}
            onRemove={() => handleRemove(account.id, account.displayName)}
            isLoading={isLoading}
          />
        ))
      )}
      <ConfirmActionDialog
        action={confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      />
    </div>
  )
}

const PROVIDER_DEFAULT_PURPOSES: ProviderProfileDefaultPurpose[] = [
  "claude-main",
  "codex-main",
  "sub_chat_title",
  "commit_message",
]

function getProviderPurposeLabel(
  purpose: ProviderProfileDefaultPurpose,
  t: (key: TranslationKey) => string,
) {
  switch (purpose) {
    case "claude-main":
      return t("settings.models.providerProfiles.defaultClaude")
    case "codex-main":
      return t("settings.models.providerProfiles.defaultCodex")
    case "sub_chat_title":
      return t("settings.models.providerProfiles.defaultTitle")
    case "commit_message":
      return t("settings.models.providerProfiles.defaultCommit")
  }
}

function purposeMatchesProfile(
  purpose: ProviderProfileDefaultPurpose,
  targets: string[],
) {
  switch (purpose) {
    case "claude-main":
      return targets.includes("claude")
    case "codex-main":
      return targets.includes("codex")
    case "sub_chat_title":
    case "commit_message":
      return targets.includes("helpers")
  }
}

const DIAGNOSTIC_CHECK_LABEL_KEYS: Record<
  ProviderDiagnosticCheckId,
  TranslationKey
> = {
  endpoint: "settings.models.providerProfiles.diagnostic.endpoint",
  auth: "settings.models.providerProfiles.diagnostic.auth",
  model: "settings.models.providerProfiles.diagnostic.model",
  protocol: "settings.models.providerProfiles.diagnostic.protocol",
  streaming: "settings.models.providerProfiles.diagnostic.streaming",
  tools: "settings.models.providerProfiles.diagnostic.tools",
  vision: "settings.models.providerProfiles.diagnostic.vision",
  gateway: "settings.models.providerProfiles.diagnostic.gateway",
  runtime: "settings.models.providerProfiles.diagnostic.runtime",
  codex_app_server:
    "settings.models.providerProfiles.diagnostic.codexAppServer",
}

const DIAGNOSTIC_STATUS_LABEL_KEYS: Record<
  ProviderDiagnosticStatus,
  TranslationKey
> = {
  ok: "settings.models.providerProfiles.statusOk",
  failed: "settings.models.providerProfiles.statusFailed",
  unsupported: "settings.models.providerProfiles.statusUnsupported",
  skipped: "settings.models.providerProfiles.statusSkipped",
}

function getDiagnosticCheckLabel(
  id: ProviderDiagnosticCheckId,
  t: (key: TranslationKey) => string,
) {
  return t(DIAGNOSTIC_CHECK_LABEL_KEYS[id])
}

function getDiagnosticStatusLabel(
  status: ProviderDiagnosticStatus,
  t: (key: TranslationKey) => string,
) {
  return t(DIAGNOSTIC_STATUS_LABEL_KEYS[status])
}

function getProviderInitials(name: string) {
  const initials = name
    .split(/\s+|\/|-/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  return initials || "AI"
}

function diagnosticStatusClassName(status: ProviderDiagnosticStatus) {
  switch (status) {
    case "ok":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "failed":
      return "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
    case "unsupported":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    case "skipped":
      return "border-border bg-muted text-muted-foreground"
  }
}

function profileStatusClassName(ok: boolean) {
  return ok
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
}

function ProviderProfilesSettingsSection() {
  const { t } = useI18n()
  const setLastSelectedClaudeModelSource = useSetAtom(
    lastSelectedClaudeModelSourceAtom,
  )
  const setLastSelectedCodexModelSource = useSetAtom(
    lastSelectedCodexModelSourceAtom,
  )
  const trpcUtils = trpc.useUtils()
  const { data: profilesData } = trpc.providerProfiles.listProfiles.useQuery()
  const { data: defaultsData } = trpc.providerProfiles.getDefaults.useQuery()
  const deleteProfileMutation =
    trpc.providerProfiles.deleteProfile.useMutation()
  const testProfileMutation = trpc.providerProfiles.testProfile.useMutation()
  const setDefaultMutation = trpc.providerProfiles.setDefault.useMutation()

  const profiles = profilesData?.profiles ?? []
  const defaults = defaultsData?.defaults
  const [editingId, setEditingId] = useState<string | undefined>()
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null)

  const editingProfile = useMemo(
    () => profiles.find((profile) => profile.id === editingId),
    [editingId, profiles],
  )

  const editProfile = (profile: (typeof profiles)[number]) => {
    setEditingId(profile.id)
  }

  const handleDeleteProfile = (profileId: string) => {
    setConfirmAction({
      title: t("common.delete"),
      description: t("settings.models.providerProfiles.deleteConfirm"),
      actionLabel: t("common.delete"),
      onConfirm: () =>
        deleteProfileMutation.mutate(
          { id: profileId },
          {
            onSuccess: async () => {
              if (editingId === profileId) setEditingId(undefined)
              await Promise.all([
                trpcUtils.providerProfiles.listProfiles.invalidate(),
                trpcUtils.providerProfiles.getDefaults.invalidate(),
              ])
              toast.success(t("toast.models.providerProfileDeleted"))
            },
            onError: (error) => {
              toast.error(
                error.message ||
                  t("toast.models.failedToDeleteProviderProfile"),
              )
            },
          },
        ),
    })
  }

  const handleTestProfile = (profileId: string) => {
    setTestingProfileId(profileId)
    testProfileMutation.mutate(
      { id: profileId },
      {
        onSuccess: async ({ status }) => {
          await trpcUtils.providerProfiles.listProfiles.invalidate()
          if (status.ok) {
            toast.success(status.message)
          } else {
            toast.error(status.message)
          }
        },
        onError: (error) => {
          toast.error(
            error.message || t("toast.models.providerProfileTestFailed"),
          )
        },
        onSettled: () => {
          setTestingProfileId((current) =>
            current === profileId ? null : current,
          )
        },
      },
    )
  }

  const handleSetDefault = (
    purpose: ProviderProfileDefaultPurpose,
    profileId: string,
  ) => {
    const currentProfileId = defaults?.[purpose]?.profileId ?? null
    const nextProfileId = currentProfileId === profileId ? null : profileId
    setDefaultMutation.mutate(
      {
        purpose,
        profileId: nextProfileId,
      },
      {
        onSuccess: async () => {
          if (purpose === "claude-main") {
            setLastSelectedClaudeModelSource(
              nextProfileId
                ? (providerProfileSource(nextProfileId) as ClaudeModelSource)
                : "claude-oauth",
            )
          } else if (purpose === "codex-main") {
            setLastSelectedCodexModelSource(
              nextProfileId
                ? (providerProfileSource(nextProfileId) as CodexModelSource)
                : "chatgpt",
            )
          }
          await trpcUtils.providerProfiles.getDefaults.invalidate()
          toast.success(t("toast.models.providerDefaultSaved"))
        },
        onError: (error) => {
          toast.error(
            error.message || t("toast.models.failedToSaveProviderDefault"),
          )
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              {t("settings.models.providerProfiles.title")}
            </h4>
            <Badge variant="outline" className="text-xs">
              {profiles.length}
            </Badge>
          </div>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {t("settings.models.providerProfiles.description")}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <ProviderProfileEditor
          key={editingId ?? "new"}
          editingProfile={editingProfile}
          onSaved={(profile) => setEditingId(profile.id)}
          onReset={() => setEditingId(undefined)}
          className="border-b border-border p-4"
        />

        <div className="grid gap-2 p-3">
          {profiles.length === 0 ? (
            <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
              <ShieldCheck className="mb-2 h-6 w-6 text-muted-foreground/50" />
              <div className="text-sm font-medium text-foreground">
                {t("settings.models.providerProfiles.empty")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t("settings.models.providerProfiles.emptyHint")}
              </div>
            </div>
          ) : (
            profiles.map((profile) => {
              const status = profile.lastTestStatus
              const isTestingProfile = testingProfileId === profile.id
              return (
                <article
                  key={profile.id}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border border-border bg-card p-3 transition-colors",
                    "hover:border-primary/30 hover:bg-muted/20",
                    status?.ok === true && "border-emerald-500/20",
                    status?.ok === false && "border-red-500/20",
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground">
                        {getProviderInitials(profile.name)}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {profile.name}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {profile.protocol}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {profile.authMode === "none"
                              ? getProviderAuthModeLabel(profile.authMode, t)
                              : profile.hasToken
                                ? t("common.savedToken")
                                : t("settings.models.providerProfiles.noToken")}
                          </Badge>
                          {status ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1 text-[10px]",
                                profileStatusClassName(status.ok),
                              )}
                            >
                              {status.ok ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {status.ok
                                ? t("settings.models.providerProfiles.statusOk")
                                : t(
                                    "settings.models.providerProfiles.statusFailed",
                                  )}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px] text-muted-foreground"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {t(
                                "settings.models.providerProfiles.statusUntested",
                              )}
                            </Badge>
                          )}
                        </div>

                        <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                          <div className="truncate">
                            <span className="font-medium text-foreground/70">
                              {t("onboarding.customModel.modelName")}:
                            </span>{" "}
                            {profile.defaultModel}
                          </div>
                          <div className="truncate">
                            <span className="font-medium text-foreground/70">
                              {t("common.baseUrl")}:
                            </span>{" "}
                            {profile.baseUrl}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {profile.targetRuntimes.map((target) => (
                            <Badge
                              key={target}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {getProviderTargetLabel(target, t)}
                            </Badge>
                          ))}
                        </div>

                        {status?.message && (
                          <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                            {status.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                            ) : (
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                            )}
                            <div className="min-w-0">
                              <div className="break-words">
                                {status.message}
                              </div>
                              {status.checkedAt && (
                                <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                                  {t(
                                    "settings.models.providerProfiles.checkedAt",
                                  )}
                                  :{" "}
                                  {new Date(status.checkedAt).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1 lg:justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => editProfile(profile)}
                        aria-label={t("settings.models.providerProfiles.edit")}
                        title={t("settings.models.providerProfiles.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTestProfile(profile.id)}
                        disabled={isTestingProfile}
                        className="gap-1"
                      >
                        {isTestingProfile ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {isTestingProfile
                          ? t("settings.models.providerProfiles.testing")
                          : t("settings.models.providerProfiles.test")}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteProfile(profile.id)}
                        disabled={deleteProfileMutation.isPending}
                        className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {PROVIDER_DEFAULT_PURPOSES.map((purpose) => {
                      const active =
                        defaults?.[purpose]?.profileId === profile.id
                      const supported = purposeMatchesProfile(
                        purpose,
                        profile.targetRuntimes,
                      )
                      return (
                        <Button
                          key={purpose}
                          size="sm"
                          variant={active ? "secondary" : "outline"}
                          onClick={() => handleSetDefault(purpose, profile.id)}
                          disabled={!supported || setDefaultMutation.isPending}
                          aria-pressed={active}
                          className="h-7 text-xs"
                        >
                          {getProviderPurposeLabel(purpose, t)}
                        </Button>
                      )
                    })}
                  </div>

                  {status?.checks && status.checks.length > 0 && (
                    <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {status.checks.map((check) => (
                        <div
                          key={check.id}
                          className="flex min-w-0 items-start justify-between gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground/80">
                              {getDiagnosticCheckLabel(check.id, t)}
                            </div>
                            <div className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                              {check.message}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 text-[10px]",
                              diagnosticStatusClassName(check.status),
                            )}
                          >
                            {getDiagnosticStatusLabel(check.status, t)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>
      </div>
      <ConfirmActionDialog
        action={confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      />
    </div>
  )
}

type LocalApiProviderPurpose =
  | "sub_chat_title"
  | "commit_message"
  | "voice_transcription"

type LocalApiProviderSettingsSectionProps = {
  purpose: LocalApiProviderPurpose
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  modelHintKey: TranslationKey
  tokenHintKey: TranslationKey
  baseUrlHintKey: TranslationKey
  savedToastKey: TranslationKey
  resetToastKey: TranslationKey
  failedSaveToastKey: TranslationKey
  failedResetToastKey: TranslationKey
  modelPlaceholder?: string
  baseUrlPlaceholder?: string
}

function LocalApiProviderSettingsSection({
  purpose,
  titleKey,
  descriptionKey,
  modelHintKey,
  tokenHintKey,
  baseUrlHintKey,
  savedToastKey,
  resetToastKey,
  failedSaveToastKey,
  failedResetToastKey,
  modelPlaceholder = "deepseek-v4-flash",
  baseUrlPlaceholder = "https://api.deepseek.com",
}: LocalApiProviderSettingsSectionProps) {
  const { t } = useI18n()
  const trpcUtils = trpc.useUtils()
  const { data: providerData } = trpc.localApiProviderConfig.get.useQuery({
    purpose,
  })
  const saveProviderMutation = trpc.localApiProviderConfig.save.useMutation()
  const clearProviderMutation = trpc.localApiProviderConfig.clear.useMutation()
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [token, setToken] = useState("")
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null)

  useEffect(() => {
    if (!providerData) return

    const config = providerData.config
    setModel(config?.model ?? "")
    setBaseUrl(config?.baseUrl ?? "")
    setToken("")
  }, [providerData])

  const handleBlurSave = useCallback(() => {
    const trimmedModel = model.trim()
    const trimmedBaseUrl = baseUrl.trim()
    const trimmedToken = token.trim()
    const storedConfig = providerData?.config
    const hasStoredToken = Boolean(storedConfig?.hasToken)

    if (trimmedModel && trimmedBaseUrl && (trimmedToken || hasStoredToken)) {
      const metadataChanged =
        !storedConfig ||
        storedConfig.model !== trimmedModel ||
        storedConfig.baseUrl !== trimmedBaseUrl

      if (!metadataChanged && !trimmedToken) return

      saveProviderMutation.mutate(
        {
          purpose,
          model: trimmedModel,
          baseUrl: trimmedBaseUrl,
          ...(trimmedToken && { token: trimmedToken }),
        },
        {
          onSuccess: async () => {
            setToken("")
            await trpcUtils.localApiProviderConfig.get.invalidate()
            toast.success(t(savedToastKey))
          },
          onError: (error) => {
            toast.error(error.message || t(failedSaveToastKey))
          },
        },
      )
    } else if (!trimmedModel && !trimmedBaseUrl && !trimmedToken) {
      if (storedConfig) {
        clearProviderMutation.mutate(
          { purpose },
          {
            onSuccess: async () => {
              await trpcUtils.localApiProviderConfig.get.invalidate()
              toast.success(t(resetToastKey))
            },
            onError: (error) => {
              toast.error(error.message || t(failedResetToastKey))
            },
          },
        )
      }
    }
  }, [
    baseUrl,
    clearProviderMutation,
    failedResetToastKey,
    failedSaveToastKey,
    model,
    providerData?.config,
    purpose,
    resetToastKey,
    savedToastKey,
    saveProviderMutation,
    t,
    token,
    trpcUtils.localApiProviderConfig.get,
  ])

  const performReset = () => {
    clearProviderMutation.mutate(
      { purpose },
      {
        onSuccess: async () => {
          setModel("")
          setBaseUrl("")
          setToken("")
          await trpcUtils.localApiProviderConfig.get.invalidate()
          toast.success(t(resetToastKey))
        },
        onError: (error) => {
          toast.error(error.message || t(failedResetToastKey))
        },
      },
    )
  }

  const handleReset = () => {
    setConfirmAction({
      title: t("common.reset"),
      description: t("settings.models.resetProviderConfirm"),
      actionLabel: t("common.reset"),
      onConfirm: performReset,
    })
  }

  const canReset = Boolean(
    model.trim() ||
      baseUrl.trim() ||
      token.trim() ||
      providerData?.config?.hasToken,
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">{t(titleKey)}</h4>
          <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>
        </div>
        {canReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={clearProviderMutation.isPending}
            className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
          >
            {t("common.reset")}
          </Button>
        )}
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex-1">
            <Label className="text-sm font-medium">
              {t("onboarding.customModel.modelName")}
            </Label>
            <p className="text-xs text-muted-foreground">{t(modelHintKey)}</p>
          </div>
          <div className="flex-shrink-0 w-80">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={handleBlurSave}
              disabled={saveProviderMutation.isPending}
              className="w-full"
              placeholder={modelPlaceholder}
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex-1">
            <Label className="text-sm font-medium">
              {t("onboarding.customModel.apiToken")}
            </Label>
            <p className="text-xs text-muted-foreground">{t(tokenHintKey)}</p>
          </div>
          <div className="flex-shrink-0 w-80">
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={handleBlurSave}
              disabled={saveProviderMutation.isPending}
              className="w-full"
              placeholder={
                providerData?.config?.hasToken
                  ? t("common.savedToken")
                  : "sk-..."
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex-1">
            <Label className="text-sm font-medium">{t("common.baseUrl")}</Label>
            <p className="text-xs text-muted-foreground">{t(baseUrlHintKey)}</p>
          </div>
          <div className="flex-shrink-0 w-80">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={handleBlurSave}
              disabled={saveProviderMutation.isPending}
              className="w-full"
              placeholder={baseUrlPlaceholder}
            />
          </div>
        </div>
      </div>
      <ConfirmActionDialog
        action={confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      />
    </div>
  )
}

export function AgentsModelsTab() {
  const { t } = useI18n()
  const [isAdvancedRoutingOpen, setIsAdvancedRoutingOpen] = useState(true)
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null)
  const helperApisSectionRef = useRef<HTMLDivElement | null>(null)
  const qwenCliSectionRef = useRef<HTMLDivElement | null>(null)
  const [modelsSettingsTarget, setModelsSettingsTarget] = useAtom(
    modelsSettingsTargetAtom,
  )
  const setClaudeLoginModalConfig = useSetAtom(claudeLoginModalConfigAtom)
  const setClaudeLoginModalOpen = useSetAtom(agentsLoginModalOpenAtom)
  const setCodexLoginModalOpen = useSetAtom(codexLoginModalOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const isLocalOnly = useLocalOnlyMode()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected
  const { data: codexIntegration, isLoading: isCodexLoading } =
    trpc.codex.getIntegration.useQuery()
  const { data: codexApiKeyStatus } = trpc.codex.getCodexApiKeyStatus.useQuery()
  const { data: runtimeManifests } =
    trpc.agentRuntime.listManifests.useQuery(undefined, {
      staleTime: 60_000,
    })
  const qwenRuntimeVisible =
    runtimeManifests?.some((manifest) => manifest.runtimeId === "qwen-code") ??
    false
  const { data: qwenCliStatus, isLoading: isQwenCliStatusLoading } =
    trpc.agentRuntime.getQwenCliStatus.useQuery(undefined, {
      enabled: qwenRuntimeVisible,
      staleTime: 15_000,
    })
  const [qwenExecutablePath, setQwenExecutablePath] = useState("")

  // OpenAI API key state
  const [codexApiKey, setCodexApiKey] = useState("")
  const [isSavingCodexApiKey, setIsSavingCodexApiKey] = useState(false)
  const setLastSelectedCodexModelSource = useSetAtom(
    lastSelectedCodexModelSourceAtom,
  )
  const codexLogoutMutation = trpc.codex.logout.useMutation()
  const saveCodexApiKeyMutation = trpc.codex.saveCodexApiKey.useMutation()
  const removeCodexApiKeyMutation = trpc.codex.removeCodexApiKey.useMutation()
  const trpcUtils = trpc.useUtils()
  const updateQwenExecutablePathMutation =
    trpc.agentRuntime.updateQwenExecutablePath.useMutation()
  const resetQwenExecutablePathMutation =
    trpc.agentRuntime.resetQwenExecutablePath.useMutation()

  useEffect(() => {
    if (!modelsSettingsTarget) return

    if (modelsSettingsTarget === "helper-apis") {
      setIsAdvancedRoutingOpen(true)
    }
    const timeoutId = window.setTimeout(() => {
      const targetRef =
        modelsSettingsTarget === "qwen-cli"
          ? qwenCliSectionRef
          : helperApisSectionRef
      targetRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      setModelsSettingsTarget(null)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [modelsSettingsTarget, setModelsSettingsTarget])

  const handleRefreshQwenCliStatus = async () => {
    await trpcUtils.agentRuntime.getQwenCliStatus.invalidate()
  }

  const handleCopyQwenInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(
        qwenCliStatus?.guidance.installCommand ??
          "npm install -g @qwen-code/qwen-code",
      )
      toast.success(t("settings.models.copied"))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toast.models.failedToCopyQwenInstallCommand"),
      )
    }
  }

  const handleSaveQwenExecutablePath = async () => {
    const executablePath = qwenExecutablePath.trim()
    if (!executablePath) return

    try {
      await updateQwenExecutablePathMutation.mutateAsync({ executablePath })
      setQwenExecutablePath("")
      await trpcUtils.agentRuntime.getQwenCliStatus.invalidate()
      toast.success(t("toast.models.qwenExecutablePathSaved"))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toast.models.failedToSaveQwenExecutablePath"),
      )
    }
  }

  const handleResetQwenExecutablePath = async () => {
    try {
      await resetQwenExecutablePathMutation.mutateAsync()
      setQwenExecutablePath("")
      await trpcUtils.agentRuntime.getQwenCliStatus.invalidate()
      toast.success(t("toast.models.qwenExecutablePathReset"))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toast.models.failedToResetQwenExecutablePath"),
      )
    }
  }

  const handleClaudeCodeSetup = async () => {
    if (isLocalOnly) {
      setClaudeLoginModalConfig({
        hideCustomModelSettingsLink: true,
        autoStartAuth: true,
      })
      setClaudeLoginModalOpen(true)
      return
    }

    setClaudeLoginModalConfig({
      hideCustomModelSettingsLink: true,
      autoStartAuth: true,
    })
    setClaudeLoginModalOpen(true)
  }

  const handleCodexSetup = () => {
    setCodexLoginModalOpen(true)
  }

  const handleCodexLogout = async () => {
    setConfirmAction({
      title: t("common.remove"),
      description: t("settings.models.codexLogoutConfirm"),
      actionLabel: t("common.remove"),
      onConfirm: async () => {
        try {
          await codexLogoutMutation.mutateAsync()
          await trpcUtils.codex.getIntegration.invalidate()
          toast.success(t("toast.models.codexDisconnected"))
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : t("toast.models.failedToDisconnectCodex")
          toast.error(message)
        }
      },
    })
  }

  const hasAppCodexApiKey = Boolean(codexApiKeyStatus?.hasApiKey)
  const isCodexSubscriptionConnected =
    codexIntegration?.state === "connected_chatgpt"
  const isCodexSubscriptionActive =
    isCodexSubscriptionConnected && !hasAppCodexApiKey
  const [hiddenModels, setHiddenModels] = useAtom(hiddenModelsAtom)

  const toggleModelVisibility = useCallback(
    (modelId: string) => {
      setHiddenModels((prev) => {
        if (prev.includes(modelId)) {
          return prev.filter((id) => id !== modelId)
        }
        return [...prev, modelId]
      })
    },
    [setHiddenModels],
  )

  const codexConnectionText = isCodexSubscriptionConnected
    ? t("settings.models.codex.connectedViaChatGPT")
    : codexIntegration?.state === "connected_api_key"
      ? t("settings.models.codex.notConnectedToSubscription")
      : codexIntegration?.state === "not_logged_in"
        ? t("settings.models.codex.notConnected")
        : t("settings.models.codex.statusUnavailable")
  const showCodexLoading = isCodexLoading && !hasAppCodexApiKey

  const handleCodexApiKeyBlur = async () => {
    const trimmedKey = codexApiKey.trim()

    if (!trimmedKey) return

    const normalized = normalizeCodexApiKey(trimmedKey)
    if (!normalized) {
      toast.error(t("toast.models.invalidCodexApiKey"))
      setCodexApiKey("")
      return
    }

    setIsSavingCodexApiKey(true)
    try {
      const saveResult = await saveCodexApiKeyMutation.mutateAsync({
        apiKey: normalized,
      })
      setCodexApiKey("")
      setLastSelectedCodexModelSource("openai-api-key")
      await trpcUtils.codex.getCodexApiKeyStatus.invalidate()
      await trpcUtils.codex.getIntegration.invalidate()
      if (saveResult.verified === false) {
        // Key was stored but OpenAI could not be reached to verify it
        // (offline / rate-limited / transient) — accept it, but be honest.
        toast.warning(saveResult.warning ?? t("toast.models.codexApiKeySaved"))
      } else {
        toast.success(t("toast.models.codexApiKeySaved"))
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toast.models.failedToSaveCodexApiKey"),
      )
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const removeCodexApiKey = async () => {
    setIsSavingCodexApiKey(true)
    try {
      await removeCodexApiKeyMutation.mutateAsync()
      setCodexApiKey("")
      setLastSelectedCodexModelSource("chatgpt")

      if (codexIntegration?.state === "connected_api_key") {
        await codexLogoutMutation.mutateAsync().catch(() => {
          toast.error(t("toast.models.codexApiKeyRemovedLogoutFailed"))
        })
      }

      await trpcUtils.codex.getCodexApiKeyStatus.invalidate()
      await trpcUtils.codex.getIntegration.invalidate()
      toast.success(t("toast.models.codexApiKeyRemoved"))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toast.models.failedToRemoveCodexApiKey"),
      )
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleRemoveCodexApiKey = () => {
    setConfirmAction({
      title: t("settings.models.removeCodexApiKey"),
      description: t("settings.models.removeCodexApiKeyConfirm"),
      actionLabel: t("common.remove"),
      onConfirm: removeCodexApiKey,
    })
  }

  // All models merged into one list for the top section
  const allModels = useMemo(() => {
    const items: { id: string; name: string; provider: "claude" | "codex" }[] =
      []
    for (const m of CLAUDE_MODELS) {
      items.push({
        id: m.id,
        name: `${m.name} ${m.version}`,
        provider: "claude",
      })
    }
    for (const m of CODEX_MODELS) {
      items.push({ id: m.id, name: m.name, provider: "codex" })
    }
    return items
  }, [])

  const [modelSearch, setModelSearch] = useState("")
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return allModels
    const q = modelSearch.toLowerCase().trim()
    return allModels.filter((m) => m.name.toLowerCase().includes(q))
  }, [allModels, modelSearch])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">
            {t("settings.models.title")}
          </h3>
        </div>
      )}

      {/* ===== Models Section ===== */}
      <div className="space-y-2">
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Search */}
          <div className="px-1.5 pt-1.5 pb-0.5">
            <div className="flex items-center gap-1.5 h-7 px-1.5 rounded-md bg-muted/50">
              <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder={t("settings.models.searchPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Model list */}
          <div className="divide-y divide-border">
            {filteredModels.map((m) => {
              const isEnabled = !hiddenModels.includes(m.id)
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.name}</span>
                    {m.provider === "claude" ? (
                      <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <CodexIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleModelVisibility(m.id)}
                    aria-label={t("settings.models.visibilityToggle", {
                      model: m.name,
                    })}
                  />
                </div>
              )
            })}
            {filteredModels.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t("settings.models.noModelsFound")}
              </div>
            )}
          </div>
        </div>
      </div>

      <LocalModelsSettingsSection />

      {/* ===== Accounts Section ===== */}
      <div className="space-y-2">
        {/* Anthropic Accounts */}
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              {t("settings.models.anthropicAccounts.title")}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t("settings.models.anthropicAccounts.description")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleClaudeCodeSetup()}
            disabled={isClaudeCodeLoading}
          >
            <Plus className="h-3 w-3 mr-1" />
            {isClaudeCodeConnected ? t("common.add") : t("common.connect")}
          </Button>
        </div>

        <AnthropicAccountsSection />
      </div>

      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              {t("settings.models.codexAccount.title")}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t("settings.models.codexAccount.description")}
            </p>
          </div>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
          {showCodexLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("settings.models.codex.loadingAccount")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-6 p-4 hover:bg-muted/50">
                <div>
                  <div className="text-sm font-medium">
                    {t("settings.models.codexSubscription")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {codexConnectionText}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCodexSubscriptionActive && (
                    <ActiveStatusBadge>{t("common.active")}</ActiveStatusBadge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={
                          isCodexLoading ||
                          codexLogoutMutation.isPending ||
                          isSavingCodexApiKey
                        }
                        aria-label={t("common.moreOptions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isCodexSubscriptionConnected ? (
                        <DropdownMenuItem
                          className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
                          onClick={() => void handleCodexLogout()}
                        >
                          {t("settings.models.codex.logout")}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => void handleCodexSetup()}
                        >
                          {t("common.connect")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex items-center justify-between gap-6 p-4 hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">
                      {t("common.codexApiKey")}
                    </Label>
                    {hasAppCodexApiKey && (
                      <ActiveStatusBadge>
                        {t("common.active")}
                      </ActiveStatusBadge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.models.codexApiKey.priority")}
                  </p>
                </div>
                <div className="flex-shrink-0 w-80 flex items-center gap-2">
                  <Input
                    type="password"
                    value={codexApiKey}
                    onChange={(e) => setCodexApiKey(e.target.value)}
                    onBlur={handleCodexApiKeyBlur}
                    disabled={
                      isSavingCodexApiKey ||
                      codexApiKeyStatus?.encryptionAvailable === false
                    }
                    className="w-full font-mono"
                    placeholder={
                      hasAppCodexApiKey ? t("common.savedToken") : "sk-..."
                    }
                  />
                  {hasAppCodexApiKey && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void handleRemoveCodexApiKey()}
                      disabled={isSavingCodexApiKey}
                      aria-label={t("settings.models.removeCodexApiKey")}
                      className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {qwenRuntimeVisible && (
        <div ref={qwenCliSectionRef} className="space-y-2 scroll-mt-6">
          <div className="pb-2 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-foreground">
                {t("settings.models.qwenCli.title")}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("settings.models.qwenCli.description")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRefreshQwenCliStatus()}
              disabled={isQwenCliStatusLoading}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              {t("common.retry")}
            </Button>
          </div>

          <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {t("settings.models.qwenCli.status")}
                    </span>
                    {qwenCliStatus?.ok ? (
                      <ActiveStatusBadge>{t("common.active")}</ActiveStatusBadge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-800 dark:text-amber-200"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {isQwenCliStatusLoading
                          ? t("common.loading")
                          : t("settings.models.qwenCli.setupRequired")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {qwenCliStatus?.ok
                      ? t("settings.models.qwenCli.availableHint")
                      : t("settings.models.qwenCli.missingHint")}
                  </p>
                  {qwenCliStatus?.executable.path && (
                    <p className="break-all text-xs text-muted-foreground">
                      {t("settings.models.qwenCli.currentPath", {
                        path: qwenCliStatus.executable.path,
                      })}
                    </p>
                  )}
                  {qwenCliStatus?.version.value && (
                    <p className="text-xs text-muted-foreground">
                      {t("settings.models.qwenCli.version", {
                        version: qwenCliStatus.version.value,
                      })}
                    </p>
                  )}
                  {qwenCliStatus?.version.error && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {t("settings.models.qwenCli.versionProbeFailed", {
                        error: qwenCliStatus.version.error,
                      })}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <code className="min-w-0 overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
                  {qwenCliStatus?.guidance.installCommand ??
                    "npm install -g @qwen-code/qwen-code"}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCopyQwenInstallCommand()}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {t("settings.models.copyCommand")}
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a
                    href={
                      qwenCliStatus?.guidance.docsUrl ??
                      "https://qwenlm.github.io/qwen-code-docs/"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon className="h-3 w-3 mr-1" />
                    {t("settings.models.qwenCli.docs")}
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {qwenCliStatus?.guidance.authHint ??
                  t("settings.models.qwenCli.authHint")}
              </p>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <div>
                <Label className="text-sm font-medium">
                  {t("settings.models.qwenCli.overridePath")}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.models.qwenCli.overrideHint")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={qwenExecutablePath}
                  onChange={(event) =>
                    setQwenExecutablePath(event.currentTarget.value)
                  }
                  placeholder="/opt/homebrew/bin/qwen"
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleSaveQwenExecutablePath()}
                    disabled={
                      !qwenExecutablePath.trim() ||
                      updateQwenExecutablePathMutation.isPending
                    }
                  >
                    {updateQwenExecutablePathMutation.isPending
                      ? t("common.saving")
                      : t("common.save")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleResetQwenExecutablePath()}
                    disabled={resetQwenExecutablePathMutation.isPending}
                  >
                    {t("common.reset")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Collapsible
        open={isAdvancedRoutingOpen}
        onOpenChange={setIsAdvancedRoutingOpen}
        className="space-y-4"
      >
        <CollapsibleTrigger className="flex items-start gap-2 text-left text-sm font-medium text-foreground transition-colors hover:text-foreground/80">
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${
              isAdvancedRoutingOpen ? "" : "-rotate-90"
            }`}
          />
          <span className="min-w-0">
            <span className="block">
              {t("settings.models.advancedRouting.title")}
            </span>
            <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
              {t("settings.models.advancedRouting.description")}
            </span>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6">
          <ProviderProfilesSettingsSection />

          <div ref={helperApisSectionRef} className="space-y-3 scroll-mt-6">
            <div className="pb-1">
              <h4 className="text-sm font-medium text-foreground">
                {t("settings.models.helperApis.title")}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("settings.models.helperApis.description")}
              </p>
            </div>

            <LocalApiProviderSettingsSection
              purpose="sub_chat_title"
              titleKey="settings.models.subChatTitle.title"
              descriptionKey="settings.models.subChatTitle.description"
              modelHintKey="settings.models.subChatTitle.modelHint"
              tokenHintKey="settings.models.subChatTitle.tokenHint"
              baseUrlHintKey="settings.models.subChatTitle.baseUrlHint"
              savedToastKey="toast.models.subChatTitleSettingsSaved"
              resetToastKey="toast.models.subChatTitleSettingsReset"
              failedSaveToastKey="toast.models.failedToSaveSubChatTitleSettings"
              failedResetToastKey="toast.models.failedToResetSubChatTitleSettings"
            />

            <LocalApiProviderSettingsSection
              purpose="commit_message"
              titleKey="settings.models.commitMessage.title"
              descriptionKey="settings.models.commitMessage.description"
              modelHintKey="settings.models.commitMessage.modelHint"
              tokenHintKey="settings.models.commitMessage.tokenHint"
              baseUrlHintKey="settings.models.commitMessage.baseUrlHint"
              savedToastKey="toast.models.commitMessageSettingsSaved"
              resetToastKey="toast.models.commitMessageSettingsReset"
              failedSaveToastKey="toast.models.failedToSaveCommitMessageSettings"
              failedResetToastKey="toast.models.failedToResetCommitMessageSettings"
            />

            <LocalApiProviderSettingsSection
              purpose="voice_transcription"
              titleKey="settings.models.voiceTranscription.title"
              descriptionKey="settings.models.voiceTranscription.description"
              modelHintKey="settings.models.voiceTranscription.modelHint"
              tokenHintKey="settings.models.voiceTranscription.tokenHint"
              baseUrlHintKey="settings.models.voiceTranscription.baseUrlHint"
              savedToastKey="toast.models.voiceTranscriptionSettingsSaved"
              resetToastKey="toast.models.voiceTranscriptionSettingsReset"
              failedSaveToastKey="toast.models.failedToSaveVoiceTranscriptionSettings"
              failedResetToastKey="toast.models.failedToResetVoiceTranscriptionSettings"
              modelPlaceholder={OPENAI_TRANSCRIPTION_MODEL}
              baseUrlPlaceholder={OPENAI_TRANSCRIPTION_BASE_URL}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
      <ConfirmActionDialog
        action={confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      />
    </div>
  )
}
