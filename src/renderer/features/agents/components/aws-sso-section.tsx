"use client"

import { useState, useEffect, useCallback, ChangeEvent } from "react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { IconSpinner } from "../../../components/ui/icons"
import { Check, ExternalLink, LogOut, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { trpc } from "../../../lib/trpc"

interface AwsSsoSectionProps {
  bedrockRegion: string
  onBedrockRegionChange: (region: string) => void
  onSave: () => void
  isSaving: boolean
}

type ConnectionMethod = "sso" | "profile"

interface SsoAccount {
  accountId: string
  accountName: string
  emailAddress: string
}

interface SsoRole {
  roleName: string
  accountId: string
}

// AWS Regions with Bedrock availability
const BEDROCK_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
]

// SSO Regions (common regions for IAM Identity Center)
const SSO_REGIONS = [
  { value: "us-east-1", label: "us-east-1" },
  { value: "us-east-2", label: "us-east-2" },
  { value: "us-west-2", label: "us-west-2" },
  { value: "eu-west-1", label: "eu-west-1" },
  { value: "eu-central-1", label: "eu-central-1" },
  { value: "ap-northeast-1", label: "ap-northeast-1" },
  { value: "ap-southeast-1", label: "ap-southeast-1" },
  { value: "ap-southeast-2", label: "ap-southeast-2" },
]

