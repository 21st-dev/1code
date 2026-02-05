"use client"

import "./inbox-styles.css"
import { useAtomValue, useSetAtom, useAtom } from "jotai"
import { selectedTeamIdAtom, isDesktopAtom, isFullscreenAtom, chatSourceModeAtom } from "../../lib/atoms"
import {
  inboxSelectedChatIdAtom,
  agentsInboxSidebarWidthAtom,
  agentsSidebarOpenAtom,
  agentsMobileViewModeAtom,
  inboxMobileViewModeAtom,
} from "../agents/atoms"
import { IconSpinner, SettingsIcon } from "../../components/ui/icons"
import { Inbox as InboxIcon, Archive as ArchiveIcon } from "lucide-react"
import { Logo } from "../../components/ui/logo"
import { cn } from "../../lib/utils"
import { useState, useMemo, useEffect, useCallback } from "react"
import { formatTimeAgo } from "../agents/utils/format-time-ago"
import { GitHubIcon } from "../../icons"
import { ResizableSidebar } from "../../components/ui/resizable-sidebar"
import { ArrowUpDown, AlignJustify } from "lucide-react"
import { useIsMobile } from "../../lib/hooks/use-mobile"
import { desktopViewAtom } from "../agents/atoms"
import { remoteTrpc } from "../../lib/remote-trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { Switch } from "../../components/ui/switch"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../components/ui/context-menu"
import { ChatView } from "../agents/main/active-chat"
import { TrafficLightSpacer } from "../agents/components/traffic-light-spacer"
import { OpenLocallyDialog } from "../agents/components/open-locally-dialog"
import { useAutoImport } from "../agents/hooks/use-auto-import"
import { trpc } from "../../lib/trpc"
import type { RemoteChat } from "../../lib/remote-api"

interface InboxChat {
  id: string
  executionId: string
  name: string
  createdAt: Date
  automationId: string
  automationName: string
  externalUrl: string | null
  status: string
  isRead: boolean
  meta?: { repository?: string; branch?: string } | null
}

function AutomationsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M9.50006 5.39844C7.09268 6.1897 5.1897 8.09268 4.39844 10.5001M19.8597 14.5001C19.9518 14.0142 20.0001 13.5128 20.0001 13.0001C20.0001 10.9895 19.2584 9.1522 18.0337 7.74679M6.70841 19.0001C8.11868 20.2448 9.97117 21.0001 12.0001 21.0001C12.5127 21.0001 13.0141 20.9518 13.5 20.8597"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="4" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

// GitHub avatar with loading state and fallback
function InboxGitHubAvatar({ gitOwner }: { gitOwner: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return <GitHubIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  }

  return (
    <div className="h-4 w-4 relative flex-shrink-0">
      {!isLoaded && (
        <div className="absolute inset-0 rounded-sm bg-muted" />
      )}
      <img
        src={`https://github.com/${gitOwner}.png?size=64`}
        alt={gitOwner}
        className={cn("h-4 w-4 rounded-sm flex-shrink-0", isLoaded ? "opacity-100" : "opacity-0")}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  )
}

function InboxChatIcon({ chat, isSelected }: { chat: InboxChat; isSelected: boolean }) {
  const repoOwner = chat.meta?.repository?.split("/")[0] || null

  return (
    <div className="relative flex-shrink-0 w-4 h-4">
      {repoOwner ? (
        <InboxGitHubAvatar gitOwner={repoOwner} />
      ) : (
        <AutomationsIcon className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          isSelected ? "text-foreground" : "text-muted-foreground",
        )} />
      )}
      {/* Unread badge - bottom-right, matching sidebar ChatIcon style */}
      {!chat.isRead && (
        <div className={cn(
          "absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
          isSelected
            ? "bg-[#E8E8E8] dark:bg-[#1B1B1B]"
            : "bg-[#F4F4F4] group-hover:bg-[#E8E8E8] dark:bg-[#101010] dark:group-hover:bg-[#1B1B1B]",
        )}>
          <div className="w-1.5 h-1.5 rounded-full bg-[#307BD0]" />
        </div>
      )}
    </div>
  )
}

