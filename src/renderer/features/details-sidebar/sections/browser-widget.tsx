"use client"

import { Globe2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

interface BrowserWidgetProps {
  onExpand?: () => void
}

export function BrowserWidget({ onExpand }: BrowserWidgetProps) {
  const { t } = useI18n()

  return (
    <div className="p-2 space-y-2">
      <div className="text-xs text-muted-foreground leading-relaxed">
        {t("localBrowser.localOnly")}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onExpand}
        className="h-7 w-full justify-start gap-1.5 text-xs"
      >
        <Globe2 className="h-3.5 w-3.5" />
        <span>{t("localBrowser.openWorkbench")}</span>
      </Button>
    </div>
  )
}
