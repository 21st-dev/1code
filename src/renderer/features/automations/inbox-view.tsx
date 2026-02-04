"use client"

import "./inbox-styles.css"
import { useAtomValue, useAtom } from "jotai"
import { selectedTeamIdAtom, isDesktopAtom, isFullscreenAtom } from "../../lib/atoms"
import {
  inboxSelectedChatIdAtom,
  agentsInboxSidebarWidthAtom,
  agentsSidebarOpenAtom,
  inboxMobileViewModeAtom,
} from "../agents/atoms"
import { IconSpinner, SettingsIcon } from "../../components/ui/icons"
import { Inbox as InboxIcon } from "lucide-react"
import { Logo } from "../../components/ui/logo"
import { Badge } from "../../components/ui/badge"
import { cn } from "../../lib/utils"
import { useState, useMemo, useEffect, useCallback } from "react"
// Inline time-ago formatter to avoid date-fns dependency resolution issues
function formatDistanceToNow(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  if (diffSec < 60) return "less than a minute"
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"}`
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"}`
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"}`
  const diffMonth = Math.floor(diffDay / 30)
  return `${diffMonth} month${diffMonth === 1 ? "" : "s"}`
}
import { GitHubIcon } from "../../icons"
import { ResizableSidebar } from "../../components/ui/resizable-sidebar"
import { ArrowUpDown, AlignJustify } from "lucide-react"
import { useIsMobile } from "../../lib/hooks/use-mobile"
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
import { ChatView } from "../agents/main/active-chat"
import { useAgentSubChatStore } from "../agents/stores/sub-chat-store"
import { TrafficLightSpacer } from "../agents/components/traffic-light-spacer"

function getStatusColor(status: string) {
  switch (status) {
    case "success":
      return "bg-green-500/10 text-green-600 border-green-500/20"
    case "failed":
      return "bg-red-500/10 text-red-600 border-red-500/20"
    case "pending":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
    default:
      return "bg-muted text-muted-foreground"
  }
}

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
}

export function InboxView() {
  const teamId = useAtomValue(selectedTeamIdAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(inboxSelectedChatIdAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const [mobileViewMode, setMobileViewMode] = useAtom(inboxMobileViewModeAtom)
  const isMobile = useIsMobile()
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState("")
  const [ordering, setOrdering] = useState<"newest" | "oldest">("newest")
  const [showRead, setShowRead] = useState(true)
  const [showUnreadFirst, setShowUnreadFirst] = useState(false)

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
    // On mobile, just close this view by setting mobile view mode
    // The drawer system will handle navigation
    setSidebarOpen(true)
  }, [setSidebarOpen])

  // Initialize sub-chat store when chat is selected
  useEffect(() => {
    if (selectedChatId) {
      const store = useAgentSubChatStore.getState()
      store.setChatId(selectedChatId)
    }
  }, [selectedChatId])

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
    setSelectedChatId(chat.id)
  }

  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Logo className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    )
  }

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
                    <button
                      key={chat.id}
                      onClick={() => handleChatClick(chat)}
                      className="w-full text-left py-3 px-3 rounded-lg transition-colors duration-150 cursor-pointer hover:bg-foreground/5 active:bg-foreground/10"
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5 flex-shrink-0 relative">
                          <GitHubIcon className="h-5 w-5 text-muted-foreground" />
                          {!chat.isRead && (
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className={cn("truncate text-sm leading-tight", !chat.isRead && "font-semibold")}>
                            {chat.name}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground/60 truncate">
                              {chat.automationName}
                            </span>
                            <span className="text-xs text-muted-foreground/40">&bull;</span>
                            <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
                              {formatDistanceToNow(new Date(chat.createdAt)) + " ago"}
                            </span>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 h-5 flex-shrink-0", getStatusColor(chat.status))}>
                          {chat.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          // Fullscreen chat view
          <ChatView
            chatId={selectedChatId!}
            isSidebarOpen={false}
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
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => handleChatClick(chat)}
                    className={cn(
                      "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer group",
                      selectedChatId === chat.id
                        ? "bg-foreground/5 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="pt-0.5 flex-shrink-0 relative">
                        <GitHubIcon className="h-4 w-4 text-muted-foreground" />
                        {!chat.isRead && (
                          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className={cn("truncate text-sm leading-tight", !chat.isRead && "font-semibold")}>
                          {chat.name}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground/60 truncate">
                            {chat.automationName}
                          </span>
                          <span className="text-[11px] text-muted-foreground/40">•</span>
                          <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                            {formatDistanceToNow(new Date(chat.createdAt)) + " ago"}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 flex-shrink-0", getStatusColor(chat.status))}>
                        {chat.status}
                      </Badge>
                    </div>
                  </button>
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
            isSidebarOpen={false}
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
  )
}
