import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { CheckCircle2, ChevronDown, MoreHorizontal, Plus, Trash2, XCircle } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  providerProfileAuthModes,
  providerProfileProtocols,
  providerProfileTargets,
  providerProfileSource,
  type ProviderProfileAuthMode,
  type ProviderProfileDefaultPurpose,
  type ProviderProfileProtocol,
  type ProviderProfileTarget,
} from "../../../../shared/provider-profile-types"
import {
  agentsLoginModalOpenAtom,
  claudeLoginModalConfigAtom,
  codexApiKeyAtom,
  codexLoginModalOpenAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  modelsSettingsTargetAtom,
  hiddenModelsAtom,
  normalizeCodexApiKey,
  openaiApiKeyAtom,
  type ClaudeProviderAuthMode,
} from "../../../lib/atoms"
import {
  lastSelectedClaudeModelSourceAtom,
  lastSelectedCodexModelSourceAtom,
  type ClaudeModelSource,
  type CodexModelSource,
} from "../../../features/agents/atoms"
import { useI18n, type TranslationKey } from "../../../lib/i18n"
import { ClaudeCodeIcon, CodexIcon, SearchIcon } from "../../ui/icons"
import { CLAUDE_MODELS, CODEX_MODELS } from "../../../features/agents/lib/models"
import { trpc } from "../../../lib/trpc"
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
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"
import { useLocalOnlyMode } from "../../../lib/hooks/use-local-only-mode"

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
          <Badge variant="secondary" className="text-xs">
            {t("common.active")}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
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

// Anthropic accounts section component
function AnthropicAccountsSection() {
  const { t } = useI18n()
  const { data: accounts, isLoading: isAccountsLoading, refetch: refetchList } =
    trpc.anthropicAccounts.list.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: activeAccount, refetch: refetchActive } =
    trpc.anthropicAccounts.getActive.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: claudeCodeIntegration } = trpc.claudeCode.getIntegration.useQuery()
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
      currentName || t("settings.models.accountFallback")
    )
    if (newName && newName.trim()) {
      renameMutation.mutate({ accountId, displayName: newName.trim() })
    }
  }

  const handleRemove = (accountId: string, displayName: string | null) => {
    const confirmed = window.confirm(
      t("settings.models.removeConfirm", {
        name: displayName || t("settings.models.accountFallback"),
      })
    )
    if (confirmed) {
      removeMutation.mutate({ accountId })
    }
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
              onSetActive={() => setActiveMutation.mutate({ accountId: account.id })}
              onRename={() => handleRename(account.id, account.displayName)}
              onRemove={() => handleRemove(account.id, account.displayName)}
              isLoading={isLoading}
            />
          ))
        )}
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

