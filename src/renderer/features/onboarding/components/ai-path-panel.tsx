"use client"

import { useAtom, useSetAtom } from "jotai"
import type { ReactNode } from "react"
import { providerProfileSource } from "../../../../shared/provider-profile-types"
import {
  ClaudeCodeIcon,
  CodexIcon,
  SettingsFilledIcon,
} from "../../../components/ui/icons"
import { onboardingProviderModeAtom } from "../../../lib/atoms"
import { type TranslationKey, useI18n } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import {
  type ClaudeModelSource,
  lastSelectedClaudeModelSourceAtom,
} from "../../agents/atoms"
import { ProviderProfileEditor } from "../../agents/components/provider-profile-editor"
import {
  ONBOARDING_PATHS,
  type OnboardingPathId,
  pathStatus,
  pathToProviderMode,
  providerModeToPath,
  recommendedPath,
} from "../lib/onboarding-status"
import type { SetupStatus } from "../lib/use-setup-status"
import { ClaudeCodeAction } from "./panels/claude-code-action"
import { CodexAction } from "./panels/codex-action"
import { ProviderProfileAction } from "./panels/provider-profile-action"
import { StatusBadge } from "./status-badge"

type PathMeta = {
  icon: ReactNode
  iconClass: string
  titleKey: TranslationKey
  hintKey: TranslationKey
}

const PATH_META: Record<OnboardingPathId, PathMeta> = {
  claude: {
    icon: <ClaudeCodeIcon className="h-5 w-5" />,
    iconClass: "bg-[#D97757] text-white",
    titleKey: "onboarding.path.claude",
    hintKey: "onboarding.path.claudeHint",
  },
  codex: {
    icon: <CodexIcon className="h-5 w-5" />,
    iconClass: "bg-foreground text-background",
    titleKey: "onboarding.path.codex",
    hintKey: "onboarding.path.codexHint",
  },
  "custom-provider": {
    icon: <SettingsFilledIcon className="h-5 w-5" />,
    iconClass: "bg-muted text-foreground",
    titleKey: "onboarding.path.customProvider",
    hintKey: "onboarding.path.customProviderHint",
  },
}

/**
 * Claude is one provider with two billing methods — subscription login and an
 * Anthropic API key — toggled inside the card (mirroring Codex).
 */
function ClaudeAction() {
  const { t } = useI18n()
  const [providerMode, setProviderMode] = useAtom(onboardingProviderModeAtom)
  const isApiKey = providerMode === "api-key"
  return (
    <div className="space-y-4">
      <div className="flex items-center rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => setProviderMode("claude-subscription")}
          className={cn(
            "h-8 flex-1 rounded-full text-sm font-medium transition-colors",
            !isApiKey
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("onboarding.claude.tabSubscription")}
        </button>
        <button
          type="button"
          onClick={() => setProviderMode("api-key")}
          className={cn(
            "h-8 flex-1 rounded-full text-sm font-medium transition-colors",
            isApiKey
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("onboarding.claude.tabApiKey")}
        </button>
      </div>
      {isApiKey ? <ProviderProfileAction /> : <ClaudeCodeAction />}
    </div>
  )
}

/** Custom provider uses the canonical shared editor (presets + protocol). */
function CustomProviderAction() {
  const setLastSelectedClaudeModelSource = useSetAtom(
    lastSelectedClaudeModelSourceAtom,
  )
  return (
    <ProviderProfileEditor
      dense
      onSaved={(profile) => {
        if (profile.targetRuntimes.includes("claude")) {
          setLastSelectedClaudeModelSource(
            providerProfileSource(profile.id) as ClaudeModelSource,
          )
        }
      }}
    />
  )
}

function PathAction({ path }: { path: OnboardingPathId }) {
  switch (path) {
    case "claude":
      return <ClaudeAction />
    case "codex":
      return <CodexAction />
    case "custom-provider":
      return <CustomProviderAction />
  }
}

export function AiPathPanel({ status }: { status: SetupStatus }) {
  const { t } = useI18n()
  const [providerMode, setProviderMode] = useAtom(onboardingProviderModeAtom)
  const recommended = recommendedPath(status)
  const selectedPath = providerModeToPath(providerMode) ?? recommended
  const selectedMeta = PATH_META[selectedPath]

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold leading-5">
          {t("onboarding.section.aiPath")}
        </h2>
        <span className="hidden text-[11.5px] text-muted-foreground sm:block">
          {t("onboarding.aiPath.subhead")}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-2">
          {ONBOARDING_PATHS.map((path) => {
            const meta = PATH_META[path]
            const isSelected = path === selectedPath
            return (
              <button
                type="button"
                key={path}
                onClick={() => setProviderMode(pathToProviderMode(path))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-[border-color,background-color]",
                  isSelected
                    ? "border-[1.5px] border-primary/60 bg-primary/[0.04]"
                    : "border-[0.5px] border-border hover:border-foreground/25 hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    meta.iconClass,
                  )}
                >
                  {meta.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium leading-5">
                      {t(meta.titleKey)}
                    </span>
                    {path === recommended && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {t("onboarding.billing.recommended")}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {t(meta.hintKey)}
                  </span>
                </span>
                <StatusBadge status={pathStatus(path, status)} />
              </button>
            )
          })}
        </div>

        <div className="min-w-0 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          <div className="mb-3 flex items-center gap-3">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                selectedMeta.iconClass,
              )}
            >
              {selectedMeta.icon}
            </span>
            <h3 className="text-[13px] font-medium leading-5">
              {t(selectedMeta.titleKey)}
            </h3>
          </div>
          <PathAction path={selectedPath} />
        </div>
      </div>
    </div>
  )
}
