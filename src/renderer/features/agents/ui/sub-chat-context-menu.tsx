import React, { useMemo, useCallback } from "react"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "../../../components/ui/context-menu"
import { Kbd } from "../../../components/ui/kbd"
import { isMac } from "../../../lib/utils"
import { isDesktopApp } from "../../../lib/utils/platform"
import type { SubChatMeta } from "../stores/sub-chat-store"
import { useResolvedHotkeyDisplay } from "../../../lib/hotkeys"
import { exportChat, copyChat, type ExportFormat } from "../lib/export-chat"
import { toast } from "sonner"
import { useI18n, type TranslationKey } from "../../../lib/i18n"

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

const openInNewWindow = async (chatId: string, subChatId: string, t: Translate) => {
  const result = await window.desktopApi?.newWindow({ chatId, subChatId })
  if (result?.blocked) {
    toast.info(t("sidebar.workspaceAlreadyOpen"), {
      description: t("sidebar.switchingToExistingWindow"),
      duration: 3000,
    })
  }
}

// Platform-aware keyboard shortcut for close tab
// Uses custom hotkey from settings if configured
const useCloseTabShortcut = () => {
  const archiveAgentHotkey = useResolvedHotkeyDisplay("archive-agent")
  return useMemo(() => {
    if (!isMac) return "Alt+Ctrl+W"
    return archiveAgentHotkey || "⌘W"
  }, [archiveAgentHotkey])
}

interface SubChatContextMenuProps {
  subChat: SubChatMeta
  isPinned: boolean
  onTogglePin: (subChatId: string) => void
  onRename: (subChat: SubChatMeta) => void
  onArchive: (subChatId: string) => void
  onArchiveOthers: (subChatId: string) => void
  onArchiveAllBelow?: (subChatId: string) => void
  isOnlyChat: boolean
  currentIndex?: number
  totalCount?: number
  showCloseTabOptions?: boolean
  onCloseTab?: (subChatId: string) => void
  onCloseOtherTabs?: (subChatId: string) => void
  onCloseTabsToRight?: (subChatId: string, visualIndex: number) => void
  visualIndex?: number
  hasTabsToRight?: boolean
  canCloseOtherTabs?: boolean
  /** Parent chat ID for export functionality */
  chatId?: string | null
  /** Open this sub-chat in split view */
  onOpenInSplit?: (subChatId: string) => void
  /** Close the current split view */
  onCloseSplit?: () => void
  /** Whether this tab is currently selected for command/input focus */
  isActiveTab?: boolean
  /** Whether this tab is already in split panes */
  isSplitTab?: boolean
  /** Remove this specific pane from split */
  onRemoveFromSplit?: (subChatId: string) => void
  /** Number of panes currently in split */
  splitPaneCount?: number
}

export function SubChatContextMenu({
  subChat,
  isPinned,
  onTogglePin,
  onRename,
  onArchive,
  onArchiveOthers,
  onArchiveAllBelow,
  isOnlyChat,
  currentIndex,
  totalCount,
  showCloseTabOptions = false,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  visualIndex = 0,
  hasTabsToRight = false,
  canCloseOtherTabs = false,
  chatId,
  onOpenInSplit,
  onCloseSplit,
  isActiveTab = false,
  isSplitTab = false,
  onRemoveFromSplit,
  splitPaneCount = 0,
}: SubChatContextMenuProps) {
  const { t } = useI18n()
  const closeTabShortcut = useCloseTabShortcut()

  const handleExport = useCallback((format: ExportFormat) => {
    if (!chatId) return
    exportChat({ chatId, subChatId: subChat.id, format, t })
  }, [chatId, subChat.id, t])

  const handleCopy = useCallback((format: ExportFormat) => {
    if (!chatId) return
    copyChat({ chatId, subChatId: subChat.id, format, t })
  }, [chatId, subChat.id, t])

  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={() => onTogglePin(subChat.id)}>
        {isPinned ? t("agent.chat.unpinChat") : t("agent.chat.pinChat")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onRename(subChat)}>
        {t("agent.chat.renameChat")}
      </ContextMenuItem>
      {chatId && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t("agent.chat.exportChat")}</ContextMenuSubTrigger>
          <ContextMenuSubContent sideOffset={6} alignOffset={-4}>
            <ContextMenuItem onClick={() => handleExport("markdown")}>
              {t("sidebar.downloadAsMarkdown")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleExport("json")}>
              {t("sidebar.downloadAsJson")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleExport("text")}>
              {t("sidebar.downloadAsText")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleCopy("markdown")}>
              {t("sidebar.copyAsMarkdown")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleCopy("json")}>
              {t("sidebar.copyAsJson")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleCopy("text")}>
              {t("sidebar.copyAsText")}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {isDesktopApp() && chatId && (
        <ContextMenuItem onClick={() => openInNewWindow(chatId, subChat.id, t)}>
          {t("sidebar.openInNewWindow")}
        </ContextMenuItem>
      )}
      {isSplitTab ? (
        <>
          {splitPaneCount > 2 && onRemoveFromSplit && (
            <ContextMenuItem onClick={() => onRemoveFromSplit(subChat.id)}>
              {t("agent.chat.removeFromSplit")}
            </ContextMenuItem>
          )}
          {onCloseSplit && (
            <ContextMenuItem onClick={onCloseSplit}>
              {t("agent.chat.separateChats")}
            </ContextMenuItem>
          )}
        </>
      ) : onOpenInSplit ? (
        <ContextMenuItem
          onClick={() => onOpenInSplit(subChat.id)}
          disabled={isActiveTab || isOnlyChat || splitPaneCount >= 4}
        >
          {t("agent.chat.addAsSplit")}
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />

      {showCloseTabOptions ? (
        <>
          <ContextMenuItem
            onClick={() => onCloseTab?.(subChat.id)}
            className="justify-between"
            disabled={isOnlyChat}
          >
            {t("agent.chat.closeChat")}
            {!isOnlyChat && <Kbd>{closeTabShortcut}</Kbd>}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCloseOtherTabs?.(subChat.id)}
            disabled={!canCloseOtherTabs}
          >
            {t("agent.chat.closeOtherChats")}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCloseTabsToRight?.(subChat.id, visualIndex)}
            disabled={!hasTabsToRight}
          >
            {t("agent.chat.closeChatsToRight")}
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem
            onClick={() => onArchive(subChat.id)}
            className="justify-between"
            disabled={isOnlyChat}
          >
            {t("agent.chat.archiveChat")}
            {!isOnlyChat && <Kbd>{closeTabShortcut}</Kbd>}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onArchiveAllBelow?.(subChat.id)}
            disabled={
              currentIndex === undefined ||
              currentIndex >= (totalCount || 0) - 1
            }
          >
            {t("agent.chat.archiveChatsBelow")}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onArchiveOthers(subChat.id)}
            disabled={isOnlyChat}
          >
            {t("agent.chat.archiveOtherChats")}
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}
