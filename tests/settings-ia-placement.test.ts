import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

function read(path: string): string {
  return readFileSync(path, "utf8")
}

function expectContainsAll(source: string, markers: string[]) {
  for (const marker of markers) {
    expect(source).toContain(marker)
  }
}

function expectContainsNone(source: string, markers: string[]) {
  for (const marker of markers) {
    expect(source).not.toContain(marker)
  }
}

describe("Settings IA placement", () => {
  const models = read(
    "src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
  )
  const preferences = read(
    "src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx",
  )
  const appearance = read(
    "src/renderer/components/dialogs/settings-tabs/agents-appearance-tab.tsx",
  )
  const keyboard = read(
    "src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx",
  )
  const about = read(
    "src/renderer/components/dialogs/settings-tabs/agents-about-tab.tsx",
  )
  const commands = read(
    "src/renderer/components/dialogs/settings-tabs/agents-command-guide-tab.tsx",
  )
  const skills = read(
    "src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx",
  )
  const settingsContent = read(
    "src/renderer/features/settings/settings-content.tsx",
  )
  const settingsSidebar = read(
    "src/renderer/features/settings/settings-sidebar.tsx",
  )

  test("keeps local model and offline controls in the Models tab", () => {
    expectContainsAll(models, [
      "showOfflineModeFeaturesAtom",
      "autoOfflineModeAtom",
      "selectedOllamaModelAtom",
      "settings.models.localModels.title",
      "settings.models.offlineMode.title",
      "settings.models.offlineModel.title",
    ])
    expectContainsNone(preferences, [
      "showOfflineModeFeaturesAtom",
      "autoOfflineModeAtom",
      "selectedOllamaModelAtom",
    ])
  })

  test("keeps rollback and notifications grouped in Preferences", () => {
    expectContainsAll(preferences, [
      "historyEnabledAtom",
      "soundNotificationsEnabledAtom",
      "desktopNotificationsEnabledAtom",
      "notifyWhenFocusedAtom",
      "settings.preferences.rollback.title",
      "settings.preferences.notifications.title",
      "settings.preferences.desktopNotifications.title",
      "settings.preferences.soundNotifications.title",
      "settings.preferences.notifyWhenFocused.title",
    ])
    expect(
      preferences.indexOf("settings.preferences.notifications.title"),
    ).toBeLessThan(
      preferences.indexOf("settings.preferences.desktopNotifications.title"),
    )
    expect(preferences).not.toContain("ctrlTabTargetAtom")
  })

  test("keeps code theme pickers and Kanban controls in Appearance", () => {
    expectContainsAll(appearance, [
      "vscodeCodeThemeLightAtom",
      "vscodeCodeThemeDarkAtom",
      "kanbanViewEnabledAtom",
      "settings.appearance.codeTheme.title",
      "settings.appearance.codeTheme.light",
      "settings.appearance.codeTheme.dark",
      "settings.appearance.kanbanView",
    ])
    expectContainsNone(keyboard, [
      "vscodeCodeThemeLightAtom",
      "vscodeCodeThemeDarkAtom",
      "setKanbanViewEnabled",
      "settings.appearance.kanbanView",
    ])
  })

  test("keeps Ctrl+Tab configuration only in Keyboard", () => {
    expectContainsAll(keyboard, [
      "ctrlTabTargetAtom",
      "settings.keyboard.ctrlTabPreference",
    ])
    expect(preferences).not.toContain("ctrlTabTargetAtom")
    expect(appearance).not.toContain("ctrlTabTargetAtom")
  })

  test("keeps command file management in Commands, not Skills", () => {
    expectContainsAll(commands, [
      "trpc.commands.list.useQuery",
      "trpc.commands.create.useMutation",
      "trpc.commands.update.useMutation",
      "trpc.commands.delete.useMutation",
      "settings.commands.newCommand",
    ])
    expectContainsNone(skills, [
      "trpc.commands.list.useQuery",
      "trpc.commands.create.useMutation",
      "trpc.commands.update.useMutation",
      "trpc.commands.delete.useMutation",
      'setActiveView("commands")',
      "settings.skills.viewCommands",
    ])
  })

  test("keeps Debug unlock on About version and Beta tab removed", () => {
    expectContainsAll(about, [
      "DEVTOOLS_UNLOCK_CLICKS = 5",
      "versionClickCountRef",
      "setDevToolsUnlocked(true)",
      "window.desktopApi?.unlockDevTools()",
      "onClick={handleVersionClick}",
    ])
    expectContainsNone(settingsContent, ["AgentsBetaTab", 'case "beta"'])
    expectContainsNone(settingsSidebar, ['id: "beta"', "AgentsBetaTab"])
    expect(
      existsSync(
        "src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx",
      ),
    ).toBe(false)
  })
})
