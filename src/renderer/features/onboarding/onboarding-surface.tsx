"use client"

import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { LanguageSwitcher } from "../../components/language-switcher"
import { Logo } from "../../components/ui/logo"
import { onboardingProviderModeAtom } from "../../lib/atoms"
import { useI18n } from "../../lib/i18n"
import { AiPathPanel } from "./components/ai-path-panel"
import { StartContextPanel } from "./components/panels/start-context-panel"
import {
  type RailRow,
  type RailRowId,
  StatusRail,
} from "./components/status-rail"
import {
  pathStatus,
  providerModeToPath,
  recommendedPath,
} from "./lib/onboarding-status"
import { useSetupStatus } from "./lib/use-setup-status"

/**
 * Single first-run setup surface: a status rail of the two concerns (AI provider
 * and project) beside an active panel. Readiness is derived from the
 * provider/runtime/project owners.
 */
export function OnboardingSurface() {
  const { t } = useI18n()
  const status = useSetupStatus()
  const providerMode = useAtomValue(onboardingProviderModeAtom)
  const selectedPath =
    providerModeToPath(providerMode) ?? recommendedPath(status)

  const [activeRow, setActiveRow] = useState<RailRowId>(
    status.anyUsableAiPath ? "start-context" : "ai-path",
  )

  // After a path first becomes usable, move focus to the project step (once).
  const advancedRef = useRef(false)
  useEffect(() => {
    if (
      status.anyUsableAiPath &&
      !status.hasProject &&
      !advancedRef.current &&
      activeRow !== "start-context"
    ) {
      advancedRef.current = true
      setActiveRow("start-context")
    }
  }, [status.anyUsableAiPath, status.hasProject, activeRow])

  // Two concerns only: which provider (its sign-in/key/runtime status) and the
  // project. A separate "runtime" row was misleading — it read "ready" off the
  // bundled runtime even when the provider still needed sign-in.
  const rows: RailRow[] = [
    {
      id: "ai-path",
      label: t("onboarding.section.aiPath"),
      status: pathStatus(selectedPath, status),
    },
    {
      id: "start-context",
      label: t("onboarding.section.startContext"),
      status: status.hasProject ? "ready" : "optional",
      disabled: !status.anyUsableAiPath,
    },
  ]

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      <div
        className="fixed top-0 left-0 right-0 z-20 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <LanguageSwitcher compact className="fixed top-3 right-4 z-30" />

      <aside className="hidden w-[272px] shrink-0 flex-col gap-6 border-r border-border bg-muted/20 px-6 pb-6 pt-14 md:flex">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <Logo className="h-3.5 w-3.5" fill="white" />
          </span>
          <span className="text-sm font-medium">Locus</span>
        </div>

        <div>
          <h1 className="text-[17px] font-semibold leading-tight">
            {t("onboarding.setup.heading")}
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {t("onboarding.setup.subheading")}
          </p>
        </div>

        <StatusRail rows={rows} activeId={activeRow} onSelect={setActiveRow} />
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[880px] px-6 pb-12 pt-14">
          <div className="mb-5 md:hidden">
            <StatusRail
              rows={rows}
              activeId={activeRow}
              onSelect={setActiveRow}
            />
          </div>
          {activeRow === "start-context" ? (
            <StartContextPanel disabled={!status.anyUsableAiPath} />
          ) : (
            <AiPathPanel status={status} />
          )}
        </div>
      </main>
    </div>
  )
}
