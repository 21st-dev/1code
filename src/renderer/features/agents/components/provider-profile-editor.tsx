"use client"

import { Plus, ShieldCheck, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  type ProviderProfileAuthMode,
  type ProviderProfileMetadata,
  type ProviderProfileProtocol,
  type ProviderProfileTarget,
  providerProfileAuthModes,
  providerProfileProtocols,
  providerProfileTargets,
} from "../../../../shared/provider-profile-types"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { type TranslationKey, useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"

const PROVIDER_TARGET_LABEL_KEYS: Record<
  ProviderProfileTarget,
  TranslationKey
> = {
  claude: "settings.models.providerProfiles.targetClaude",
  codex: "settings.models.providerProfiles.targetCodex",
  helpers: "settings.models.providerProfiles.targetHelpers",
  local: "settings.models.providerProfiles.targetLocal",
}

const PROVIDER_AUTH_MODE_LABEL_KEYS: Record<
  ProviderProfileAuthMode,
  TranslationKey
> = {
  bearer: "settings.models.providerProfiles.authBearer",
  "x-api-key": "settings.models.providerProfiles.authXApiKey",
  none: "settings.models.providerProfiles.authNone",
}

export function getProviderTargetLabel(
  target: ProviderProfileTarget,
  t: (key: TranslationKey) => string,
) {
  return t(PROVIDER_TARGET_LABEL_KEYS[target])
}

export function getProviderAuthModeLabel(
  mode: ProviderProfileAuthMode,
  t: (key: TranslationKey) => string,
) {
  return t(PROVIDER_AUTH_MODE_LABEL_KEYS[mode])
}

export function getPresetRegionLabel(
  region: string,
  t: (key: TranslationKey) => string,
) {
  switch (region) {
    case "china":
      return t("settings.models.providerProfiles.regionChina")
    case "global":
      return t("settings.models.providerProfiles.regionGlobal")
    case "local":
      return t("settings.models.providerProfiles.regionLocal")
    default:
      return t("settings.models.providerProfiles.regionGeneric")
  }
}

export type ProviderHeaderDraftRow = {
  id: string
  key: string
  value: string
  existing: boolean
}

let providerHeaderDraftId = 0

export function createProviderHeaderDraftRow(
  input: Partial<Omit<ProviderHeaderDraftRow, "id">> = {},
): ProviderHeaderDraftRow {
  providerHeaderDraftId += 1
  return {
    id: `provider-header-${providerHeaderDraftId}`,
    key: input.key ?? "",
    value: input.value ?? "",
    existing: input.existing ?? false,
  }
}

export function providerHeaderRowsFromMetadata(
  headers: Record<string, string>,
): ProviderHeaderDraftRow[] {
  return Object.keys(headers)
    .sort((a, b) => a.localeCompare(b))
    .map((key) =>
      createProviderHeaderDraftRow({ key, value: "", existing: true }),
    )
}

export function providerHeadersFromRows(
  rows: ProviderHeaderDraftRow[],
): Record<string, string> | null {
  const headers: Record<string, string> = {}
  const seenKeys = new Set<string>()

  for (const row of rows) {
    const key = row.key.trim()
    const value = row.value.trim()
    if (!key && !value) continue
    if (!key || !value) return null

    const normalizedKey = key.toLowerCase()
    if (seenKeys.has(normalizedKey)) return null
    seenKeys.add(normalizedKey)
    headers[key] = value
  }

  return headers
}

export type ProviderProfileEditorProps = {
  /** When set, the editor edits this profile; otherwise it creates a new one. */
  editingProfile?: ProviderProfileMetadata
  onSaved?: (profile: ProviderProfileMetadata) => void
  /** Called when the user resets (parent may clear its editing selection). */
  onReset?: () => void
  /** Compact mode for narrow hosts (onboarding): preset shown as a dropdown
   * instead of a chip wall. Fields stay container-responsive either way. */
  dense?: boolean
  className?: string
}

/**
 * Canonical provider-profile create/edit form (preset picker, protocol, auth,
 * targets, custom headers). Shared by Settings → Models and first-run onboarding
 * so the two never diverge. Saves through `providerProfiles.saveProfile`.
 */
export function ProviderProfileEditor({
  editingProfile,
  onSaved,
  onReset,
  dense = false,
  className,
}: ProviderProfileEditorProps) {
  const { t } = useI18n()
  // Container-responsive (auto-fit) rather than viewport breakpoints, so the
  // fields wrap to one column only when the host column is genuinely narrow.
  const fieldPairClass =
    "grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]"
  const trpcUtils = trpc.useUtils()
  const { data: presetsData } = trpc.providerProfiles.listPresets.useQuery()
  const saveProfileMutation = trpc.providerProfiles.saveProfile.useMutation()
  const presets = presetsData?.presets ?? []

  const editingId = editingProfile?.id
  const [presetId, setPresetId] = useState(editingProfile?.presetId ?? "")
  const [name, setName] = useState(editingProfile?.name ?? "")
  const [protocol, setProtocol] = useState<ProviderProfileProtocol>(
    editingProfile?.protocol ?? "openai-chat",
  )
  const [baseUrl, setBaseUrl] = useState(editingProfile?.baseUrl ?? "")
  const [defaultModel, setDefaultModel] = useState(
    editingProfile?.defaultModel ?? "",
  )
  const [authMode, setAuthMode] = useState<ProviderProfileAuthMode>(
    editingProfile?.authMode ?? "bearer",
  )
  const [token, setToken] = useState("")
  const [headerRows, setHeaderRows] = useState<ProviderHeaderDraftRow[]>(
    editingProfile
      ? providerHeaderRowsFromMetadata(editingProfile.headers)
      : [],
  )
  const [headersDirty, setHeadersDirty] = useState(false)
  const [targetRuntimes, setTargetRuntimes] = useState<ProviderProfileTarget[]>(
    editingProfile ? [...editingProfile.targetRuntimes] : ["claude"],
  )

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === presetId),
    [presetId, presets],
  )
  const formIdPrefix = editingId
    ? `provider-profile-${editingId}`
    : "provider-profile-new"
  const destinationChanged = Boolean(
    editingProfile &&
      (editingProfile.baseUrl !== baseUrl.trim() ||
        editingProfile.protocol !== protocol ||
        editingProfile.authMode !== authMode),
  )
  const tokenRefreshRequired = Boolean(
    editingProfile?.hasToken &&
      destinationChanged &&
      authMode !== "none" &&
      !token.trim(),
  )

  const applyPreset = useCallback(
    (nextPresetId: string) => {
      const preset = presets.find((item) => item.id === nextPresetId)
      if (!preset) return
      setPresetId(preset.id)
      setName(preset.name)
      setProtocol(preset.protocol)
      setBaseUrl(preset.baseUrl)
      setDefaultModel(preset.defaultModel)
      setAuthMode(preset.authMode)
      setToken("")
      setHeaderRows([])
      setHeadersDirty(false)
      setTargetRuntimes([...preset.targetRuntimes])
    },
    [presets],
  )

  // Default-select the first preset for a fresh (non-editing) form.
  useEffect(() => {
    if (editingProfile || presetId) return
    const firstPreset = presets[0]
    if (firstPreset) applyPreset(firstPreset.id)
  }, [applyPreset, editingProfile, presetId, presets])

  const addHeaderRow = () => {
    setHeadersDirty(true)
    setHeaderRows((current) => [...current, createProviderHeaderDraftRow()])
  }

  const updateHeaderRow = (
    rowId: string,
    field: "key" | "value",
    value: string,
  ) => {
    setHeadersDirty(true)
    setHeaderRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, [field]: value, existing: false } : row,
      ),
    )
  }

  const removeHeaderRow = (rowId: string) => {
    setHeadersDirty(true)
    setHeaderRows((current) => current.filter((row) => row.id !== rowId))
  }

  const toggleTarget = (target: ProviderProfileTarget) => {
    setTargetRuntimes((current) =>
      current.includes(target)
        ? current.filter((item) => item !== target)
        : [...current, target],
    )
  }

  const handleReset = () => {
    if (onReset) {
      onReset()
      return
    }
    setToken("")
    if (presetId) applyPreset(presetId)
    else if (presets[0]) applyPreset(presets[0].id)
  }

  const canSaveProfile = Boolean(
    name.trim() &&
      baseUrl.trim() &&
      defaultModel.trim() &&
      targetRuntimes.length > 0 &&
      (authMode === "none" || token.trim() || editingProfile?.hasToken) &&
      !tokenRefreshRequired,
  )

  const handleSaveProfile = () => {
    if (tokenRefreshRequired) {
      toast.error(t("settings.models.providerProfiles.tokenRefreshRequired"))
      return
    }

    let headers: Record<string, string> | undefined
    if (headersDirty) {
      const parsedHeaders = providerHeadersFromRows(headerRows)
      if (parsedHeaders === null) {
        toast.error(t("settings.models.providerProfiles.invalidHeaders"))
        return
      }
      headers = parsedHeaders
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
        ...(headers !== undefined ? { headers } : {}),
        targetRuntimes,
        capabilities: {
          ...(selectedPreset?.capabilities ??
            editingProfile?.capabilities ??
            {}),
          claude: targetRuntimes.includes("claude"),
          codex: targetRuntimes.includes("codex"),
          helpers: targetRuntimes.includes("helpers"),
          local: targetRuntimes.includes("local"),
        },
      },
      {
        onSuccess: async ({ profile }) => {
          setToken("")
          await Promise.all([
            trpcUtils.providerProfiles.listProfiles.invalidate(),
            trpcUtils.providerProfiles.getDefaults.invalidate(),
          ])
          toast.success(t("toast.models.providerProfileSaved"))
          onSaved?.(profile)
        },
        onError: (error) => {
          toast.error(
            error.message || t("toast.models.failedToSaveProviderProfile"),
          )
        },
      },
    )
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {editingId
              ? t("settings.models.providerProfiles.editing")
              : t("settings.models.providerProfiles.create")}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {selectedPreset?.region
              ? `${selectedPreset.name} · ${getPresetRegionLabel(selectedPreset.region, t)}`
              : t("settings.models.providerProfiles.customPreset")}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {t("settings.models.providerProfiles.preset")}
        </Label>
        {dense ? (
          <Select
            value={presetId}
            onValueChange={(value) => applyPreset(value)}
          >
            <SelectTrigger className="h-9">
              <SelectValue
                placeholder={t("settings.models.providerProfiles.preset")}
              />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name} · {getPresetRegionLabel(preset.region, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-wrap gap-2" role="listbox">
            {presets.map((preset) => {
              const selected = presetId === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span>{preset.name}</span>
                  <span
                    className={cn(
                      "rounded px-1 py-px text-[9px] font-semibold",
                      selected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    {getPresetRegionLabel(preset.region, t)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("settings.models.providerProfiles.presetHint")}
        </p>
      </div>

      <div className={fieldPairClass}>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formIdPrefix}-name`}
            className="text-sm font-medium"
          >
            {t("settings.models.providerProfiles.name")}
          </Label>
          <Input
            id={`${formIdPrefix}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formIdPrefix}-base-url`}
            className="text-sm font-medium"
          >
            {t("common.baseUrl")}
          </Label>
          <Input
            id={`${formIdPrefix}-base-url`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      </div>

      <div className={fieldPairClass}>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formIdPrefix}-model`}
            className="text-sm font-medium"
          >
            {t("onboarding.customModel.modelName")}
          </Label>
          <Input
            id={`${formIdPrefix}-model`}
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="model-id"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formIdPrefix}-protocol`}
            className="text-sm font-medium"
          >
            {t("common.protocol")}
          </Label>
          <Select
            value={protocol}
            onValueChange={(value) =>
              setProtocol(value as ProviderProfileProtocol)
            }
          >
            <SelectTrigger id={`${formIdPrefix}-protocol`} className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerProfileProtocols.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={fieldPairClass}>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formIdPrefix}-auth`}
            className="text-sm font-medium"
          >
            {t("common.auth")}
          </Label>
          <Select
            value={authMode}
            onValueChange={(value) =>
              setAuthMode(value as ProviderProfileAuthMode)
            }
          >
            <SelectTrigger id={`${formIdPrefix}-auth`} className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerProfileAuthModes.map((item) => (
                <SelectItem key={item} value={item}>
                  {getProviderAuthModeLabel(item, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formIdPrefix}-token`}
            className="text-sm font-medium"
          >
            {t("common.apiKey")}
          </Label>
          <Input
            id={`${formIdPrefix}-token`}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              editingProfile?.hasToken ? t("common.savedToken") : "sk-..."
            }
            disabled={authMode === "none"}
          />
          {tokenRefreshRequired && (
            <p className="text-xs text-amber-600 dark:text-amber-300">
              {t("settings.models.providerProfiles.tokenRefreshRequired")}
            </p>
          )}
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
              aria-pressed={targetRuntimes.includes(target)}
              className={cn(
                "min-h-8 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
                targetRuntimes.includes(target)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {getProviderTargetLabel(target, t)}
            </button>
          ))}
        </div>
        {dense && targetRuntimes.includes("helpers") && (
          <p className="text-xs text-muted-foreground">
            {t("settings.models.providerProfiles.helperModelHint")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-medium">
            {t("settings.models.providerProfiles.headers")}
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addHeaderRow}
            className="h-7 gap-1 px-2 text-xs"
          >
            <Plus className="h-3 w-3" />
            {t("settings.models.providerProfiles.addHeader")}
          </Button>
        </div>
        {headerRows.length > 0 && (
          <div className="space-y-1.5">
            {headerRows.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_2rem]"
              >
                <Input
                  id={`${formIdPrefix}-header-key-${row.id}`}
                  value={row.key}
                  onChange={(e) =>
                    updateHeaderRow(row.id, "key", e.target.value)
                  }
                  placeholder="HTTP-Referer"
                  aria-label={`${t("settings.models.providerProfiles.headerKey")} ${index + 1}`}
                />
                <Input
                  id={`${formIdPrefix}-header-value-${row.id}`}
                  value={row.value}
                  onChange={(e) =>
                    updateHeaderRow(row.id, "value", e.target.value)
                  }
                  placeholder={
                    row.existing
                      ? t("settings.models.providerProfiles.savedHeaderValue")
                      : "https://example.com"
                  }
                  aria-label={`${t("settings.models.providerProfiles.headerValue")} ${index + 1}`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeHeaderRow(row.id)}
                  aria-label={t(
                    "settings.models.providerProfiles.removeHeader",
                  )}
                  className="h-8 w-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("settings.models.providerProfiles.headersHint")}
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveProfile}
            disabled={!canSaveProfile || saveProfileMutation.isPending}
          >
            {saveProfileMutation.isPending
              ? t("common.saving")
              : t("common.save")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            {t("common.reset")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.models.providerProfiles.secretNotice")}
        </p>
      </div>
    </div>
  )
}
