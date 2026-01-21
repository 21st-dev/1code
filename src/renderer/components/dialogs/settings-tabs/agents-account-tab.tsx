/**
 * Account & Analytics Tab Component
 *
 * Tab 1: Account & Analytics - Contains profile, GitHub linking,
 * commit settings, usage analytics, and device sync.
 *
 * #NP - Settings Tab Component
 */

import { useState, useEffect } from "react"
import { useAtom } from "jotai"
import { cn } from "@/lib/utils"
import { deviceSyncEnabledAtom, githubLinkingMethodAtom } from "@/lib/atoms"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconSpinner } from "@/icons"
import { toast } from "sonner"
import {
  User,
  Github,
  GitCommit,
  BarChart3,
  Cloud,
  CloudOff,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Key,
  Shield,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react"

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

interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

// Section wrapper component
function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
  badge?: string
}) {
  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium flex items-center gap-2">
              {title}
              {badge && (
                <Badge variant="outline" className="text-[10px]">
                  {badge}
                </Badge>
              )}
            </h4>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// Profile Section
function ProfileSection() {
  const [user, setUser] = useState<DesktopUser | null>(null)
  const [fullName, setFullName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      if (window.desktopApi?.getUser) {
        const userData = await window.desktopApi.getUser()
        setUser(userData)
        setFullName(userData?.name || "")
      }
      setIsLoading(false)
    }
    fetchUser()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (window.desktopApi?.updateUser) {
        const updatedUser = await window.desktopApi.updateUser({ name: fullName })
        if (updatedUser) {
          setUser(updatedUser)
          toast.success("Profile updated successfully")
        }
      } else {
        throw new Error("Desktop API not available")
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconSpinner className="h-5 w-5" />
      </div>
    )
  }

  return (
    <SettingsSection
      icon={User}
      title="Profile"
      description="Your account information"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-sm">Full Name</Label>
            <p className="text-xs text-muted-foreground">Your display name</p>
          </div>
          <div className="w-64">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your name"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-sm">Email</Label>
            <p className="text-xs text-muted-foreground">Account email</p>
          </div>
          <div className="w-64">
            <Input value={user?.email || ""} disabled className="opacity-60" />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving && <IconSpinner className="h-3 w-3 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

// GitHub Linking Section
function GitHubLinkingSection() {
  const [linkingMethod, setLinkingMethod] = useAtom(githubLinkingMethodAtom)
  const [isLinked, setIsLinked] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [patToken, setPatToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)

  // Check GitHub link status on mount
  useEffect(() => {
    // TODO: Check with backend via tRPC
    // For now, mock the status
    const checkStatus = async () => {
      // trpc.github.getStatus.query()
    }
    checkStatus()
  }, [])

  const handleOAuthConnect = async () => {
    setIsConnecting(true)
    try {
      // TODO: Trigger OAuth flow via tRPC
      // await trpc.github.startOAuth.mutate()
      toast.info("Opening GitHub authorization...")
      // Simulate delay
      await new Promise((resolve) => setTimeout(resolve, 2000))
      toast.success("GitHub connected successfully!")
      setIsLinked(true)
      setGithubUsername("user123")
    } catch (error) {
      toast.error("Failed to connect to GitHub")
    } finally {
      setIsConnecting(false)
    }
  }

  const handlePatConnect = async () => {
    if (!patToken.trim()) {
      toast.error("Please enter a Personal Access Token")
      return
    }
    setIsConnecting(true)
    try {
      // TODO: Validate and save PAT via tRPC
      // await trpc.github.linkWithPAT.mutate({ token: patToken })
      await new Promise((resolve) => setTimeout(resolve, 1000))
      toast.success("GitHub PAT connected successfully!")
      setIsLinked(true)
      setGithubUsername("user123")
      setPatToken("")
    } catch (error) {
      toast.error("Invalid Personal Access Token")
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setIsLinked(false)
    setGithubUsername(null)
    toast.success("GitHub disconnected")
  }

  return (
    <SettingsSection
      icon={Github}
      title="GitHub Linking"
      description="Connect your GitHub account for enhanced features"
    >
      <div className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                isLinked ? "bg-green-500/20" : "bg-muted"
              )}
            >
              {isLinked ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Github className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {isLinked ? "Connected" : "Not Connected"}
              </p>
              {githubUsername && (
                <p className="text-xs text-muted-foreground">
                  @{githubUsername}
                </p>
              )}
            </div>
          </div>
          {isLinked && (
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              <X className="h-3 w-3 mr-1" />
              Disconnect
            </Button>
          )}
        </div>

        {!isLinked && (
          <>
            {/* Method Toggle */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
              <button
                onClick={() => setLinkingMethod("oauth")}
                className={cn(
                  "flex-1 py-2 px-3 rounded text-sm font-medium transition-all",
                  linkingMethod === "oauth"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Shield className="h-3 w-3 inline mr-1.5" />
                OAuth (Recommended)
              </button>
              <button
                onClick={() => setLinkingMethod("pat")}
                className={cn(
                  "flex-1 py-2 px-3 rounded text-sm font-medium transition-all",
                  linkingMethod === "pat"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Key className="h-3 w-3 inline mr-1.5" />
                Personal Access Token
              </button>
            </div>

            {/* OAuth Connect */}
            {linkingMethod === "oauth" && (
              <Button
                onClick={handleOAuthConnect}
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? (
                  <IconSpinner className="h-4 w-4 mr-2" />
                ) : (
                  <Github className="h-4 w-4 mr-2" />
                )}
                Connect with GitHub
              </Button>
            )}

            {/* PAT Input */}
            {linkingMethod === "pat" && (
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <a
                    href="https://github.com/settings/tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Create a new token
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button
                    onClick={handlePatConnect}
                    disabled={isConnecting || !patToken.trim()}
                    size="sm"
                  >
                    {isConnecting && <IconSpinner className="h-3 w-3 mr-2" />}
                    Connect
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SettingsSection>
  )
}

// Commit Settings Section
function CommitSettingsSection() {
  const [authorName, setAuthorName] = useState("")
  const [authorEmail, setAuthorEmail] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // TODO: Save to backend via tRPC
      await new Promise((resolve) => setTimeout(resolve, 500))
      toast.success("Commit settings saved")
    } catch (error) {
      toast.error("Failed to save commit settings")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingsSection
      icon={GitCommit}
      title="Commit Settings"
      description="Default author information for git commits"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-sm">Author Name</Label>
            <p className="text-xs text-muted-foreground">Git commit author</p>
          </div>
          <div className="w-64">
            <Input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your Name"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-sm">Author Email</Label>
            <p className="text-xs text-muted-foreground">Git commit email</p>
          </div>
          <div className="w-64">
            <Input
              type="email"
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving && <IconSpinner className="h-3 w-3 mr-2" />}
            Save Settings
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

// Usage Analytics Section
function UsageAnalyticsSection() {
  const [isLoading, setIsLoading] = useState(false)

  // Mock analytics data
  const analytics = {
    totalTokens: 1234567,
    totalChats: 42,
    totalProjects: 8,
    tokensThisMonth: 456789,
    avgTokensPerChat: 29394,
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const handleRefresh = async () => {
    setIsLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsLoading(false)
    toast.success("Analytics refreshed")
  }

  return (
    <SettingsSection
      icon={BarChart3}
      title="Usage Analytics"
      description="Your usage statistics and insights"
    >
      <div className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-2xl font-bold text-primary">
              {formatNumber(analytics.totalTokens)}
            </p>
            <p className="text-xs text-muted-foreground">Total Tokens</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-2xl font-bold text-primary">
              {analytics.totalChats}
            </p>
            <p className="text-xs text-muted-foreground">Total Chats</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-2xl font-bold text-primary">
              {analytics.totalProjects}
            </p>
            <p className="text-xs text-muted-foreground">Projects</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-2xl font-bold text-primary">
              {formatNumber(analytics.tokensThisMonth)}
            </p>
            <p className="text-xs text-muted-foreground">This Month</p>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn("h-3 w-3 mr-2", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

// Device Sync Section
function DeviceSyncSection() {
  const [syncEnabled, setSyncEnabled] = useAtom(deviceSyncEnabledAtom)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      // TODO: Trigger sync via tRPC
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setLastSynced(new Date())
      toast.success("Sync completed")
    } catch (error) {
      toast.error("Sync failed")
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <SettingsSection
      icon={syncEnabled ? Cloud : CloudOff}
      title="Device Sync"
      description="Sync settings and data across devices"
      badge="21st.dev"
    >
      <div className="space-y-4">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-sm">Enable Cloud Sync</Label>
            <p className="text-xs text-muted-foreground">
              Sync via 21st.dev API
            </p>
          </div>
          <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} />
        </div>

        {syncEnabled && (
          <>
            {/* Sync Status */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Sync Status</p>
                <p className="text-xs text-muted-foreground">
                  {lastSynced
                    ? `Last synced: ${lastSynced.toLocaleTimeString()}`
                    : "Not synced yet"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <IconSpinner className="h-3 w-3 mr-2" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-2" />
                )}
                Sync Now
              </Button>
            </div>

            {/* Sync Options */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Sync includes:
              </Label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Check className="h-3 w-3 text-green-500" />
                  Settings
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Check className="h-3 w-3 text-green-500" />
                  Preferences
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Check className="h-3 w-3 text-green-500" />
                  Theme
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Check className="h-3 w-3 text-green-500" />
                  Custom Commands
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  )
}

export function AgentsAccountTab() {
  const isNarrowScreen = useIsNarrowScreen()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {!isNarrowScreen && (
        <div>
          <h3 className="text-lg font-semibold">Account & Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Manage your profile, connections, and usage
          </p>
        </div>
      )}

      {/* Profile Section */}
      <ProfileSection />

      {/* GitHub Linking */}
      <GitHubLinkingSection />

      {/* Commit Settings */}
      <CommitSettingsSection />

      {/* Usage Analytics */}
      <UsageAnalyticsSection />

      {/* Device Sync */}
      <DeviceSyncSection />
    </div>
  )
}

export default AgentsAccountTab
