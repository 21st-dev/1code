"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
// import Image from "next/image" // Desktop doesn't use next/image
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../../components/ui/hover-card"
import { useSetAtom, atom } from "jotai"
// import { agentsSettingsDialogOpenAtom, agentsSettingsDialogActiveTabAtom } from "@/lib/atoms/agents-settings-dialog"
const agentsSettingsDialogOpenAtom = atom(false)
const agentsSettingsDialogActiveTabAtom = atom<string | null>(null)
import { GitHubIcon } from "../../../icons"
import { useI18n } from "../../../lib/i18n"

interface PreviewSetupHoverCardProps {
  children: React.ReactNode
}

export function PreviewSetupHoverCard({ children }: PreviewSetupHoverCardProps) {
  const { t } = useI18n()
  const { resolvedTheme } = useTheme()
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [open, setOpen] = useState(false)

  const handleOpenSettings = () => {
    setSettingsActiveTab("github")
    setSettingsDialogOpen(true)
    setOpen(false)
  }

  return (
    <HoverCard openDelay={300} open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent 
        className="w-[280px] p-0 overflow-hidden"
        align="end"
        side="bottom"
        sideOffset={8}
      >
        {/* Image Section - styled like onboarding dialog */}
        <div className="bg-primary px-4 pt-8 flex items-start justify-center">
          <div className="relative w-full flex items-start justify-center pt-3">
            {/* Container showing only top 70% of image (16/7 aspect ratio = 70% of 16/10) */}
            <div
              className="relative w-full overflow-hidden rounded-t-lg border"
              style={{ aspectRatio: "16/7", maxHeight: "110px" }}
            >
              <div
                className="absolute inset-0"
                style={{ height: "142.86%", top: 0 }}
              >
                {/* Desktop: use regular img tag instead of next/image */}
                <img
                  src={
                    resolvedTheme === "dark"
                      ? "/agents-onboarding-dark.webp"
                      : "/agents-onboarding-light.webp"
                  }
                  alt={t("agent.previewSetup.imageAlt")}
                  className="object-cover w-full h-full"
                  style={{ objectPosition: "top" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold">
              {t("agent.previewSetup.notAvailable")}
            </h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {t("agent.previewSetup.description")}
            </p>
          </div>

          {/* Action button */}
          <button
            onClick={handleOpenSettings}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 rounded-md transition-colors"
          >
            <GitHubIcon className="h-3.5 w-3.5" />
            <span>{t("agent.previewSetup.setUpRepository")}</span>
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
