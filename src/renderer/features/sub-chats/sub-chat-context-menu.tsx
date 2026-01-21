import React, { useMemo } from "react"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../components/ui/context-menu"
import { Kbd } from "../../components/ui/kbd"
import { isMac } from "../../lib/utils"
import type { SubChatMeta } from "../agents/stores/sub-chat-store"
import { getShortcutKey } from "../../lib/utils/platform"

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
  // Support both object and primitive props for backwards compatibility
  subChat?: SubChatMeta
  subChatId?: string
  subChatName?: string
  isPinned: boolean
  onTogglePin: (subChatId: string) => void
  onRename: ((subChat: SubChatMeta) => void) | ((subChatId: string, subChatName: string) => void)
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
  subChatId: subChatIdProp,
  subChatName: subChatNameProp,
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
}: SubChatContextMenuProps) {
  const closeTabShortcut = useCloseTabShortcut()

  // Support both object and primitive props
  const id = subChatIdProp ?? subChat?.id ?? ""
  const name = subChatNameProp ?? subChat?.name ?? ""

  const handleRename = () => {
    if (subChat) {
      // Legacy: pass object
      ;(onRename as (subChat: SubChatMeta) => void)(subChat)
    } else {
      // New: pass primitives
      ;(onRename as (id: string, name: string) => void)(id, name)
    }
  }

  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={() => onTogglePin(id)}>
        {isPinned ? "Unpin chat" : "Pin chat"}
      </ContextMenuItem>
      <ContextMenuItem onClick={handleRename}>
        Rename chat
      </ContextMenuItem>
      <ContextMenuSeparator />

      {showCloseTabOptions ? (
        <>
          <ContextMenuItem
            onClick={() => onCloseTab?.(id)}
            className="justify-between"
            disabled={isOnlyChat}
          >
            Close chat
            {!isOnlyChat && <Kbd>{closeTabShortcut}</Kbd>}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCloseOtherTabs?.(id)}
            disabled={!canCloseOtherTabs}
          >
            Close other chats
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCloseTabsToRight?.(id, visualIndex)}
            disabled={!hasTabsToRight}
          >
            Close chats to the right
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem
            onClick={() => onArchive(id)}
            className="justify-between"
            disabled={isOnlyChat}
          >
            Archive chat
            {!isOnlyChat && <Kbd>{closeTabShortcut}</Kbd>}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onArchiveAllBelow?.(id)}
            disabled={
              currentIndex === undefined ||
              currentIndex >= (totalCount || 0) - 1
            }
          >
            Archive chats below
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onArchiveOthers(id)}
            disabled={isOnlyChat}
          >
            Archive other chats
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}
