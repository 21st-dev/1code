import { useTheme } from "next-themes"
import { useState, useEffect, useCallback, useMemo } from "react"
import { IconSpinner } from "../../../icons"
import { useAtom, useSetAtom } from "jotai"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "../../../lib/utils"
import {
  selectedFullThemeIdAtom,
  fullThemeDataAtom,
  systemLightThemeIdAtom,
  systemDarkThemeIdAtom,
  showWorkspaceIconAtom,
  alwaysExpandTodoListAtom,
  importedThemesAtom,
  type VSCodeFullTheme,
} from "../../../lib/atoms"
import {
  BUILTIN_THEMES,
  getBuiltinThemeById,
  BUILTIN_THEME_NAMES,
} from "../../../lib/themes/builtin-themes"
import {
  generateCSSVariables,
  applyCSSVariables,
  removeCSSVariables,
  getThemeTypeFromColors,
} from "../../../lib/themes/vscode-to-css-mapping"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectSeparator,
  SelectLabel,
  SelectGroup,
} from "../../../components/ui/select"
import { Switch } from "../../../components/ui/switch"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

// Check if a hex color is visible (not too transparent)
function isVisibleColor(hex: string | undefined): boolean {
  if (!hex) return false
  // Remove # if present
  const cleanHex = hex.replace(/^#/, "")
  // If 8 characters, check alpha
  if (cleanHex.length === 8) {
    const alpha = parseInt(cleanHex.slice(6, 8), 16)
    // Consider colors with less than 50% opacity as "not visible" for accent purposes
    return alpha >= 128
  }
  return true
}

// Theme preview box with dot and "Aa" text
function ThemePreviewBox({
  theme,
  size = "md",
  className,
}: {
  theme: VSCodeFullTheme | null
  size?: "sm" | "md"
  className?: string
}) {
  const bgColor = theme?.colors?.["editor.background"] || "#1a1a1a"
  
  // Get accent color, preferring button.background and skipping transparent colors
  const getAccentColor = () => {
    const candidates = [
      theme?.colors?.["button.background"],
      theme?.colors?.["textLink.foreground"],
      theme?.colors?.["focusBorder"],
      theme?.colors?.["activityBarBadge.background"],
    ]
    for (const color of candidates) {
      if (isVisibleColor(color)) {
        return color
      }
    }
    return "#0034FF"
  }
  
  const accentColor = getAccentColor()
  const isDark = theme ? theme.type === "dark" : true

  const sizeClasses =
    size === "sm"
      ? "w-7 h-5 text-[9px] gap-0.5 rounded-sm"
      : "w-8 h-6 text-[10px] gap-1 rounded-sm"

  const dotSize = size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5"

  return (
    <div
      className={cn(
        "flex-shrink-0 flex items-center justify-center font-semibold",
        sizeClasses,
        className,
      )}
      style={{
        backgroundColor: bgColor,
        boxShadow: "inset 0 0 0 0.5px rgba(128, 128, 128, 0.3)",
      }}
    >
      {/* Accent dot to the left of text */}
      <div
        className={cn("rounded-full flex-shrink-0", dotSize)}
        style={{ backgroundColor: accentColor }}
      />
      <span style={{ color: isDark ? "#fff" : "#000", opacity: 0.9 }}>Aa</span>
    </div>
  )
}

export function AgentsAppearanceTab() {
  const { resolvedTheme, setTheme: setNextTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const isNarrowScreen = useIsNarrowScreen()

  // Theme atoms
  const [selectedThemeId, setSelectedThemeId] = useAtom(selectedFullThemeIdAtom)
  const [systemLightThemeId, setSystemLightThemeId] = useAtom(
    systemLightThemeIdAtom,
  )
  const [systemDarkThemeId, setSystemDarkThemeId] = useAtom(
    systemDarkThemeIdAtom,
  )
  const setFullThemeData = useSetAtom(fullThemeDataAtom)
  const [importedThemes, setImportedThemes] = useAtom(importedThemesAtom)

  // Sidebar settings
  const [showWorkspaceIcon, setShowWorkspaceIcon] = useAtom(showWorkspaceIconAtom)

  // To-do list preference
  const [alwaysExpandTodoList, setAlwaysExpandTodoList] = useAtom(alwaysExpandTodoListAtom)

  // VS Code themes state
  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Scan and load VS Code themes on mount
  useEffect(() => {
    if (!mounted) return
    const api = window.desktopApi
    if (typeof api?.scanVSCodeThemes !== "function") return
    if (typeof api?.loadVSCodeTheme !== "function") return

    const loadAllThemes = async () => {
      setIsScanning(true)
      try {
        const discovered = await api.scanVSCodeThemes()
        // Filter out themes that are already builtin
        const newThemes = discovered.filter(
          (t) => !BUILTIN_THEME_NAMES.has(t.name.toLowerCase())
        )

        // Load all themes in parallel
        const loadedThemes = await Promise.all(
          newThemes.map(async (theme) => {
            try {
              const fullTheme = await api.loadVSCodeTheme(theme.path)
              return {
                ...fullTheme,
                id: theme.id,
                source: "imported" as const,
              } as VSCodeFullTheme
            } catch (err) {
              console.error("[appearance-tab] Failed to load theme:", theme.name, err)
              return null
            }
          })
        )

        // Filter out failed loads and update imported themes
        const validThemes = loadedThemes.filter((t): t is VSCodeFullTheme => t !== null)
        setImportedThemes(validThemes)
      } catch (error) {
        console.error("Failed to load VS Code themes:", error)
      } finally {
        setIsScanning(false)
      }
    }

    loadAllThemes()
  }, [mounted, setImportedThemes])

  // Group themes by type
  const darkThemes = useMemo(
    () => BUILTIN_THEMES.filter((t) => t.type === "dark"),
    [],
  )
  const lightThemes = useMemo(
    () => BUILTIN_THEMES.filter((t) => t.type === "light"),
    [],
  )

  // Is system mode selected
  const isSystemMode = selectedThemeId === null

  // Get the current theme for display
  const currentTheme = useMemo(() => {
    if (selectedThemeId === null) {
      return null // System mode
    }
    // Check in both builtin and imported themes
    return BUILTIN_THEMES.find((t) => t.id === selectedThemeId) ||
           importedThemes.find((t) => t.id === selectedThemeId) ||
           null
  }, [selectedThemeId, importedThemes])

  // Get theme objects for system mode selectors
  const systemLightTheme = useMemo(
    () => getBuiltinThemeById(systemLightThemeId),
    [systemLightThemeId],
  )
  const systemDarkTheme = useMemo(
    () => getBuiltinThemeById(systemDarkThemeId),
    [systemDarkThemeId],
  )

  // Apply theme based on current settings
  const applyTheme = useCallback(
    (themeId: string | null) => {
      if (themeId === null) {
        // System mode - apply theme based on system preference
        removeCSSVariables()
        setFullThemeData(null)
        setNextTheme("system")

        // Apply the appropriate system theme
        const isDark = resolvedTheme === "dark"
        const systemTheme = isDark
          ? getBuiltinThemeById(systemDarkThemeId)
          : getBuiltinThemeById(systemLightThemeId)

        if (systemTheme) {
          const cssVars = generateCSSVariables(systemTheme.colors)
          applyCSSVariables(cssVars)
        }
        return
      }

      // Check in both builtin and imported themes
      const theme = BUILTIN_THEMES.find((t) => t.id === themeId) ||
                    importedThemes.find((t) => t.id === themeId)
      if (theme) {
        setFullThemeData(theme)

        // Apply CSS variables
        const cssVars = generateCSSVariables(theme.colors)
        applyCSSVariables(cssVars)

        // Sync next-themes with theme type
        const themeType = getThemeTypeFromColors(theme.colors)
        if (themeType === "dark") {
          document.documentElement.classList.add("dark")
          document.documentElement.classList.remove("light")
        } else {
          document.documentElement.classList.remove("dark")
          document.documentElement.classList.add("light")
        }
        setNextTheme(themeType)
      }
    },
    [
      resolvedTheme,
      systemLightThemeId,
      systemDarkThemeId,
      setFullThemeData,
      setNextTheme,
      importedThemes,
    ],
  )

  // Handle main theme selection
  const handleThemeChange = useCallback(
    (value: string) => {
      if (value === "system") {
        setSelectedThemeId(null)
        applyTheme(null)
      } else {
        setSelectedThemeId(value)
        applyTheme(value)
      }
    },
    [setSelectedThemeId, applyTheme],
  )

  // Handle system light theme change
  const handleSystemLightThemeChange = useCallback(
    (themeId: string) => {
      setSystemLightThemeId(themeId)
      // If currently in light mode, apply the new theme
      if (resolvedTheme === "light" && selectedThemeId === null) {
        const theme = getBuiltinThemeById(themeId)
        if (theme) {
          const cssVars = generateCSSVariables(theme.colors)
          applyCSSVariables(cssVars)
        }
      }
    },
    [setSystemLightThemeId, resolvedTheme, selectedThemeId],
  )

  // Handle system dark theme change
  const handleSystemDarkThemeChange = useCallback(
    (themeId: string) => {
      setSystemDarkThemeId(themeId)
      // If currently in dark mode, apply the new theme
      if (resolvedTheme === "dark" && selectedThemeId === null) {
        const theme = getBuiltinThemeById(themeId)
        if (theme) {
          const cssVars = generateCSSVariables(theme.colors)
          applyCSSVariables(cssVars)
        }
      }
    },
    [setSystemDarkThemeId, resolvedTheme, selectedThemeId],
  )

  // Group imported themes by type
  const importedDarkThemes = useMemo(
    () => importedThemes.filter((t) => t.type === "dark"),
    [importedThemes],
  )
  const importedLightThemes = useMemo(
    () => importedThemes.filter((t) => t.type === "light"),
    [importedThemes],
  )

  // Re-apply theme when system preference changes
  useEffect(() => {
    if (selectedThemeId === null && mounted) {
      const isDark = resolvedTheme === "dark"
      const systemTheme = isDark
        ? getBuiltinThemeById(systemDarkThemeId)
        : getBuiltinThemeById(systemLightThemeId)

      if (systemTheme) {
        const cssVars = generateCSSVariables(systemTheme.colors)
        applyCSSVariables(cssVars)
      }
    }
  }, [
    resolvedTheme,
    selectedThemeId,
    systemLightThemeId,
    systemDarkThemeId,
    mounted,
  ])

  if (!mounted) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-48 flex items-center justify-center">
          <IconSpinner className="h-8 w-8 text-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 flex-1 overflow-y-auto scrollbar-thin">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
          <p className="text-xs text-muted-foreground">
            Customize the look and feel of the interface
          </p>
        </div>
      )}

      {/* Interface Theme Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        {/* Main theme selector */}
        <div className="flex items-center justify-between p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Interface theme
            </span>
            <span className="text-xs text-muted-foreground">
              Select or customize your interface color scheme
            </span>
          </div>

          <Select
            value={selectedThemeId ?? "system"}
            onValueChange={handleThemeChange}
          >
            <SelectTrigger className="w-auto px-2">
              <div className="flex items-center gap-2 min-w-0 -ml-[3px]">
                {isSystemMode ? (
                  <>
                    <ThemePreviewBox
                      theme={
                        resolvedTheme === "dark"
                          ? (systemDarkTheme ?? null)
                          : (systemLightTheme ?? null)
                      }
                    />
                    <span className="text-xs truncate">System preference</span>
                  </>
                ) : (
                  <>
                    <ThemePreviewBox theme={currentTheme} />
                    <span className="text-xs truncate">
                      {currentTheme?.name || "Select"}
                    </span>
                  </>
                )}
              </div>
            </SelectTrigger>
            <SelectContent>
              {/* System preference option */}
              <SelectItem value="system">
                <div className="flex items-center gap-2">
                  <ThemePreviewBox
                    theme={
                      resolvedTheme === "dark"
                        ? (systemDarkTheme ?? null)
                        : (systemLightTheme ?? null)
                    }
                    size="sm"
                  />
                  <span className="truncate">System preference</span>
                </div>
              </SelectItem>

              {/* Light themes */}
              {lightThemes.map((theme) => (
                <SelectItem key={theme.id} value={theme.id}>
                  <div className="flex items-center gap-2">
                    <ThemePreviewBox theme={theme} size="sm" />
                    <span className="truncate">{theme.name}</span>
                  </div>
                </SelectItem>
              ))}

              {/* Dark themes */}
              {darkThemes.map((theme) => (
                <SelectItem key={theme.id} value={theme.id}>
                  <div className="flex items-center gap-2">
                    <ThemePreviewBox theme={theme} size="sm" />
                    <span className="truncate">{theme.name}</span>
                  </div>
                </SelectItem>
              ))}

              {/* Imported themes from VS Code / Cursor / Windsurf */}
              {importedThemes.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground px-2">
                      From editors
                    </SelectLabel>
                    {importedThemes.map((theme) => (
                      <SelectItem key={theme.id} value={theme.id}>
                        <div className="flex items-center gap-2">
                          <ThemePreviewBox theme={theme} size="sm" />
                          <span className="truncate">{theme.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}

              {/* Loading indicator */}
              {isScanning && (
                <>
                  <SelectSeparator />
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <IconSpinner className="h-3 w-3" />
                    <span>Loading themes from editors...</span>
                  </div>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Animated Light/Dark theme selectors for system mode */}
        <AnimatePresence initial={false}>
          {isSystemMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="overflow-hidden"
            >
              {/* Light theme selector */}
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex flex-col space-y-1">
                  <span className="text-sm font-medium text-foreground">
                    Light
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Theme to use for light system appearance
                  </span>
                </div>

                <Select
                  value={systemLightThemeId}
                  onValueChange={handleSystemLightThemeChange}
                >
                  <SelectTrigger className="w-auto px-2">
                    <div className="flex items-center gap-2 min-w-0 -ml-[3px]">
                      <ThemePreviewBox theme={systemLightTheme || null} />
                      <span className="text-xs truncate">
                        {systemLightTheme?.name || "Select"}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {lightThemes.map((theme) => (
                      <SelectItem key={theme.id} value={theme.id}>
                        <div className="flex items-center gap-2">
                          <ThemePreviewBox theme={theme} size="sm" />
                          <span className="truncate">{theme.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dark theme selector */}
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex flex-col space-y-1">
                  <span className="text-sm font-medium text-foreground">
                    Dark
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Theme to use for dark system appearance
                  </span>
                </div>

                <Select
                  value={systemDarkThemeId}
                  onValueChange={handleSystemDarkThemeChange}
                >
                  <SelectTrigger className="w-auto px-2">
                    <div className="flex items-center gap-2 min-w-0 -ml-[3px]">
                      <ThemePreviewBox theme={systemDarkTheme || null} />
                      <span className="text-xs truncate">
                        {systemDarkTheme?.name || "Select"}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {darkThemes.map((theme) => (
                      <SelectItem key={theme.id} value={theme.id}>
                        <div className="flex items-center gap-2">
                          <ThemePreviewBox theme={theme} size="sm" />
                          <span className="truncate">{theme.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      {/* Display Options Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Workspace icon
            </span>
            <span className="text-xs text-muted-foreground">
              Show project icon in the sidebar workspace list
            </span>
          </div>
          <Switch
            checked={showWorkspaceIcon}
            onCheckedChange={setShowWorkspaceIcon}
          />
        </div>
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Always expand to-do list
            </span>
            <span className="text-xs text-muted-foreground">
              Show the full to-do list instead of compact view
            </span>
          </div>
          <Switch
            checked={alwaysExpandTodoList}
            onCheckedChange={setAlwaysExpandTodoList}
          />
        </div>
      </div>
    </div>
  )
}
