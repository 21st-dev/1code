import { useAtom } from "jotai"
import { useState, useEffect } from "react"
import {
  extendedThinkingEnabledAtom,
  soundNotificationsEnabledAtom,
  analyticsOptOutAtom,
  ctrlTabTargetAtom,
  notificationModeAtom,
  toastNotificationsEnabledAtom,
  type CtrlTabTarget,
  type NotificationMode,
} from "../../../lib/atoms"
import { rightPanelOpenAtom } from "../../../features/right-panel/atoms"
import { Switch } from "../../ui/switch"
import { Button } from "../../ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../ui/select"
import { Kbd } from "../../ui/kbd"

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

export function AgentsPreferencesTab() {
  const [thinkingEnabled, setThinkingEnabled] = useAtom(
    extendedThinkingEnabledAtom,
  )
  const [soundEnabled, setSoundEnabled] = useAtom(soundNotificationsEnabledAtom)
  const [analyticsOptOut, setAnalyticsOptOut] = useAtom(analyticsOptOutAtom)
  const [ctrlTabTarget, setCtrlTabTarget] = useAtom(ctrlTabTargetAtom)
  const [notificationMode, setNotificationMode] = useAtom(notificationModeAtom)
  const [toastEnabled, setToastEnabled] = useAtom(toastNotificationsEnabledAtom)
  const [rightPanelOpen, setRightPanelOpen] = useAtom(rightPanelOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()

  // Sync opt-out status to main process
  const handleAnalyticsToggle = async (optedOut: boolean) => {
    setAnalyticsOptOut(optedOut)
    // Notify main process
    try {
      await window.desktopApi?.setAnalyticsOptOut(optedOut)
    } catch (error) {
      console.error("Failed to sync analytics opt-out to main process:", error)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Preferences</h3>
          <p className="text-xs text-muted-foreground">
            Configure Claude's behavior and features
          </p>
        </div>
      )}

      {/* Features Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="p-4 space-y-6">
          {/* Extended Thinking Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                Extended Thinking
              </span>
              <span className="text-xs text-muted-foreground">
                Enable deeper reasoning with more thinking tokens (uses more
                credits).{" "}
                <span className="text-foreground/70">Disables response streaming.</span>
              </span>
            </div>
            <Switch
              checked={thinkingEnabled}
              onCheckedChange={setThinkingEnabled}
            />
          </div>

          {/* Sound Notifications Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                Sound Notifications
              </span>
              <span className="text-xs text-muted-foreground">
                Play a sound when agent completes work while you're away
              </span>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Notifications</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Configure how you get notified about agent activity
          </p>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Notification Mode */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  Notification Mode
                </span>
                <span className="text-xs text-muted-foreground">
                  When to show notifications
                </span>
              </div>
              <Select
                value={notificationMode}
                onValueChange={(value: NotificationMode) => setNotificationMode(value)}
              >
                <SelectTrigger className="w-auto px-2">
                  <span className="text-xs">
                    {notificationMode === "always"
                      ? "Always"
                      : notificationMode === "unfocused"
                        ? "When unfocused"
                        : "Never"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always notify</SelectItem>
                  <SelectItem value="unfocused">Only when app not focused</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toast Notifications Toggle */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  Toast Notifications
                </span>
                <span className="text-xs text-muted-foreground">
                  Show toast popups for tool executions
                </span>
              </div>
              <Switch checked={toastEnabled} onCheckedChange={setToastEnabled} />
            </div>

            {/* Activity Feed Toggle */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  Activity Feed
                </span>
                <span className="text-xs text-muted-foreground">
                  Show activity feed and terminals panel on the right side
                </span>
              </div>
              <Switch checked={rightPanelOpen} onCheckedChange={setRightPanelOpen} />
            </div>

            {/* Test Notification Button */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  Test Notification
                </span>
                <span className="text-xs text-muted-foreground">
                  Send a test notification to verify it's working
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.desktopApi?.showNotification({
                    title: "21st Agents",
                    body: "Notifications are working!",
                  })
                }}
              >
                Test
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Section */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-start justify-between p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Quick Switch
            </span>
            <span className="text-xs text-muted-foreground">
              What <Kbd>⌃Tab</Kbd> switches between
            </span>
          </div>

          <Select
            value={ctrlTabTarget}
            onValueChange={(value: CtrlTabTarget) => setCtrlTabTarget(value)}
          >
            <SelectTrigger className="w-auto px-2">
              <span className="text-xs">
                {ctrlTabTarget === "workspaces" ? "Workspaces" : "Agents"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspaces">Workspaces</SelectItem>
              <SelectItem value="agents">Agents</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Privacy Section */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Privacy</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Control what data you share with us
          </p>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4">
            {/* Share Usage Analytics */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-foreground">
                  Share Usage Analytics
                </span>
                <span className="text-xs text-muted-foreground">
                  Help us improve Agents by sharing anonymous usage data. We only track feature usage and app performance–never your code, prompts, or messages. No AI training on your data.
                </span>
              </div>
              <Switch
                checked={!analyticsOptOut}
                onCheckedChange={(enabled) => handleAnalyticsToggle(!enabled)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
