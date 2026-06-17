"use client"

import { useAtom, useSetAtom } from "jotai"
import { useCallback, useMemo } from "react"
import { useIsMobile } from "@/lib/hooks/use-mobile"
import {
  detailsSidebarOpenAtom,
  detailsSidebarTabAtom,
  expandedWidgetAtomFamily,
  type WidgetId,
} from "./atoms"

export function useOpenDetailsWidget(chatId: string | null | undefined) {
  const isMobile = useIsMobile()
  const setDetailsSidebarOpen = useSetAtom(detailsSidebarOpenAtom)
  const setDetailsSidebarTab = useSetAtom(detailsSidebarTabAtom)
  const expandedWidgetAtom = useMemo(
    () => expandedWidgetAtomFamily(chatId || ""),
    [chatId],
  )
  const [expandedWidget, setExpandedWidget] = useAtom(expandedWidgetAtom)

  return useCallback(
    (widgetId: WidgetId, options?: { expand?: boolean; toggle?: boolean }) => {
      if (!chatId || isMobile) {
        return false
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
      isMobile,
      setDetailsSidebarOpen,
      setDetailsSidebarTab,
      setExpandedWidget,
    ],
  )
}
