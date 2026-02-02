import { useEffect } from "react"
import { useSetAtom } from "jotai"
import { desktopViewAtom } from "../features/agents/atoms"

/**
 * Hook to listen for tray events and handle them
 * These events are dispatched from the main process via executeJavaScript
 */
export function useTrayEvents() {
  const setDesktopView = useSetAtom(desktopViewAtom)

  useEffect(() => {
    // Handle workspace selection from tray
    const handleWorkspaceOpen = (event: CustomEvent) => {
      const { projectId } = event.detail
      console.log("[Tray Events] Workspace opened:", projectId)
      
      // The project is already set in localStorage by the tray handler
      // Window will reload automatically
    }

    // Handle settings open from tray
    const handleSettingsOpen = () => {
      console.log("[Tray Events] Opening settings via atom")
      // Set desktopView to 'settings' which opens the settings dialog
      setDesktopView("settings")
    }

    window.addEventListener("tray:open-workspace", handleWorkspaceOpen as EventListener)
    window.addEventListener("tray:open-settings", handleSettingsOpen)

    return () => {
      window.removeEventListener("tray:open-workspace", handleWorkspaceOpen as EventListener)
      window.removeEventListener("tray:open-settings", handleSettingsOpen)
    }
  }, [setDesktopView])
}
