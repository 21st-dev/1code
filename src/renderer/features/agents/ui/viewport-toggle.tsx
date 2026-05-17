"use client"

import { cn } from "../../../lib/utils"
import { Monitor, Smartphone } from "lucide-react"
import { motion } from "motion/react"
import { useI18n } from "../../../lib/i18n"

interface ViewportToggleProps {
  value: "desktop" | "mobile"
  onChange: (mode: "desktop" | "mobile") => void
  className?: string
}

export function ViewportToggle({
  value,
  onChange,
  className,
}: ViewportToggleProps) {
  const { t } = useI18n()

  return (
    <motion.div
      layout
      className={cn("flex items-center", className)}
      transition={{
        layout: {
          duration: 0.15,
          ease: "easeInOut",
        },
      }}
    >
      <motion.div
        layout
        className="relative bg-muted rounded-lg h-7 p-0.5 flex"
      >
        {/* Animated selector */}
        <motion.div
          className="absolute inset-y-0.5 rounded-md bg-background shadow transition-all duration-200 ease-in-out"
          animate={{
            width: "calc(50% - 2px)",
            left: value === "desktop" ? "2px" : "calc(50%)",
          }}
          transition={{
            duration: 0.2,
            ease: "easeInOut",
          }}
        />
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange("desktop")
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.stopPropagation()
              onChange("desktop")
            }
          }}
          aria-label={t("agent.viewport.desktop")}
          aria-pressed={value === "desktop"}
          className={cn(
            "relative z-[2] px-2 flex-1 flex items-center justify-center transition-colors duration-200 rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 text-muted-foreground",
          )}
        >
          <Monitor className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange("mobile")
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.stopPropagation()
              onChange("mobile")
            }
          }}
          aria-label={t("agent.viewport.mobile")}
          aria-pressed={value === "mobile"}
          className={cn(
            "relative z-[2] px-2 flex-1 flex items-center justify-center transition-colors duration-200 rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 text-muted-foreground",
          )}
        >
          <Smartphone className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </motion.div>
  )
}