export function AwsSsoSection({
  bedrockRegion,
  onBedrockRegionChange,
  onSave,
  isSaving,
}: AwsSsoSectionProps) {
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>("sso")
  const [ssoStartUrl, setSsoStartUrl] = useState("")
  const [ssoRegion, setSsoRegion] = useState("us-east-1")
  const [awsProfileName, setAwsProfileName] = useState("")

  // SSO login state
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isSelectingProfile, setIsSelectingProfile] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Account/role selection
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [selectedRoleName, setSelectedRoleName] = useState("")
  const [accounts, setAccounts] = useState<SsoAccount[]>([])
  const [roles, setRoles] = useState<SsoRole[]>([])

  // tRPC queries and mutations
  const { data: ssoStatus, refetch: refetchStatus } = trpc.awsSso.getStatus.useQuery()
  const startBrowserAuthMutation = trpc.awsSso.startBrowserAuth.useMutation()
  const selectProfileMutation = trpc.awsSso.selectProfile.useMutation()
  const refreshCredentialsMutation = trpc.awsSso.refreshCredentials.useMutation()
  const logoutMutation = trpc.awsSso.logout.useMutation()
  const { data: accountsData, refetch: refetchAccounts } = trpc.awsSso.listAccounts.useQuery(
    undefined,
    { enabled: !!ssoStatus?.authenticated }
  )
  const { data: rolesData, refetch: refetchRoles } = trpc.awsSso.listRoles.useQuery(
    { accountId: selectedAccountId },
    { enabled: !!selectedAccountId }
  )

  // Sync accounts and roles from queries
  useEffect(() => {
    if (accountsData?.accounts) {
      setAccounts(accountsData.accounts)
    }
  }, [accountsData])

  useEffect(() => {
    if (rolesData?.roles) {
      setRoles(rolesData.roles)
    }
  }, [rolesData])

  // Sync from status
  useEffect(() => {
    if (ssoStatus?.configured) {
      setSsoStartUrl(ssoStatus.ssoStartUrl || "")
      setSsoRegion(ssoStatus.ssoRegion || "us-east-1")
      if (ssoStatus.accountId) setSelectedAccountId(ssoStatus.accountId)
      if (ssoStatus.roleName) setSelectedRoleName(ssoStatus.roleName)
      if (ssoStatus.authenticated) {
        setConnectionMethod("sso")
      }
    }
  }, [ssoStatus])

  const handleStartSsoLogin = async () => {
    if (!ssoStartUrl || !ssoRegion) {
      toast.error("Please enter SSO Start URL and Region")
      return
    }

    // Validate URL format
    if (!ssoStartUrl.startsWith("https://")) {
      toast.error("SSO Start URL must start with https://")
      return
    }

    setIsAuthenticating(true)

    try {
      // Start browser-based OAuth flow
      await startBrowserAuthMutation.mutateAsync({
        ssoStartUrl,
        ssoRegion,
      })

      toast.success("Successfully connected to AWS!")
      await refetchStatus()
      await refetchAccounts()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to authenticate"
      toast.error(message)
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId)
    setSelectedRoleName("")
    setRoles([])
  }

  const handleSelectProfile = async () => {
    if (!selectedAccountId || !selectedRoleName) {
      toast.error("Please select an account and role")
      return
    }

    const account = accounts.find((a) => a.accountId === selectedAccountId)
    setIsSelectingProfile(true)

    try {
      await selectProfileMutation.mutateAsync({
        accountId: selectedAccountId,
        accountName: account?.accountName || selectedAccountId,
        roleName: selectedRoleName,
      })
      toast.success("AWS profile selected")
      await refetchStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to select profile"
      toast.error(message)
    } finally {
      setIsSelectingProfile(false)
    }
  }

  const handleRefreshCredentials = async () => {
    setIsRefreshing(true)
    try {
      await refreshCredentialsMutation.mutateAsync()
      toast.success("Credentials refreshed")
      await refetchStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh credentials"
      toast.error(message)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logoutMutation.mutateAsync()
      toast.success("Logged out from AWS SSO")
      setSelectedAccountId("")
      setSelectedRoleName("")
      setAccounts([])
      setRoles([])
      await refetchStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to logout"
      toast.error(message)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const formatExpirationTime = (isoString?: string) => {
    if (!isoString) return "Unknown"
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()

    if (diffMs < 0) return "Expired"

    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 60) return `${diffMins} min`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`

    return date.toLocaleString()
  }

  return (
    <div className="space-y-4">
      {/* Connection Method Toggle */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Connection Method</Label>
        <div className="flex gap-2">
          <Button
            variant={connectionMethod === "sso" ? "default" : "outline"}
            size="sm"
            onClick={() => setConnectionMethod("sso")}
            className="flex-1"
          >
            SSO (IAM Identity Center)
          </Button>
          <Button
            variant={connectionMethod === "profile" ? "default" : "outline"}
            size="sm"
            onClick={() => setConnectionMethod("profile")}
            className="flex-1"
          >
            AWS Profile
          </Button>
        </div>
      </div>

      {/* SSO Configuration */}
      {connectionMethod === "sso" && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          {!ssoStatus?.authenticated ? (
            <>
              {/* SSO URL Input */}
              <div className="space-y-2">
                <Label className="text-sm">SSO Start URL</Label>
                <Input
                  value={ssoStartUrl}
                  onChange={(e) => setSsoStartUrl(e.target.value)}
                  placeholder="https://d-abc123.awsapps.com/start"
                  className="font-mono text-sm"
                  disabled={isAuthenticating}
                />
                <p className="text-xs text-muted-foreground">
                  Your organization&apos;s AWS IAM Identity Center start URL
                </p>
              </div>

              {/* SSO Region */}
              <div className="space-y-2">
                <Label className="text-sm">SSO Region</Label>
                <Select
                  value={ssoRegion}
                  onValueChange={setSsoRegion}
                  disabled={isAuthenticating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SSO_REGIONS.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  AWS region where your IAM Identity Center is configured
                </p>
              </div>

              {/* Login Button */}
              <Button
                onClick={handleStartSsoLogin}
                disabled={isAuthenticating || !ssoStartUrl}
              >
                {isAuthenticating ? (
                  <>
                    <IconSpinner className="h-4 w-4 mr-2" />
                    Waiting for browser...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Connect with AWS SSO
                  </>
                )}
              </Button>

              {isAuthenticating && (
                <p className="text-xs text-muted-foreground">
                  Complete the sign-in in your browser. This will update automatically.
                </p>
              )}
            </>
          ) : (
            <>
              {/* Authenticated Status */}
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                Connected to AWS SSO
              </div>

              {/* Account Selector */}
              <div className="space-y-2">
                <Label className="text-sm">AWS Account</Label>
                <Select
                  value={selectedAccountId}
                  onValueChange={handleAccountChange}
                  disabled={accounts.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={accounts.length === 0 ? "Loading accounts..." : "Select account"} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.accountId} value={account.accountId}>
                        {account.accountName} ({account.accountId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Role Selector */}
              {selectedAccountId && (
                <div className="space-y-2">
                  <Label className="text-sm">Role</Label>
                  <Select
                    value={selectedRoleName}
                    onValueChange={setSelectedRoleName}
                    disabled={roles.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={roles.length === 0 ? "Loading roles..." : "Select role"} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.roleName} value={role.roleName}>
                          {role.roleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Save Profile Button */}
              {selectedAccountId && selectedRoleName && (
                <Button
                  onClick={handleSelectProfile}
                  disabled={isSelectingProfile}
                >
                  {isSelectingProfile && <IconSpinner className="h-4 w-4 mr-2" />}
                  Use Selected Profile
                </Button>
              )}

              {/* Current Selection Status */}
              {ssoStatus?.hasCredentials && (
                <div className="p-3 bg-background rounded-lg space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account:</span>
                    <span className="font-mono">
                      {ssoStatus.accountName} ({ssoStatus.accountId})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Role:</span>
                    <span className="font-mono">{ssoStatus.roleName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credentials Expire:</span>
                    <span className={
                      ssoStatus.credentialsExpiresAt &&
                      new Date(ssoStatus.credentialsExpiresAt).getTime() - Date.now() < 3600000
                        ? "text-yellow-500"
                        : ""
                    }>
                      {formatExpirationTime(ssoStatus.credentialsExpiresAt)}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshCredentials}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <IconSpinner className="h-4 w-4 mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-destructive hover:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Profile Configuration */}
      {connectionMethod === "profile" && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          <div className="space-y-2">
            <Label className="text-sm">AWS Profile Name</Label>
            <Input
              value={awsProfileName}
              onChange={(e) => setAwsProfileName(e.target.value)}
              placeholder="default"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Profile from ~/.aws/credentials (leave empty for default profile)
            </p>
          </div>

          <div className="p-3 bg-background rounded-lg text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Profile mode uses:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>~/.aws/credentials for access keys</li>
              <li>~/.aws/config for region and profile settings</li>
              <li>Environment variables (AWS_PROFILE, AWS_ACCESS_KEY_ID, etc.)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Bedrock Region (both methods) */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Bedrock Region</Label>
        <Select value={bedrockRegion} onValueChange={onBedrockRegionChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BEDROCK_REGIONS.map((region) => (
              <SelectItem key={region.value} value={region.value}>
                {region.value} ({region.label})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          AWS region to use for Bedrock API calls (must have Claude models enabled)
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving && <IconSpinner className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  )
}