function InboxItemDesktop({
  chat,
  isSelected,
  onClick,
  onArchive,
  onArchiveOthers,
  onArchiveBelow,
  onForkLocally,
  isOnlyChat,
  isLastChat,
}: {
  chat: InboxChat
  isSelected: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
  onArchiveOthers: () => void
  onArchiveBelow: () => void
  onForkLocally: () => void
  isOnlyChat: boolean
  isLastChat: boolean
}) {
  const repoName = chat.meta?.repository?.split("/").pop() || null
  const displayText = repoName || chat.automationName

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-75 cursor-pointer group",
            isSelected
              ? "bg-foreground/5 text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          )}
        >
          <div className="flex items-start gap-2.5">
            <div className="pt-0.5">
              <InboxChatIcon chat={chat} isSelected={isSelected} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <span className="truncate block text-sm leading-tight flex-1">
                  {chat.name || "Untitled"}
                </span>
                {/* Archive button - appears on hover */}
                <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center relative">
                  <button
                    onClick={onArchive}
                    tabIndex={-1}
                    className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                    aria-label="Archive"
                  >
                    <ArchiveIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 min-w-0">
                <span className="truncate flex-1 min-w-0">{displayText}</span>
                <span className="flex-shrink-0">{formatTimeAgo(new Date(chat.createdAt))}</span>
              </div>
            </div>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onForkLocally}>
          Fork Locally
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={(e) => onArchive(e as unknown as React.MouseEvent)}>
          Archive
        </ContextMenuItem>
        <ContextMenuItem onClick={onArchiveOthers} disabled={isOnlyChat}>
          Archive others
        </ContextMenuItem>
        <ContextMenuItem onClick={onArchiveBelow} disabled={isLastChat}>
          Archive all below
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function InboxItemMobile({
  chat,
  onClick,
  onArchive,
}: {
  chat: InboxChat
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
}) {
  const repoName = chat.meta?.repository?.split("/").pop() || null
  const displayText = repoName || chat.automationName

  return (
    <button
      onClick={onClick}
      className="w-full text-left py-2.5 px-3 rounded-lg transition-colors duration-150 cursor-pointer group hover:bg-foreground/5 active:bg-foreground/10"
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <InboxChatIcon chat={chat} isSelected={false} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className={cn("truncate block text-sm leading-tight flex-1", !chat.isRead && "font-semibold")}>
              {chat.name || "Untitled"}
            </span>
            <button
              onClick={onArchive}
              tabIndex={-1}
              className="flex-shrink-0 flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              aria-label="Archive"
            >
              <ArchiveIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground/60 min-w-0">
            <span className="truncate flex-1 min-w-0">{displayText}</span>
            <span className="flex-shrink-0">{formatTimeAgo(new Date(chat.createdAt))}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

export function InboxView() {
  const teamId = useAtomValue(selectedTeamIdAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(inboxSelectedChatIdAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const setAgentsMobileViewMode = useSetAtom(agentsMobileViewModeAtom)
  const [mobileViewMode, setMobileViewMode] = useAtom(inboxMobileViewModeAtom)
  const isMobile = useIsMobile()
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)
  const setChatSourceMode = useSetAtom(chatSourceModeAtom)
  const queryClient = useQueryClient()

  // Inbox always shows remote/sandbox chats — ensure correct mode on mount
  useEffect(() => {
    setChatSourceMode("sandbox")
  }, [setChatSourceMode])

  const [searchQuery, setSearchQuery] = useState("")
  const [ordering, setOrdering] = useState<"newest" | "oldest">("newest")
  const [showRead, setShowRead] = useState(true)
  const [showUnreadFirst, setShowUnreadFirst] = useState(false)

  // Fork Locally state
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["automations", "inboxChats", teamId],
    queryFn: () => remoteTrpc.automations.getInboxChats.query({ teamId: teamId!, limit: 50 }),
    enabled: !!teamId,
  })

  const markReadMutation = useMutation({
    mutationFn: (executionId: string) =>
      remoteTrpc.automations.markInboxItemRead.mutate({ executionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "inboxUnreadCount"] })
      queryClient.invalidateQueries({ queryKey: ["automations", "inboxChats"] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (chatId: string) =>
      remoteTrpc.agents.archiveChat.mutate({ chatId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "inboxChats"] })
      queryClient.invalidateQueries({ queryKey: ["automations", "inboxUnreadCount"] })
    },
  })

  // Fork Locally: projects, auto-import
  // Note: inbox chats are excluded from useRemoteChats() (getAgentChats filters them out),
  // so we fetch the individual chat on demand via remoteTrpc.agents.getAgentChat
  const { data: projects } = trpc.projects.list.useQuery()
  const { getMatchingProjects, autoImport, isImporting } = useAutoImport()
  const [importingRemoteChat, setImportingRemoteChat] = useState<RemoteChat | null>(null)

  const handleForkLocally = useCallback(
    async (chatId: string) => {
      try {
        const chatData = await remoteTrpc.agents.getAgentChat.query({ chatId })
        const remoteChat = chatData as RemoteChat
        if (!remoteChat) return

        const matchingProjects = getMatchingProjects(projects ?? [], remoteChat)

        if (matchingProjects.length === 1) {
          autoImport(remoteChat, matchingProjects[0]!)
        } else {
          setImportingRemoteChat(remoteChat)
          setImportDialogOpen(true)
        }
      } catch (err) {
        console.error("[InboxView] Failed to fetch chat for fork locally:", err)
      }
    },
    [projects, getMatchingProjects, autoImport]
  )

  const handleCloseImportDialog = useCallback(() => {
    setImportDialogOpen(false)
    setImportingRemoteChat(null)
  }, [])

  const importMatchingProjects = useMemo(() => {
    if (!importingRemoteChat) return []
    return getMatchingProjects(projects ?? [], importingRemoteChat)
  }, [importingRemoteChat, projects, getMatchingProjects])

  // Auto-switch mobile view mode when chat is selected/deselected
  useEffect(() => {
    if (isMobile && selectedChatId && mobileViewMode === "list") {
      setMobileViewMode("chat")
    }
  }, [isMobile, selectedChatId, mobileViewMode, setMobileViewMode])

  useEffect(() => {
    if (isMobile && !selectedChatId && mobileViewMode === "chat") {
      setMobileViewMode("list")
    }
  }, [isMobile, selectedChatId, mobileViewMode, setMobileViewMode])

  const handleBackToList = useCallback(() => {
    setMobileViewMode("list")
    setSelectedChatId(null)
  }, [setMobileViewMode, setSelectedChatId])

  const handleMobileBackToChats = useCallback(() => {
    setDesktopView(null)
    setAgentsMobileViewMode("chats")
  }, [setDesktopView, setAgentsMobileViewMode])

  // Filter and sort chats
  const filteredChats = useMemo(() => {
    let chats = (data?.chats || []) as InboxChat[]

    if (!showRead) {
      chats = chats.filter((chat) => !chat.isRead)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      chats = chats.filter(
        (chat) =>
          chat.name.toLowerCase().includes(query) ||
          chat.automationName.toLowerCase().includes(query)
      )
    }

    chats = [...chats].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return ordering === "newest" ? dateB - dateA : dateA - dateB
    })

    if (showUnreadFirst) {
      chats = [...chats].sort((a, b) => {
        if (a.isRead === b.isRead) return 0
        return a.isRead ? 1 : -1
      })
    }

    return chats
  }, [data?.chats, searchQuery, showRead, ordering, showUnreadFirst])

  const unreadCount = useMemo(() => {
    const chats = (data?.chats || []) as InboxChat[]
    return chats.filter((chat) => !chat.isRead).length
  }, [data?.chats])

  const handleChatClick = (chat: InboxChat) => {
    if (!chat.isRead) {
      markReadMutation.mutate(chat.executionId)
    }
    setChatSourceMode("sandbox")
    setSelectedChatId(chat.id)
  }

  const handleArchive = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    archiveMutation.mutate(chatId)
    if (selectedChatId === chatId) {
      setSelectedChatId(null)
    }
  }, [archiveMutation, selectedChatId, setSelectedChatId])

  const handleArchiveOthers = useCallback((chatId: string) => {
    filteredChats.forEach((chat) => {
      if (chat.id !== chatId) {
        archiveMutation.mutate(chat.id)
      }
    })
    setSelectedChatId(chatId)
  }, [archiveMutation, filteredChats, setSelectedChatId])

  const handleArchiveBelow = useCallback((chatId: string) => {
    const index = filteredChats.findIndex((c) => c.id === chatId)
    if (index === -1) return
    filteredChats.slice(index + 1).forEach((chat) => {
      archiveMutation.mutate(chat.id)
    })
    if (selectedChatId && filteredChats.findIndex(c => c.id === selectedChatId) > index) {
      setSelectedChatId(chatId)
    }
  }, [archiveMutation, filteredChats, selectedChatId, setSelectedChatId])

  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Logo className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    )
  }

  // Shared filter settings popover content
  const filterContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <span>Ordering</span>
        </div>
        <Select value={ordering} onValueChange={(v) => setOrdering(v as "newest" | "oldest")}>
          <SelectTrigger className="w-[100px] h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-center justify-between">
        <span className="text-sm">Show read</span>
        <Switch checked={showRead} onCheckedChange={setShowRead} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Show unread first</span>
        <Switch checked={showUnreadFirst} onCheckedChange={setShowUnreadFirst} />
      </div>
    </div>
  )

  // Mobile layout - fullscreen list or fullscreen chat
  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-background" data-mobile-view data-inbox-page>
        {mobileViewMode === "list" ? (
          <>
            {/* Mobile Header */}
            <div className="flex-shrink-0 border-b bg-background">
              <div className="h-14 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMobileBackToChats}
                    className="h-7 w-7 p-0 flex items-center justify-center hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label="Back to chats"
                  >
                    <AlignJustify className="h-4 w-4" />
                  </button>
                  <h1 className="text-lg font-semibold">Inbox</h1>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      <SettingsIcon className="h-5 w-5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[240px] p-3">
                    {filterContent}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="px-4 pb-3">
                <input
                  placeholder="Search inbox..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40"
                />
              </div>
            </div>

            {/* Mobile inbox list */}
            <div className="flex-1 overflow-y-auto px-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <IconSpinner className="h-5 w-5" />
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <InboxIcon className="h-8 w-8 text-border mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? "No results found" : "Your inbox is empty"}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5 py-4">
                  {filteredChats.map((chat) => (
                    <InboxItemMobile
                      key={chat.id}
                      chat={chat}
                      onClick={() => handleChatClick(chat)}
                      onArchive={(e) => handleArchive(e, chat.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <ChatView
            chatId={selectedChatId!}
            isSidebarOpen={true}
            onToggleSidebar={() => {}}
            isMobileFullscreen={true}
            onBackToChats={handleBackToList}
          />
        )}
      </div>
    )
  }

  // Desktop layout
  return (
    <>
    <div className="flex h-full overflow-hidden" data-inbox-page>
      {/* Left sidebar - Inbox list */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={agentsInboxSidebarWidthAtom}
        minWidth={200}
        maxWidth={400}
        side="left"
        animationDuration={0}
        initialWidth={240}
        exitWidth={240}
        disableClickToClose={true}
      >
        <div
          className="flex flex-col h-full bg-background border-r overflow-hidden relative"
          style={{ borderRightWidth: "0.5px" }}
        >
          {/* Spacer for macOS traffic lights - only when main sidebar is open */}
          {sidebarOpen && (
            <TrafficLightSpacer isFullscreen={isFullscreen} isDesktop={isDesktop} />
          )}

          {/* Settings button - absolutely positioned when main sidebar is open */}
          {sidebarOpen && (
            <div
              className="absolute right-2 top-2 z-20"
              style={{
                // @ts-expect-error - WebKit-specific property
                WebkitAppRegion: "no-drag",
              }}
            >
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                    <SettingsIcon className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[240px] p-3">
                  {filterContent}
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Header */}
          <div className="p-2 pb-3 flex-shrink-0 relative z-10">
            <div className="space-y-2">
              {/* Top row - different layout based on main sidebar state */}
              {sidebarOpen ? (
                <div className="h-6" />
              ) : (
                <div className="flex items-center justify-between gap-1 mb-1">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="h-6 w-6 p-0 flex items-center justify-center hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label="Open sidebar"
                    style={{
                      // @ts-expect-error - WebKit-specific property
                      WebkitAppRegion: "no-drag",
                    }}
                  >
                    <AlignJustify className="h-4 w-4" />
                  </button>
                  <div className="flex-1" />
                  <div
                    style={{
                      // @ts-expect-error - WebKit-specific property
                      WebkitAppRegion: "no-drag",
                    }}
                  >
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                          <SettingsIcon className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-[240px] p-3">
                        {filterContent}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
              <input
                placeholder="Search inbox..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          {/* Chat list */}
          <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <IconSpinner className="h-5 w-5" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <InboxIcon className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "No results found" : "Your inbox is empty"}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5 pb-4">
                {filteredChats.map((chat, index) => (
                  <InboxItemDesktop
                    key={chat.id}
                    chat={chat}
                    isSelected={selectedChatId === chat.id}
                    onClick={() => handleChatClick(chat)}
                    onArchive={(e) => handleArchive(e, chat.id)}
                    onArchiveOthers={() => handleArchiveOthers(chat.id)}
                    onArchiveBelow={() => handleArchiveBelow(chat.id)}
                    onForkLocally={() => handleForkLocally(chat.id)}
                    isOnlyChat={filteredChats.length <= 1}
                    isLastChat={index === filteredChats.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ResizableSidebar>

      {/* Right content - Chat view */}
      <div className="flex-1 min-w-0 h-full overflow-hidden" style={{ minWidth: "350px" }}>
        {selectedChatId ? (
          <ChatView
            chatId={selectedChatId}
            isSidebarOpen={true}
            onToggleSidebar={() => {}}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <InboxIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "No unread notifications"}
            </p>
          </div>
        )}
      </div>
    </div>

    <OpenLocallyDialog
      isOpen={importDialogOpen}
      onClose={handleCloseImportDialog}
      remoteChat={importingRemoteChat}
      matchingProjects={importMatchingProjects}
      allProjects={projects ?? []}
      remoteSubChatId={null}
    />
    </>
  )
}
