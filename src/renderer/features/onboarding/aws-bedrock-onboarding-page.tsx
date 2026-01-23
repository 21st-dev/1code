"use client"

import { useSetAtom } from "jotai"
import { ChevronLeft } from "lucide-react"
import { useState, useEffect } from "react"

import { Logo } from "../../components/ui/logo"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { billingMethodAtom, awsBedrockOnboardingCompletedAtom } from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { toast } from "sonner"
import { IconSpinner } from "../../components/ui/icons"
import { Copy, ExternalLink } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"

export function AwsBedrockOnboardingPage() {
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setAwsBedrockOnboardingCompleted = useSetAtom(awsBedrockOnboardingCompletedAtom)

  const [ssoStartUrl, setSsoStartUrl] = useState("https://d-9067694978.awsapps.com/start")
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [showDeviceCode, setShowDeviceCode] = useState(false)
  const [deviceCode, setDeviceCode] = useState("")
  const [userCode, setUserCode] = useState("")
  const [verificationUrl, setVerificationUrl] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [selectedRole, setSelectedRole] = useState<string>("")

  // Check AWS connection status
  const { data: awsStatus, refetch: refetchStatus } = trpc.awsSso.getStatus.useQuery(undefined, {
    refetchInterval: false,
  })

  // Fetch accounts after authentication
  const { data: accounts } = trpc.awsSso.listAccounts.useQuery(undefined, {
    enabled: isAuthenticated,
  })

  // Fetch roles after account selection
  const { data: roles } = trpc.awsSso.listRoles.useQuery(
    { accountId: selectedAccount },
    { enabled: !!selectedAccount }
  )

  // Get credentials mutation
  const getCredentialsMutation = trpc.awsSso.getCredentials.useMutation()

  // Mutations
  const startDeviceAuthMutation = trpc.awsSso.startDeviceAuth.useMutation()
  const updateSettingsMutation = trpc.claudeSettings.updateSettings.useMutation()
  const pollDeviceAuthMutation = trpc.awsSso.pollDeviceAuth.useMutation()

  // Auto-complete onboarding when AWS is connected and has credentials
  useEffect(() => {
    if (awsStatus?.authenticated && awsStatus?.hasCredentials) {
      setAwsBedrockOnboardingCompleted(true)
    }
  }, [awsStatus, setAwsBedrockOnboardingCompleted])

  const handleBack = () => {
    setBillingMethod(null)
  }

  // Poll for device auth completion
  useEffect(() => {
    if (!showDeviceCode || !deviceCode) return

    const interval = setInterval(async () => {
      try {
        const result = await pollDeviceAuthMutation.mutateAsync({ deviceCode })

        if (result.status === "success") {
          clearInterval(interval)
          setShowDeviceCode(false)
          setIsAuthenticated(true)
          toast.success("Successfully authenticated with AWS!")

          // Complete onboarding - user can configure account/role in Settings
          setTimeout(() => {
            setAwsBedrockOnboardingCompleted(true)
          }, 1000)
        } else if (result.status === "expired" || result.status === "denied") {
          clearInterval(interval)
          setShowDeviceCode(false)
          toast.error(`Device authorization ${result.status}. Please try again.`)
        }
      } catch (error) {
        // Polling will continue until success or user closes dialog
      }
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [showDeviceCode, deviceCode, pollDeviceAuthMutation])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(userCode)
    toast.success("Code copied to clipboard")
  }

  const handleOpenUrl = () => {
    window.open(verificationUrl, "_blank")
  }

  const handleConnect = async () => {
    if (!ssoStartUrl.trim()) {
      toast.error("Please enter SSO start URL")
      return
    }

    setIsAuthenticating(true)

    try {
      // Set auth mode to AWS
      await updateSettingsMutation.mutateAsync({
        authMode: "aws",
      })

      // Start device authorization
      const result = await startDeviceAuthMutation.mutateAsync({
        ssoStartUrl: ssoStartUrl.trim(),
        ssoRegion: "us-east-1",
      })

      // Show device code dialog
      setDeviceCode(result.deviceCode)
      setUserCode(result.userCode)
      setVerificationUrl(result.verificationUri)
      setShowDeviceCode(true)
    } catch (error) {
      toast.error(`Failed to start authentication: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsAuthenticating(false)
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10 z-50"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back button */}
      <div
        className="fixed top-3 left-4 z-50"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-10">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Header */}
          <div className="text-center space-y-4">
            <Logo className="w-10 h-10 mx-auto" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Connect to AWS Bedrock
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Sign in with AWS SSO to use Claude via Amazon Bedrock
              </p>
            </div>
          </div>

          {/* SSO Configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">SSO Start URL</Label>
              <Input
                type="url"
                placeholder="https://d-xxxxxxxxxx.awsapps.com/start"
                value={ssoStartUrl}
                onChange={(e) => setSsoStartUrl(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                This is your AWS SSO portal URL from IAM Identity Center
              </p>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isAuthenticating || !ssoStartUrl.trim()}
              className="w-full"
            >
              {isAuthenticating && <IconSpinner className="mr-2 h-4 w-4" />}
              Connect with AWS SSO
            </Button>
          </div>

          {/* Connection Status */}
          {awsStatus?.configured && (
            <div className="text-center">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                ✓ Connected to AWS
              </p>
              {awsStatus.accountName && (
                <p className="text-xs text-muted-foreground mt-1">
                  {awsStatus.accountName} ({awsStatus.accountId})
                </p>
              )}
            </div>
          )}

          {/* Helper text */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Once connected, you'll be able to select a workspace to start using Claude.
            </p>
          </div>
        </div>
      </div>

      {/* Device Code Dialog */}
      <Dialog open={showDeviceCode} onOpenChange={setShowDeviceCode}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>AWS SSO Device Authorization</DialogTitle>
            <DialogDescription>
              Complete the sign-in process in your browser using the code below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* User Code Display */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Verification Code</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md text-center">
                  <span className="text-2xl font-mono font-bold tracking-widest">
                    {userCode}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyCode}
                  title="Copy code"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Verification URL */}
            <div className="space-y-2">
              <Button
                onClick={handleOpenUrl}
                className="w-full"
                variant="default"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open AWS Sign-In Page
              </Button>
            </div>

            {/* Instructions */}
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">Instructions:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Click "Open AWS Sign-In Page" or manually visit the URL</li>
                <li>Copy the verification code above</li>
                <li>Paste the code in the AWS sign-in page</li>
                <li>Complete the authentication</li>
                <li>Return here - the app will automatically detect completion</li>
              </ol>
            </div>

            {/* Polling indicator */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
              <IconSpinner className="h-4 w-4" />
              <span>Waiting for authorization...</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
