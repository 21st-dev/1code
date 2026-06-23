"use client"

import { Check } from "lucide-react"
import { cn } from "../../../lib/utils"
import type { BadgeStatus } from "./status-badge"
import { StatusBadge } from "./status-badge"

export type RailRowId = "ai-path" | "start-context"

export type RailRow = {
  id: RailRowId
  label: string
  status: BadgeStatus
  disabled?: boolean
}

/**
 * Vertical step rail (the three first-run concerns). Collapses to a horizontal,
 * scrollable row of chips on narrow viewports.
 */
export function StatusRail({
  rows,
  activeId,
  onSelect,
}: {
  rows: RailRow[]
  activeId: RailRowId
  onSelect: (id: RailRowId) => void
}) {
  return (
    <nav
      className="flex gap-1.5 overflow-x-auto pb-1 md:block md:gap-0 md:overflow-visible md:pb-0"
      aria-label="Setup sections"
    >
      {rows.map((row, index) => {
        const isActive = row.id === activeId
        const isReady = row.status === "ready"
        const isLast = index === rows.length - 1
        return (
          <button
            type="button"
            key={row.id}
            onClick={() => onSelect(row.id)}
            disabled={row.disabled}
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "group flex min-w-[150px] flex-1 items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors md:w-full md:min-w-0 md:flex-none",
              isActive
                ? "bg-background md:bg-background/70"
                : "hover:bg-background/50",
              row.disabled &&
                "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            <span className="flex flex-col items-center self-stretch">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                  isReady
                    ? "border-transparent bg-emerald-500 text-white"
                    : isActive
                      ? "border-transparent bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {isReady ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {!isLast && (
                <span className="mt-1 hidden w-px flex-1 bg-border md:block" />
              )}
            </span>
            <span className="min-w-0 flex-1 md:pb-4">
              <span
                className={cn(
                  "block truncate text-[13px] font-medium leading-5",
                  isActive ? "text-foreground" : "text-foreground/90",
                )}
              >
                {row.label}
              </span>
              <span className="mt-1 block">
                <StatusBadge status={row.status} />
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
