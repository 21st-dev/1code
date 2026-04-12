"use client"

interface AgentsHeaderControlsProps {
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  hasUnseenChanges?: boolean
  /** @deprecated Sub-chats sidebar removed — unified sidebar handles hierarchy now */
  isSubChatsSidebarOpen?: boolean
}

export function AgentsHeaderControls({
  isSidebarOpen,
  onToggleSidebar,
  hasUnseenChanges = false,
}: AgentsHeaderControlsProps) {
  // Sidebar toggle is now handled by the floating button in agents-layout.tsx
  // Keeping this component to avoid breaking imports across the codebase
  return null
}
