import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

function read(path: string): string {
  return readFileSync(path, "utf8")
}

describe("quick chat sidebar grouping", () => {
  test("keeps quick chats outside project groups and uses visual order for keyboard navigation", () => {
    const source = read("src/renderer/features/sidebar/agents-sidebar.tsx")
    const groupingBlock = source.slice(
      source.indexOf("// Filter and group chats in the same order"),
      source.indexOf("const hasChatSections"),
    )

    expect(groupingBlock).toContain(
      "const quickChats = unpinned.filter((chat) => !chat.projectId)",
    )
    expect(groupingBlock).toContain(
      "const projectBackedChats = unpinned.filter((chat) => chat.projectId)",
    )
    expect(groupingBlock).toContain("visibleChats")
    expect(groupingBlock).toContain("PROJECT_GROUP_VISIBLE_LIMIT")
    expect(groupingBlock).toContain("...quickChats")
    expect(groupingBlock).toContain("...pinned")
    expect(groupingBlock).toContain(
      "...groups.flatMap((group) => group.visibleChats)",
    )
    expect(groupingBlock).toContain("filteredChats: visualOrder")

    expect(source).toContain("const globalIndexMap = useMemo(() => {")
    expect(source).toContain(
      "filteredChats.forEach((c, i) => map.set(c.id, i))",
    )
  })

  test("separates quick-chat deletion from project workspace archive/delete controls", () => {
    const sidebar = read("src/renderer/features/sidebar/agents-sidebar.tsx")
    const archivePopover = read(
      "src/renderer/features/agents/ui/archive-popover.tsx",
    )

    expect(sidebar).toContain("const isQuickChat = !chatProjectId")
    expect(sidebar).toContain("if (isQuickChat) {")
    expect(sidebar).toContain("onDelete(chatId)")
    expect(sidebar).toContain("onArchive(chatId)")
    expect(sidebar).toContain('t("sidebar.deleteQuickChat")')
    expect(sidebar).toContain('t("sidebar.archiveWorkspace")')
    expect(sidebar).toContain('t("sidebar.permanentDelete")')
    expect(sidebar).toContain("confirmDeleteWorkspaceWithChanges")
    expect(sidebar).toContain("confirmDeleteWorkspaceWithPr")
    expect(sidebar).toContain("if (!chat.projectId)")
    expect(sidebar).toContain("deleteChatMutation.mutate({ id: chatId })")

    expect(archivePopover).toContain("handleClearArchive")
    expect(archivePopover).toContain('t("sidebar.clearArchive")')
    expect(archivePopover).toContain('t("sidebar.permanentDelete")')
  })
})
