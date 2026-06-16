"use client"

import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useMemo } from "react"
import { useIsMobile } from "@/lib/hooks/use-mobile"
import {
  detailsSidebarOpenAtom,
  detailsSidebarTabAtom,
  expandedWidgetAtomFamily,
  unifiedSidebarEnabledAtom,
  type WidgetId,
} from "./atoms"

export function useOpenDetailsWidget(chatId: string | null | undefined) {
  const isMobile = useIsMobile()
  const isUnifiedSidebarEnabled = useAtomValue(unifiedSidebarEnabledAtom)
  const setDetailsSidebarOpen = useSetAtom(detailsSidebarOpenAtom)
  const setDetailsSidebarTab = useSetAtom(detailsSidebarTabAtom)
  const expandedWidgetAtom = useMemo(
    () => expandedWidgetAtomFamily(chatId || ""),
    [chatId],
  )
  const setExpandedWidget = useSetAtom(expandedWidgetAtom)

  return useCallback(
    (widgetId: WidgetId, options?: { expand?: boolean }) => {
      if (!chatId || !isUnifiedSidebarEnabled || isMobile) {
        return false
      }

      setDetailsSidebarTab("details")
      setDetailsSidebarOpen(true)

      if (options?.expand ?? true) {
        setExpandedWidget(widgetId)
      }

      return true
    },
    [
      chatId,
      isMobile,
      isUnifiedSidebarEnabled,
      setDetailsSidebarOpen,
      setDetailsSidebarTab,
      setExpandedWidget,
    ],
  )
}
