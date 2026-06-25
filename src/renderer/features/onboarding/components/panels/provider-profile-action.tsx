"use client"

import { useSetAtom } from "jotai"
import { CheckCircle2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { providerProfileSource } from "../../../../../shared/provider-profile-types"
import { IconSpinner } from "../../../../components/ui/icons"
import { Input } from "../../../../components/ui/input"
import { useI18n } from "../../../../lib/i18n"
import { trpc } from "../../../../lib/trpc"
import {
  type ClaudeModelSource,
  lastSelectedClaudeModelSourceAtom,
} from "../../../agents/atoms"

const isValidApiKey = (key: string) => {
  const trimmed = key.trim()
  return trimmed.startsWith("sk-ant-") && trimmed.length > 20
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Simple first-party Anthropic API-key paste. Saves a Claude-targeted Provider
 * Profile (the canonical path). Other / custom providers use the shared
 * {@link ProviderProfileEditor} instead.
 */
export function ProviderProfileAction() {
  const { t } = useI18n()
  const setLastSelectedClaudeModelSource = useSetAtom(
    lastSelectedClaudeModelSourceAtom,
  )
  const trpcUtils = trpc.useUtils()
  const saveProviderProfile = trpc.providerProfiles.saveProfile.useMutation()
  const providerProfiles = trpc.providerProfiles.listProfiles.useQuery(
    undefined,
    { staleTime: 30_000 },
  )
  const secureProviderConfig = trpc.claudeProviderConfig.get.useQuery(
    undefined,
    { staleTime: 30_000 },
  )

  const [apiKey, setApiKey] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const canSubmit = isValidApiKey(apiKey) && !isSubmitting
  // Only a genuine first-party Anthropic credential counts as "already
  // connected" here — a custom claude-target profile (a third-party gateway) is
  // owned by the Custom path and must not claim "Anthropic API key connected".
  const anthropicProfile = useMemo(
    () =>
      (providerProfiles.data?.profiles ?? []).find(
        (profile) =>
          profile.protocol === "anthropic" &&
          profile.targetRuntimes.includes("claude") &&
          profile.lastTestStatus?.ok !== false,
      ),
    [providerProfiles.data?.profiles],
  )
  const alreadyConnected =
    Boolean(anthropicProfile) ||
    Boolean(secureProviderConfig.data?.config?.hasToken)

  const submitApiKey = () => {
    const key = apiKey
    if (!isValidApiKey(key)) return

    setSubmissionError(null)
    setIsSubmitting(true)

    saveProviderProfile.mutate(
      {
        name: "Anthropic API Key",
        presetId: null,
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-6",
        authMode: "x-api-key",
        token: key.trim(),
        targetRuntimes: ["claude"],
        capabilities: {
          claude: true,
          streaming: true,
          tools: true,
          vision: true,
        },
      },
      {
        onSuccess: async ({ profile }) => {
          await trpcUtils.providerProfiles.listProfiles.invalidate()
          await trpcUtils.claudeProviderConfig.get.invalidate()
          setLastSelectedClaudeModelSource(
            providerProfileSource(profile.id) as ClaudeModelSource,
          )
          setApiKey("")
        },
        onError: (error) => {
          const message = getErrorMessage(error)
          setSubmissionError(message)
          toast.error(t("toast.models.failedToSaveProviderProfile"), {
            description: message,
          })
        },
        onSettled: () => setIsSubmitting(false),
      },
    )
  }

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setApiKey(value)
    setSubmissionError(null)
  }

  const handleApiKeyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && apiKey.trim()) {
      submitApiKey()
    }
  }

  if (alreadyConnected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {t("onboarding.apiKey.alreadyConnected")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("onboarding.apiKey.subtitle")}{" "}
        <a
          href="https://console.anthropic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:underline"
        >
          console.anthropic.com
        </a>
      </p>
      <div className="relative">
        <Input
          value={apiKey}
          onChange={handleApiKeyChange}
          onKeyDown={handleApiKeyKeyDown}
          placeholder="sk-ant-..."
          className="font-mono pr-10"
          autoFocus
          disabled={isSubmitting}
        />
        {isSubmitting && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <IconSpinner className="h-4 w-4" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={submitApiKey}
        disabled={!canSubmit}
        className="flex h-8 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)]"
      >
        {isSubmitting ? (
          <IconSpinner className="h-4 w-4" />
        ) : (
          t("common.connect")
        )}
      </button>
      <p className="text-xs text-muted-foreground">
        {t("onboarding.apiKey.hint")}
      </p>
      {submissionError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-medium">
            {t("toast.models.failedToSaveProviderProfile")}
          </p>
          <p className="mt-1 leading-relaxed">{submissionError}</p>
        </div>
      )}
    </div>
  )
}
