import React, { useMemo } from "react"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../../components/ui/context-menu"
import { Kbd } from "../../../components/ui/kbd"
import { isMac } from "../../../lib/utils"
import type { SubChatMeta } from "../stores/sub-chat-store"
import { getShortcutKey } from "../../../lib/utils/platform"

// Platform-aware keyboard shortcut
// Web: ⌥⌘W (browser uses Cmd+W to close tab)
// Desktop: ⌘W
const useCloseTabShortcut = () => {
  return useMemo(() => {
    if (!isMac) return "Alt+Ctrl+W"
    return getShortcutKey("closeTab")
  }, [])
}

interface SubChatContextMenuProps {
  subChat: SubChatMeta
  isPinned: boolean
  onTogglePin: (subChatId: string) => void
  onRename: (subChat: SubChatMeta) => void
  onFork?: (subChatId: string) => void
  onSave?: (subChatId: string) => void
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
}

export function SubChatContextMenu({
  subChat,
  isPinned,
  onTogglePin,
  onRename,
  onFork,
  onSave,
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
}: SubChatContextMenuProps) {
  const closeTabShortcut = useCloseTabShortcut()

  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={() => onTogglePin(subChat.id)}>
        {isPinned ? "Unpin chat" : "Pin chat"}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onRename(subChat)}>
        Rename chat
      </ContextMenuItem>
      {onSave && (
        <ContextMenuItem onClick={() => onSave(subChat.id)}>
          Save chat state
        </ContextMenuItem>
      )}
      {onFork && (
        <ContextMenuItem onClick={() => onFork(subChat.id)}>
          Fork chat
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />

      {showCloseTabOptions ? (
        <>
          <ContextMenuItem
            onClick={() => onCloseTab?.(subChat.id)}
            className="justify-between"
            disabled={isOnlyChat}
          >
            Close chat
            {!isOnlyChat && <Kbd>{closeTabShortcut}</Kbd>}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCloseOtherTabs?.(subChat.id)}
            disabled={!canCloseOtherTabs}
          >
            Close other chats
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCloseTabsToRight?.(subChat.id, visualIndex)}
            disabled={!hasTabsToRight}
          >
            Close chats to the right
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem
            onClick={() => onArchive(subChat.id)}
            className="justify-between"
            disabled={isOnlyChat}
          >
            Archive chat
            {!isOnlyChat && <Kbd>{closeTabShortcut}</Kbd>}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onArchiveAllBelow?.(subChat.id)}
            disabled={
              currentIndex === undefined ||
              currentIndex >= (totalCount || 0) - 1
            }
          >
            Archive chats below
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onArchiveOthers(subChat.id)}
            disabled={isOnlyChat}
          >
            Archive other chats
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}