function ProviderProfilesSettingsSection() {
  const { t } = useI18n()
  const setLastSelectedClaudeModelSource = useSetAtom(
    lastSelectedClaudeModelSourceAtom,
  )
  const setLastSelectedCodexModelSource = useSetAtom(
    lastSelectedCodexModelSourceAtom,
  )
  const trpcUtils = trpc.useUtils()
  const { data: presetsData } = trpc.providerProfiles.listPresets.useQuery()
  const { data: profilesData } = trpc.providerProfiles.listProfiles.useQuery()
  const { data: defaultsData } = trpc.providerProfiles.getDefaults.useQuery()
  const saveProfileMutation = trpc.providerProfiles.saveProfile.useMutation()
  const deleteProfileMutation = trpc.providerProfiles.deleteProfile.useMutation()
  const testProfileMutation = trpc.providerProfiles.testProfile.useMutation()
  const setDefaultMutation = trpc.providerProfiles.setDefault.useMutation()

  const presets = presetsData?.presets ?? []
  const profiles = profilesData?.profiles ?? []
  const defaults = defaultsData?.defaults
  const [editingId, setEditingId] = useState<string | undefined>()
  const [presetId, setPresetId] = useState("")
  const [name, setName] = useState("")
  const [protocol, setProtocol] =
    useState<ProviderProfileProtocol>("openai-chat")
  const [baseUrl, setBaseUrl] = useState("")
  const [defaultModel, setDefaultModel] = useState("")
  const [authMode, setAuthMode] = useState<ProviderProfileAuthMode>("bearer")
  const [token, setToken] = useState("")
  const [headersText, setHeadersText] = useState("")
  const [targetRuntimes, setTargetRuntimes] = useState<ProviderProfileTarget[]>([
    "claude",
    "codex",
    "helpers",
  ])

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === presetId),
    [presetId, presets],
  )
  const editingProfile = useMemo(
    () => profiles.find((profile) => profile.id === editingId),
    [editingId, profiles],
  )

  const applyPreset = useCallback(
    (nextPresetId: string) => {
      const preset = presets.find((item) => item.id === nextPresetId)
      if (!preset) return
      setEditingId(undefined)
      setPresetId(preset.id)
      setName(preset.name)
      setProtocol(preset.protocol)
      setBaseUrl(preset.baseUrl)
      setDefaultModel(preset.defaultModel)
      setAuthMode(preset.authMode)
      setToken("")
      setHeadersText("")
      setTargetRuntimes([...preset.targetRuntimes])
    },
    [presets],
  )

  useEffect(() => {
    if (presetId || presets.length === 0 || editingId) return
    applyPreset(presets[0]!.id)
  }, [applyPreset, editingId, presetId, presets])

  const resetForm = useCallback(() => {
    setEditingId(undefined)
    if (presetId) {
      applyPreset(presetId)
      return
    }
    if (presets[0]) {
      applyPreset(presets[0].id)
    }
  }, [applyPreset, presetId, presets])

  const editProfile = (profile: (typeof profiles)[number]) => {
    setEditingId(profile.id)
    setPresetId(profile.presetId ?? "")
    setName(profile.name)
    setProtocol(profile.protocol)
    setBaseUrl(profile.baseUrl)
    setDefaultModel(profile.defaultModel)
    setAuthMode(profile.authMode)
    setToken("")
    setHeadersText(
      Object.keys(profile.headers).length > 0
        ? JSON.stringify(profile.headers, null, 2)
        : "",
    )
    setTargetRuntimes([...profile.targetRuntimes])
  }

  const toggleTarget = (target: ProviderProfileTarget) => {
    setTargetRuntimes((current) =>
      current.includes(target)
        ? current.filter((item) => item !== target)
        : [...current, target],
    )
  }

  const canSaveProfile = Boolean(
    name.trim() &&
    baseUrl.trim() &&
    defaultModel.trim() &&
    targetRuntimes.length > 0 &&
    (authMode === "none" || token.trim() || editingProfile?.hasToken),
  )

  const handleSaveProfile = () => {
    let headers: Record<string, string> = {}
    if (headersText.trim()) {
      try {
        const parsed = JSON.parse(headersText) as unknown
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("Invalid headers JSON")
        }
        headers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
            key,
            String(value),
          ]),
        )
      } catch {
        toast.error(t("settings.models.providerProfiles.invalidHeaders"))
        return
      }
    }

    saveProfileMutation.mutate(
      {
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
        presetId: presetId || null,
        protocol,
        baseUrl: baseUrl.trim(),
        defaultModel: defaultModel.trim(),
        authMode,
        ...(token.trim() ? { token: token.trim() } : {}),
        headers,
        targetRuntimes,
        capabilities: {
          ...(selectedPreset?.capabilities ?? editingProfile?.capabilities ?? {}),
          claude: targetRuntimes.includes("claude"),
          codex: targetRuntimes.includes("codex"),
          helpers: targetRuntimes.includes("helpers"),
          local: targetRuntimes.includes("local"),
        },
      },
      {
        onSuccess: async ({ profile }) => {
          setEditingId(profile.id)
          setToken("")
          await Promise.all([
            trpcUtils.providerProfiles.listProfiles.invalidate(),
            trpcUtils.providerProfiles.getDefaults.invalidate(),
          ])
          toast.success(t("toast.models.providerProfileSaved"))
        },
        onError: (error) => {
          toast.error(error.message || t("toast.models.failedToSaveProviderProfile"))
        },
      },
    )
  }

  const handleDeleteProfile = (profileId: string) => {
    const confirmed = window.confirm(
      t("settings.models.providerProfiles.deleteConfirm"),
    )
    if (!confirmed) return
    deleteProfileMutation.mutate(
      { id: profileId },
      {
        onSuccess: async () => {
          if (editingId === profileId) resetForm()
          await Promise.all([
            trpcUtils.providerProfiles.listProfiles.invalidate(),
            trpcUtils.providerProfiles.getDefaults.invalidate(),
          ])
          toast.success(t("toast.models.providerProfileDeleted"))
        },
        onError: (error) => {
          toast.error(error.message || t("toast.models.failedToDeleteProviderProfile"))
        },
      },
    )
  }

  const handleTestProfile = (profileId: string) => {
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
          toast.error(error.message || t("toast.models.providerProfileTestFailed"))
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
          toast.error(error.message || t("toast.models.failedToSaveProviderDefault"))
        },
      },
    )
  }

  return (
    <div className="space-y-3">
      <div className="pb-1">
        <h4 className="text-sm font-medium text-foreground">
          {t("settings.models.providerProfiles.title")}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t("settings.models.providerProfiles.description")}
        </p>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t("settings.models.providerProfiles.preset")}
                </Label>
                <select
                  value={presetId}
                  onChange={(event) => applyPreset(event.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t("settings.models.providerProfiles.name")}
                </Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t("onboarding.customModel.modelName")}
                </Label>
                <Input
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="model-id"
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Protocol</Label>
                <select
                  value={protocol}
                  onChange={(event) =>
                    setProtocol(event.target.value as ProviderProfileProtocol)
                  }
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {providerProfileProtocols.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Auth</Label>
                <select
                  value={authMode}
                  onChange={(event) =>
                    setAuthMode(event.target.value as ProviderProfileAuthMode)
                  }
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {providerProfileAuthModes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">API Key</Label>
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={
                    editingProfile?.hasToken ? t("common.savedToken") : "sk-..."
                  }
                  disabled={authMode === "none"}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t("settings.models.providerProfiles.targets")}
              </Label>
              <div className="flex flex-wrap gap-2">
                {providerProfileTargets.map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => toggleTarget(target)}
                    className={[
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      targetRuntimes.includes(target)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {target}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t("settings.models.providerProfiles.headers")}
              </Label>
              <Input
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder='{"HTTP-Referer":"https://example.com"}'
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {editingId
                  ? t("settings.models.providerProfiles.editing")
                  : t("settings.models.providerProfiles.create")}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedPreset?.region
                  ? `${selectedPreset.name} · ${selectedPreset.region}`
                  : t("settings.models.providerProfiles.customPreset")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleSaveProfile}
                disabled={!canSaveProfile || saveProfileMutation.isPending}
              >
                {saveProfileMutation.isPending
                  ? t("common.saving")
                  : t("common.save")}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>
                {t("common.reset")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.models.providerProfiles.secretNotice")}
            </p>
          </div>
        </div>

        <div className="divide-y divide-border">
          {profiles.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {t("settings.models.providerProfiles.empty")}
            </div>
          ) : (
            profiles.map((profile) => {
              const status = profile.lastTestStatus
              return (
                <div key={profile.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {profile.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {profile.protocol}
                        </Badge>
                        {status && (
                          <Badge
                            variant={status.ok ? "secondary" : "outline"}
                            className="gap-1 text-xs"
                          >
                            {status.ok ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {status.ok ? "OK" : "Failed"}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {profile.defaultModel} · {profile.baseUrl}
                      </div>
                      {status?.message && (
                        <div className="text-xs text-muted-foreground">
                          {status.message}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => editProfile(profile)}
                      >
                        {t("settings.models.providerProfiles.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTestProfile(profile.id)}
                        disabled={testProfileMutation.isPending}
                      >
                        {t("settings.models.providerProfiles.test")}
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

                  <div className="flex flex-wrap gap-1.5">
                    {profile.targetRuntimes.map((target) => (
                      <Badge key={target} variant="secondary" className="text-xs">
                        {target}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PROVIDER_DEFAULT_PURPOSES.map((purpose) => {
                      const active = defaults?.[purpose]?.profileId === profile.id
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
                          className="text-xs"
                        >
                          {getProviderPurposeLabel(purpose, t)}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

type LocalApiProviderPurpose = "sub_chat_title" | "commit_message"

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

  const handleReset = () => {
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
          <h4 className="text-sm font-medium text-foreground">
            {t(titleKey)}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t(descriptionKey)}
          </p>
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
            <p className="text-xs text-muted-foreground">
              {t(modelHintKey)}
            </p>
          </div>
          <div className="flex-shrink-0 w-80">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={handleBlurSave}
              disabled={saveProviderMutation.isPending}
              className="w-full"
              placeholder="deepseek-chat"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex-1">
            <Label className="text-sm font-medium">
              {t("onboarding.customModel.apiToken")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(tokenHintKey)}
            </p>
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
                providerData?.config?.hasToken ? t("common.savedToken") : "sk-..."
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex-1">
            <Label className="text-sm font-medium">Base URL</Label>
            <p className="text-xs text-muted-foreground">
              {t(baseUrlHintKey)}
            </p>
          </div>
          <div className="flex-shrink-0 w-80">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={handleBlurSave}
              disabled={saveProviderMutation.isPending}
              className="w-full"
              placeholder="https://api.deepseek.com"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgentsModelsTab() {
  const { t } = useI18n()
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [token, setToken] = useState("")
  const helperApisSectionRef = useRef<HTMLDivElement | null>(null)
  const [modelsSettingsTarget, setModelsSettingsTarget] = useAtom(
    modelsSettingsTargetAtom,
  )
  const [authMode, setAuthMode] =
    useState<ClaudeProviderAuthMode>("auth_token")
  const setClaudeLoginModalConfig = useSetAtom(claudeLoginModalConfigAtom)
  const setClaudeLoginModalOpen = useSetAtom(agentsLoginModalOpenAtom)
  const setCodexLoginModalOpen = useSetAtom(codexLoginModalOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const isLocalOnly = useLocalOnlyMode()
  const { data: providerConfigData } =
    trpc.claudeProviderConfig.get.useQuery()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected
  const { data: codexIntegration, isLoading: isCodexLoading } =
    trpc.codex.getIntegration.useQuery()

  // OpenAI API key state
  const [storedCodexApiKey, setStoredCodexApiKey] = useAtom(codexApiKeyAtom)
  const [codexApiKey, setCodexApiKey] = useState(storedCodexApiKey)
  const [isSavingCodexApiKey, setIsSavingCodexApiKey] = useState(false)
  const codexOnboardingCompleted = useAtomValue(codexOnboardingCompletedAtom)
  const codexOnboardingAuthMethod = useAtomValue(codexOnboardingAuthMethodAtom)
  const setLastSelectedCodexModelSource = useSetAtom(
    lastSelectedCodexModelSourceAtom,
  )
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const codexLogoutMutation = trpc.codex.logout.useMutation()
  const trpcUtils = trpc.useUtils()
  const saveProviderConfigMutation = trpc.claudeProviderConfig.save.useMutation()
  const clearProviderConfigMutation = trpc.claudeProviderConfig.clear.useMutation()

  useEffect(() => {
    if (!providerConfigData) return

    const config = providerConfigData.config
    setModel(config?.model ?? "")
    setBaseUrl(config?.baseUrl ?? "")
    setAuthMode(config?.authMode ?? "auth_token")
    setToken("")
  }, [providerConfigData])

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  useEffect(() => {
    setCodexApiKey(storedCodexApiKey)
  }, [storedCodexApiKey])

  useEffect(() => {
    if (modelsSettingsTarget !== "helper-apis") return

    const timeoutId = window.setTimeout(() => {
      helperApisSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      setModelsSettingsTarget(null)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [modelsSettingsTarget, setModelsSettingsTarget])

  const handleBlurSave = useCallback((nextAuthMode: ClaudeProviderAuthMode = authMode) => {
    const trimmedModel = model.trim()
    const trimmedBaseUrl = baseUrl.trim()
    const trimmedToken = token.trim()
    const storedConfig = providerConfigData?.config
    const hasStoredToken = Boolean(storedConfig?.hasToken)

    if (trimmedModel && trimmedBaseUrl && (trimmedToken || hasStoredToken)) {
      const metadataChanged =
        !storedConfig ||
        storedConfig.model !== trimmedModel ||
        storedConfig.baseUrl !== trimmedBaseUrl ||
        storedConfig.authMode !== nextAuthMode

      if (!metadataChanged && !trimmedToken) return

      saveProviderConfigMutation.mutate(
        {
          model: trimmedModel,
          baseUrl: trimmedBaseUrl,
          authMode: nextAuthMode,
          ...(trimmedToken && { token: trimmedToken }),
        },
        {
          onSuccess: async () => {
            setToken("")
            await trpcUtils.claudeProviderConfig.get.invalidate()
            toast.success(t("toast.models.modelSettingsSaved"))
          },
          onError: (error) => {
            toast.error(error.message || t("toast.models.failedToSaveModelSettings"))
          },
        },
      )
    } else if (!trimmedModel && !trimmedBaseUrl && !trimmedToken) {
      if (storedConfig) {
        clearProviderConfigMutation.mutate(undefined, {
          onSuccess: async () => {
            await trpcUtils.claudeProviderConfig.get.invalidate()
            toast.success(t("toast.models.modelSettingsReset"))
          },
          onError: (error) => {
            toast.error(error.message || t("toast.models.failedToResetModelSettings"))
          },
        })
      }
    }
  }, [
    authMode,
    baseUrl,
    clearProviderConfigMutation,
    model,
    providerConfigData?.config,
    saveProviderConfigMutation,
    t,
    token,
    trpcUtils.claudeProviderConfig.get,
  ])

  const handleAuthModeChange = (nextAuthMode: ClaudeProviderAuthMode) => {
    setAuthMode(nextAuthMode)
    handleBlurSave(nextAuthMode)
  }

  const handleReset = () => {
    clearProviderConfigMutation.mutate(undefined, {
      onSuccess: async () => {
        setModel("")
        setBaseUrl("")
        setToken("")
        setAuthMode("auth_token")
        await trpcUtils.claudeProviderConfig.get.invalidate()
        toast.success(t("toast.models.modelSettingsReset"))
      },
      onError: (error) => {
        toast.error(error.message || t("toast.models.failedToResetModelSettings"))
      },
    })
  }

  const canReset = Boolean(
    model.trim() ||
      baseUrl.trim() ||
      token.trim() ||
      providerConfigData?.config?.hasToken,
  )

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
    const confirmed = window.confirm(
      t("settings.models.codexLogoutConfirm"),
    )
    if (!confirmed) return

    try {
      await codexLogoutMutation.mutateAsync()
      await trpcUtils.codex.getIntegration.invalidate()
      toast.success(t("toast.models.codexDisconnected"))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("toast.models.failedToDisconnectCodex")
      toast.error(message)
    }
  }

  const normalizedStoredCodexApiKey = normalizeCodexApiKey(storedCodexApiKey)
  const hasAppCodexApiKey = Boolean(normalizedStoredCodexApiKey)
  const hasLocalCodexSubscription =
    codexOnboardingCompleted && codexOnboardingAuthMethod === "chatgpt"
  const isCodexSubscriptionConnected =
    codexIntegration?.state === "connected_chatgpt" ||
    (!codexIntegration && hasLocalCodexSubscription)
  const isCodexSubscriptionActive =
    isCodexSubscriptionConnected && !hasAppCodexApiKey
  const [hiddenModels, setHiddenModels] = useAtom(hiddenModelsAtom)

  const toggleModelVisibility = useCallback((modelId: string) => {
    setHiddenModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      }
      return [...prev, modelId]
    })
  }, [setHiddenModels])

  const codexConnectionText = isCodexSubscriptionConnected
    ? t("settings.models.codex.connectedViaChatGPT")
    : codexIntegration?.state === "connected_api_key"
      ? t("settings.models.codex.notConnectedToSubscription")
      : codexIntegration?.state === "not_logged_in"
        ? t("settings.models.codex.notConnected")
        : t("settings.models.codex.statusUnavailable")
  const showCodexLoading =
    isCodexLoading && !hasAppCodexApiKey && !hasLocalCodexSubscription

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleCodexApiKeyBlur = async () => {
    const trimmedKey = codexApiKey.trim()

    if (trimmedKey === storedCodexApiKey) return
    if (!trimmedKey) return

    const normalized = normalizeCodexApiKey(trimmedKey)
    if (!normalized) {
      toast.error(t("toast.models.invalidCodexApiKey"))
      setCodexApiKey(storedCodexApiKey)
      return
    }

    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey(normalized)
      setCodexApiKey(normalized)
      setLastSelectedCodexModelSource("openai-api-key")
      await trpcUtils.codex.getIntegration.invalidate()
      toast.success(t("toast.models.codexApiKeySaved"))
    } catch {
      toast.error(t("toast.models.failedToSaveCodexApiKey"))
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleRemoveCodexApiKey = async () => {
    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey("")
      setCodexApiKey("")
      setLastSelectedCodexModelSource("chatgpt")

      if (codexIntegration?.state === "connected_api_key") {
        await codexLogoutMutation.mutateAsync().catch(() => {
          toast.error(t("toast.models.codexApiKeyRemovedLogoutFailed"))
        })
      }

      await trpcUtils.codex.getIntegration.invalidate()
      toast.success(t("toast.models.codexApiKeyRemoved"))
    } catch {
      toast.error(t("toast.models.failedToRemoveCodexApiKey"))
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey === storedOpenAIKey) return // No change
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error(t("toast.models.invalidOpenaiApiKey"))
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success(t("toast.models.openaiApiKeySaved"))
    } catch (err) {
      toast.error(t("toast.models.failedToSaveOpenaiApiKey"))
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success(t("toast.models.openaiApiKeyRemoved"))
    } catch (err) {
      toast.error(t("toast.models.failedToRemoveOpenaiApiKey"))
    }
  }

  // All models merged into one list for the top section
  const allModels = useMemo(() => {
    const items: { id: string; name: string; provider: "claude" | "codex" }[] = []
    for (const m of CLAUDE_MODELS) {
      items.push({ id: m.id, name: `${m.name} ${m.version}`, provider: "claude" })
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

  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false)

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
                    <Badge variant="secondary" className="text-xs">
                      {t("common.active")}
                    </Badge>
                  )}
                  {isCodexSubscriptionConnected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexLogout()}
                      disabled={codexLogoutMutation.isPending}
                    >
                      {codexLogoutMutation.isPending
                        ? "..."
                        : t("settings.models.codex.logout")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexSetup()}
                      disabled={
                        isCodexLoading ||
                        codexLogoutMutation.isPending ||
                        isSavingCodexApiKey
                      }
                    >
                      {t("common.connect")}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

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
      </div>

      {/* ===== API Keys Section (Collapsible) ===== */}
      <Collapsible open={isApiKeysOpen} onOpenChange={setIsApiKeysOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors">
          <ChevronDown className={`h-4 w-4 transition-transform ${isApiKeysOpen ? "" : "-rotate-90"}`} />
          {t("settings.models.apiKeys")}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {/* Codex API Key */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Codex API Key</Label>
                  {hasAppCodexApiKey && (
                    <Badge variant="secondary" className="text-xs">
                      {t("common.active")}
                    </Badge>
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
                  className="w-full font-mono"
                  placeholder="sk-..."
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
          </div>

          {/* OpenAI API Key for Voice Input */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">OpenAI API Key</Label>
                  {canResetOpenAI && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetOpenAI}
                      disabled={setOpenAIKeyMutation.isPending}
                      className="h-5 px-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                    >
                      {t("common.remove")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.models.openaiApiKey.description")}
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  onBlur={handleSaveOpenAI}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          {/* Override Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">
                {t("settings.models.overrideModel.title")}
              </h4>
              {canReset && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={clearProviderConfigMutation.isPending}
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
                  <p className="text-xs text-muted-foreground">
                    {t("settings.models.overrideModel.modelHint")}
                  </p>
                </div>
                <div className="flex-shrink-0 w-80">
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    onBlur={() => handleBlurSave()}
                    disabled={saveProviderConfigMutation.isPending}
                    className="w-full"
                    placeholder="claude-sonnet-4-6"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex-1">
                  <Label className="text-sm font-medium">
                    {t("onboarding.customModel.apiToken")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {authMode === "api_key"
                      ? "ANTHROPIC_API_KEY env"
                      : "ANTHROPIC_AUTH_TOKEN env"}
                  </p>
                </div>
                <div className="flex-shrink-0 w-80">
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    onBlur={() => handleBlurSave()}
                    disabled={saveProviderConfigMutation.isPending}
                    className="w-full"
                    placeholder={
                      providerConfigData?.config?.hasToken
                        ? t("common.savedToken")
                        : "sk-ant-..."
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex-1">
                  <Label className="text-sm font-medium">
                    {t("onboarding.customModel.authEnv")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.models.overrideModel.authHint")}
                  </p>
                </div>
                <div className="grid w-80 grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={authMode === "api_key" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleAuthModeChange("api_key")}
                    disabled={saveProviderConfigMutation.isPending}
                    className="text-xs"
                  >
                    API_KEY
                  </Button>
                  <Button
                    type="button"
                    variant={authMode === "auth_token" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleAuthModeChange("auth_token")}
                    disabled={saveProviderConfigMutation.isPending}
                    className="text-xs"
                  >
                    AUTH_TOKEN
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex-1">
                  <Label className="text-sm font-medium">Base URL</Label>
                  <p className="text-xs text-muted-foreground">
                    ANTHROPIC_BASE_URL env
                  </p>
                </div>
                <div className="flex-shrink-0 w-80">
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    onBlur={() => handleBlurSave()}
                    disabled={saveProviderConfigMutation.isPending}
                    className="w-full"
                    placeholder="https://api.anthropic.com"
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
