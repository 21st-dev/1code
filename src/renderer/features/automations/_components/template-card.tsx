import { ArrowRight } from "lucide-react"
import { ClaudeCodeIcon } from "../../../components/ui/icons"
import { cn } from "../../../lib/utils"
import { PlatformIcon } from "./platform-icon"
import { getTriggerLabel } from "./utils"
import type { AutomationTemplate } from "./types"
import { useI18n } from "@/lib/i18n"

interface TemplateCardProps {
  template: AutomationTemplate
  onUseTemplate: () => void
  disabled?: boolean
  disabledReason?: string
}

export function TemplateCard({ template, onUseTemplate, disabled, disabledReason }: TemplateCardProps) {
  const { t } = useI18n()
  const triggerLabel = getTriggerLabel(template.triggerType, template.platform, t)

  return (
    <div
      onClick={disabled ? undefined : onUseTemplate}
      className={cn(
        "bg-background border border-border rounded-[10px] p-4 transition-transform duration-150 ease-out",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:border-border/80 hover:bg-muted/30 active:scale-[0.98]"
      )}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-7 h-7 rounded-md bg-accent/50 flex items-center justify-center">
          <PlatformIcon platform={template.platform} className="h-4 w-4 text-muted-foreground" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground mx-1" />
        <div className="w-7 h-7 rounded-md border border-border flex items-center justify-center">
          <ClaudeCodeIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="flex flex-col gap-0">
        <span className="text-sm font-medium text-foreground line-clamp-2">
          {t(template.nameKey)}
        </span>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {disabled && disabledReason
            ? disabledReason
            : t("automations.description.single", { trigger: triggerLabel })}
        </p>
      </div>
    </div>
  )
}
