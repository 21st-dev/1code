import { useRef, useState, useEffect } from "react"
import { cn } from "../../../lib/utils"
import { AUTOMATION_TABS } from "./constants"
import type { ViewTab } from "./types"
import { useI18n } from "@/lib/i18n"

interface TabToggleProps {
  value: ViewTab
  onChange: (value: ViewTab) => void
}

export function TabToggle({ value, onChange }: TabToggleProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const activeButton = container.querySelector(
      `[data-tab-value="${value}"]`
    ) as HTMLElement | null
    if (!activeButton) return
    setIndicator({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    })
  }, [value])

  return (
    <div
      ref={containerRef}
      className="relative bg-muted rounded-lg h-7 p-0.5 flex w-fit shrink-0"
    >
      <div
        className="absolute top-0.5 bottom-0.5 rounded-md bg-background shadow transition-all duration-200 ease-in-out"
        style={{
          width: `${indicator.width}px`,
          transform: `translateX(${indicator.left - 2}px)`,
          left: "2px",
        }}
      />
      {AUTOMATION_TABS.map((tab) => (
        <button
          key={tab.value}
          data-tab-value={tab.value}
          onClick={() => onChange(tab.value as ViewTab)}
          className={cn(
            "relative z-[2] px-3 flex items-center justify-center text-sm font-medium whitespace-nowrap transition-colors duration-200 rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            value === tab.value ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  )
}
