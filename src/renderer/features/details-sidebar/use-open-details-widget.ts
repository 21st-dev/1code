"use client"

import { useAtom, useSetAtom } from "jotai"
import { useCallback, useMemo } from "react"
import { useIsMobile } from "@/lib/hooks/use-mobile"
import {
  detailsSidebarAutoOpenSuppressedAtom,
  detailsSidebarOpenAtom,
  detailsSidebarTabAtom,
  expandedWidgetAtomFamily,
  type WidgetId,
} from "./atoms"

type DetailsWidgetOpenReason = "plan-produced" | "run-error"

interface OpenDetailsWidgetOptions {
  expand?: boolean
  toggle?: boolean
  source?: "user" | "context"
  reason?: DetailsWidgetOpenReason
  isFolderlessChat?: boolean
}

const CONTEXT_AUTO_OPEN_REASONS: Record<DetailsWidgetOpenReason, WidgetId> = {
  "plan-produced": "plan",
  "run-error": "error",
}

export function useOpenDetailsWidget(chatId: string | null | undefined) {
  const isMobile = useIsMobile()
  const [isAutoOpenSuppressed, setDetailsSidebarAutoOpenSuppressed] = useAtom(
    detailsSidebarAutoOpenSuppressedAtom,
  )
  const setDetailsSidebarOpen = useSetAtom(detailsSidebarOpenAtom)
  const setDetailsSidebarTab = useSetAtom(detailsSidebarTabAtom)
  const expandedWidgetAtom = useMemo(
    () => expandedWidgetAtomFamily(chatId || ""),
    [chatId],
  )
  const [expandedWidget, setExpandedWidget] = useAtom(expandedWidgetAtom)

  return useCallback(
    (widgetId: WidgetId, options?: OpenDetailsWidgetOptions) => {
      if (!chatId || isMobile) {
        return false
      }

      if (options?.source === "context") {
        if (
          options.isFolderlessChat ||
          isAutoOpenSuppressed ||
          !options.reason ||
          CONTEXT_AUTO_OPEN_REASONS[options.reason] !== widgetId
        ) {
          return false
        }
      } else {
        setDetailsSidebarAutoOpenSuppressed(false)
      }

      setDetailsSidebarTab("details")
      setDetailsSidebarOpen(true)

      if (options?.expand ?? true) {
        if (options?.toggle && expandedWidget === widgetId) {
          setExpandedWidget(null)
          return true
        }

        setExpandedWidget(widgetId)
      }

      return true
    },
    [
      chatId,
      expandedWidget,
      isAutoOpenSuppressed,
      isMobile,
      setDetailsSidebarAutoOpenSuppressed,
      setDetailsSidebarOpen,
      setDetailsSidebarTab,
      setExpandedWidget,
    ],
  )
}
