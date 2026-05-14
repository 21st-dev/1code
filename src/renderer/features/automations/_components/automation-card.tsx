import { ArrowRight } from "lucide-react"
import { ClaudeCodeIcon } from "../../../components/ui/icons"
import { PlatformIcon } from "./platform-icon"
import { getAutomationDescription } from "./utils"
import type { Platform } from "./types"
import { useI18n } from "@/lib/i18n"

interface AutomationCardProps {
  automation: {
    id: string
    name: string
    is_enabled: boolean
    triggers: Array<{ trigger_type: string; platform?: string }>
  }
  onClick: () => void
}

export function AutomationCard({ automation, onClick }: AutomationCardProps) {
  const { t } = useI18n()
  const triggers = automation.triggers || []
  const platforms = [...new Set(triggers.map((t) => (t.platform || "github") as Platform))]

  return (
    <div
      onClick={onClick}
      className="bg-background border border-border rounded-[10px] p-4 cursor-pointer hover:border-border/80 hover:bg-muted/30"
    >
      <div className="flex items-center gap-1.5 mb-3">
        {platforms.map((platform, idx) => (
          <div
            key={idx}
            className="w-7 h-7 rounded-md bg-accent/50 flex items-center justify-center"
          >
            <PlatformIcon platform={platform} className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
        <ArrowRight className="h-4 w-4 text-muted-foreground mx-1" />
        <div className="w-7 h-7 rounded-md border border-border flex items-center justify-center">
          <ClaudeCodeIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="flex flex-col gap-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground line-clamp-2">
            {automation.name}
          </span>
          {!automation.is_enabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {t("automations.paused")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {getAutomationDescription(triggers, t)}
        </p>
      </div>
    </div>
  )
}
