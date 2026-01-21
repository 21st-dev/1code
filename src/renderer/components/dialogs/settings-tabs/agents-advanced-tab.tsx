/**
 * Advanced Tab Component
 *
 * Tab 7: Advanced - Contains integrations, external tools status, sharing API,
 * webserver config, and hidden ADB panel (easter egg).
 *
 * #NP - Settings Tab Component
 */

import { useAtom } from "jotai"
import { useRef, useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { adbClickCountAtom, adbUnlockedAtom } from "@/lib/atoms"
import {
  Hammer,
  Smartphone,
  Camera,
  FileText,
  Terminal,
  Download,
  Monitor,
  Server,
  Globe,
  Shield,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AgentsIntegrationsTab } from "./agents-integrations-tab"

// Easter egg configuration
const EASTER_EGG_CLICKS = 7
const EASTER_EGG_TIMEOUT = 3000 // 3 seconds

// ADB Panel Component (hidden until unlocked)
function ADBPanel() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<string | null>(null)

  // Mock devices for now - will be connected to ADB tRPC router
  const devices = [
    { id: "device1", name: "Pixel 7 Pro", status: "connected" },
    { id: "device2", name: "Galaxy S23", status: "offline" },
  ]

  const adbActions = [
    {
      id: "screen-mirror",
      label: "Screen Mirror",
      icon: Monitor,
      description: "Mirror Android device screen",
    },
    {
      id: "logcat",
      label: "Logcat Capture",
      icon: FileText,
      description: "Stream logs to chat",
    },
    {
      id: "install-apk",
      label: "Install APK",
      icon: Download,
      description: "Push debug builds",
    },
    {
      id: "screenshot",
      label: "Screenshot",
      icon: Camera,
      description: "Capture for analysis",
    },
    {
      id: "shell",
      label: "Device Shell",
      icon: Terminal,
      description: "ADB shell terminal",
    },
  ]

  const handleAction = async (actionId: string) => {
    if (!selectedDevice) return
    setIsLoading(actionId)
    // TODO: Connect to ADB tRPC router
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsLoading(null)
  }

  return (
    <div className="bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-fuchsia-500/10 rounded-lg border border-violet-500/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-violet-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Smartphone className="h-4 w-4 text-violet-500" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium flex items-center gap-2">
              ADB Development Tools
              <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-500">
                Developer
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Android Debug Bridge integration
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          {/* Device Selector */}
          <div className="space-y-2">
            <Label className="text-xs">Connected Devices</Label>
            <div className="grid gap-2">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => setSelectedDevice(device.id)}
                  disabled={device.status !== "connected"}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border transition-all",
                    selectedDevice === device.id
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-border hover:border-violet-500/30",
                    device.status !== "connected" && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    <span className="text-sm">{device.name}</span>
                  </div>
                  <Badge
                    variant={device.status === "connected" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {device.status}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          {/* ADB Actions */}
          {selectedDevice && (
            <div className="space-y-2">
              <Label className="text-xs">Actions</Label>
              <div className="grid grid-cols-2 gap-2">
                {adbActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <Tooltip key={action.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-auto py-3 flex flex-col items-center gap-1.5"
                          onClick={() => handleAction(action.id)}
                          disabled={isLoading !== null}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              isLoading === action.id && "animate-pulse"
                            )}
                          />
                          <span className="text-xs">{action.label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{action.description}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/30">
            <p>
              Requires ADB installed and device USB debugging enabled.{" "}
              <a
                href="https://developer.android.com/studio/command-line/adb"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-500 hover:underline inline-flex items-center gap-1"
              >
                Learn more
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Sharing API Section
function SharingAPISection() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [copied, setCopied] = useState(false)
  const apiEndpoint = "http://localhost:3789/api/v1"

  const handleCopy = () => {
    navigator.clipboard.writeText(apiEndpoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Sharing API</h4>
          <Badge variant="outline" className="text-[10px]">
            Experimental
          </Badge>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">
        Expose a local API for external tools and scripts to interact with the
        application.
      </p>
      {isEnabled && (
        <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
          <code className="text-xs flex-1 font-mono">{apiEndpoint}</code>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

// Webserver Config Section
function WebserverConfigSection() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [host, setHost] = useState("0.0.0.0")
  const [port, setPort] = useState("3790")

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Network Access</h4>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">
        Allow access from other devices on your network for remote control and
        mobile companion apps.
      </p>
      {isEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Host</Label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
              placeholder="0.0.0.0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Port</Label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
              placeholder="3790"
            />
          </div>
        </div>
      )}
      {isEnabled && (
        <div className="flex items-start gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/30">
          <Shield className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Only enable on trusted networks. This exposes the application to
            network access.
          </p>
        </div>
      )}
    </div>
  )
}

// Easter Egg Hammer Icon
function EasterEggTrigger({
  onUnlock,
  isUnlocked,
}: {
  onUnlock: () => void
  isUnlocked: boolean
}) {
  const [clickCount, setClickCount] = useAtom(adbClickCountAtom)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleClick = useCallback(() => {
    if (isUnlocked) return

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    const newCount = clickCount + 1
    setClickCount(newCount)

    if (newCount >= EASTER_EGG_CLICKS) {
      onUnlock()
      setClickCount(0)
    } else {
      // Reset after timeout
      timeoutRef.current = setTimeout(() => {
        setClickCount(0)
      }, EASTER_EGG_TIMEOUT)
    }
  }, [clickCount, isUnlocked, onUnlock, setClickCount])

  // Show progress indicator when clicking
  const progress = clickCount > 0 && clickCount < EASTER_EGG_CLICKS

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
            progress
              ? "bg-violet-500/20 animate-pulse"
              : "hover:bg-muted/50",
            isUnlocked && "text-violet-500"
          )}
        >
          <Hammer
            className={cn(
              "h-4 w-4",
              progress && "text-violet-500"
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isUnlocked
          ? "Developer tools unlocked"
          : progress
            ? `${EASTER_EGG_CLICKS - clickCount} more...`
            : "Build tools"}
      </TooltipContent>
    </Tooltip>
  )
}

export function AgentsAdvancedTab() {
  const [adbUnlocked, setAdbUnlocked] = useAtom(adbUnlockedAtom)

  const handleUnlock = useCallback(() => {
    setAdbUnlocked(true)
  }, [setAdbUnlocked])

  return (
    <div className="p-6 space-y-6">
      {/* Header with Easter Egg */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Advanced Settings</h3>
          <p className="text-sm text-muted-foreground">
            Integrations, external tools, and developer options
          </p>
        </div>
        <EasterEggTrigger onUnlock={handleUnlock} isUnlocked={adbUnlocked} />
      </div>

      {/* Integrations Section */}
      <div className="bg-background rounded-lg border border-border p-4">
        <AgentsIntegrationsTab />
      </div>

      {/* Sharing API */}
      <SharingAPISection />

      {/* Webserver Config */}
      <WebserverConfigSection />

      {/* ADB Panel (only shown when unlocked) */}
      {adbUnlocked && <ADBPanel />}
    </div>
  )
}

export default AgentsAdvancedTab
