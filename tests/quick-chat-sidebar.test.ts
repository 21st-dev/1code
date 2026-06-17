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

  test("uses explicit new-chat targets for top-level quick chat and project group actions", () => {
    const sidebar = read("src/renderer/features/sidebar/agents-sidebar.tsx")
    const actions = read("src/renderer/features/agents/lib/agents-actions.ts")
    const layout = read("src/renderer/features/layout/agents-layout.tsx")
    const hotkeys = read(
      "src/renderer/features/agents/lib/agents-hotkeys-manager.ts",
    )

    expect(sidebar).toContain(
      "const setNewChatTarget = useSetAtom(newChatTargetAtom)",
    )
    expect(sidebar).toContain('setNewChatTarget({ type: "quick" })')
    expect(sidebar).toContain(
      'setNewChatTarget({ type: "project", projectId: project.id })',
    )
    expect(sidebar).toContain('t("sidebar.newChat")')
    expect(sidebar).toContain('t("sidebar.startNewChat")')

    expect(actions).toContain(
      "setNewChatTarget?: (target: NewChatTarget) => void",
    )
    expect(actions).toContain('context.setNewChatTarget?.({ type: "quick" })')
    expect(actions).not.toContain(
      "await context.openProjectPickerForNewWorkspace?.()",
    )
    expect(layout).toContain(
      "const setNewChatTarget = useSetAtom(newChatTargetAtom)",
    )
    expect(layout).toContain("setNewChatTarget,")
    expect(hotkeys).toContain(
      "setNewChatTarget?: (target: NewChatTarget) => void",
    )
    expect(hotkeys).toContain("setNewChatTarget: config.setNewChatTarget")
  })
})
