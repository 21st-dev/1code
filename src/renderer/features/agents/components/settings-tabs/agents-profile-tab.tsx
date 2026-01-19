"use client"

import { useState, useEffect, useRef } from "react"
import { useAtom, useAtomValue, atom } from "jotai"
import { Button } from "../../../../components/ui/button"
import { Input } from "../../../../components/ui/input"
import { Label } from "../../../../components/ui/label"
import { ClaudeCodeLogoIcon, IconSpinner } from "../../../../components/ui/icons"
import { toast } from "sonner"
import { Upload, Edit } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "../../../../lib/utils"
import { localProfileNameAtom } from "../../../../lib/atoms"

// Desktop user interface
interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

// Custom hook for desktop user profile
const useDesktopUserProfile = () => {
  const [storedName, setStoredName] = useAtom(localProfileNameAtom)

  const user: DesktopUser = {
    id: "local",
    email: "Local",
    name: storedName?.trim() || null,
    imageUrl: null,
    username: null,
  }

  return {
    user,
    setUser: (next: DesktopUser | null) => setStoredName(next?.name ?? ""),
    isLoading: false,
  }
}

// Stub for image upload (not implemented in desktop yet)
const useImageUpload = () => ({
  previewUrl: null as string | null,
  fileInputRef: { current: null as HTMLInputElement | null },
  handleThumbnailClick: () => {},
  handleFileChange: async (_event?: unknown) => null as string | null
})
// Desktop uses mock data instead of trpc
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any
const api = {
  useUtils: () => ({ claudeCode: { getIntegration: { invalidate: (_args?: unknown) => {} } } }),
  claudeCode: {
    getIntegration: {
      useQuery: (_args?: unknown, _opts?: unknown) => ({
        data: { isConnected: false, connectedAt: null as string | null },
        isLoading: false,
        refetch: () => {},
      }),
    },
    startAuth: {
      useMutation: (opts?: { onSuccess?: AnyFn; onError?: AnyFn }) => ({
        mutate: (_args?: unknown) => {
          opts?.onSuccess?.({ sandboxId: "mock", sandboxUrl: "mock", sessionId: "mock" })
        },
        isPending: false,
      }),
    },
    pollAuthStatus: {
      useQuery: (_args?: unknown, _opts?: unknown) => ({
        data: { state: "idle" as string, oauthUrl: null as string | null },
      }),
    },
    submitCode: {
      useMutation: (opts?: { onSuccess?: AnyFn; onError?: AnyFn }) => ({
        mutate: (_args?: unknown) => opts?.onSuccess?.(),
        isPending: false,
      }),
    },
    disconnect: {
      useMutation: (opts?: { onSuccess?: AnyFn; onError?: AnyFn }) => ({
        mutate: (_args?: unknown) => opts?.onSuccess?.(),
        isPending: false,
      }),
    },
  },
}
const selectedTeamIdAtom = atom<string | null>(null)

type AuthFlowState =
  | { step: "idle" }
  | { step: "starting" }
  | {
      step: "waiting_url"
      sandboxId: string
      sandboxUrl: string
      sessionId: string
    }
  | {
      step: "has_url"
      sandboxId: string
      oauthUrl: string
      sandboxUrl: string
      sessionId: string
    }
  | { step: "submitting" }
  | { step: "error"; message: string }

export function AgentsProfileTab() {
  const { user, setUser, isLoading: isUserLoading } = useDesktopUserProfile()
  const [fullName, setFullName] = useState("")
  const [profileImage, setProfileImage] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const { previewUrl, fileInputRef, handleThumbnailClick, handleFileChange } =
    useImageUpload()

  // Initialize state when user data is loaded
  useEffect(() => {
    if (!isUserLoading && user) {
      setFullName(user.name || "")
      setProfileImage(user.imageUrl || "")
    }
  }, [isUserLoading, user])

  // Update profileImage when previewUrl changes
  useEffect(() => {
    if (previewUrl) {
      setProfileImage(previewUrl)
    }
  }, [previewUrl])

  const handleSave = async () => {
    setIsSaving(true)

    try {
      setUser({
        id: "local",
        email: "Local",
        name: fullName.trim() || null,
        imageUrl: null,
        username: null,
      })
      toast.success("Profile saved")
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile",
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const base64String = await handleFileChange(event)
    if (base64String) {
      setProfileImage(base64String)
    }
  }

  // Claude Code integration
  const teamId = useAtomValue(selectedTeamIdAtom)

  const [claudeFlowState, setClaudeFlowState] = useState<AuthFlowState>({
    step: "idle",
  })
  const [authCode, setAuthCode] = useState("")
  const [userClickedConnect, setUserClickedConnect] = useState(false)
  const [urlOpened, setUrlOpened] = useState(false)
  const urlOpenedRef = useRef(false)

  const utils = api.useUtils()

  const {
    data: claudeCodeIntegration,
    isLoading: isLoadingClaudeCode,
    refetch: refetchClaudeCode,
  } = api.claudeCode.getIntegration.useQuery(
    { teamId: teamId || "" },
    { enabled: !!teamId },
  )
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected

  // Start auth mutation
  const startClaudeAuth = api.claudeCode.startAuth.useMutation({
    onSuccess: (data) => {
      setClaudeFlowState({
        step: "waiting_url",
        sandboxId: data.sandboxId,
        sandboxUrl: data.sandboxUrl,
        sessionId: data.sessionId,
      })
    },
    onError: (error) => {
      setClaudeFlowState({ step: "error", message: error.message })
      toast.error(error.message || "Failed to start authentication")
    },
  })

  // Poll for auth status
  const { data: authStatus } = api.claudeCode.pollAuthStatus.useQuery(
    {
      teamId: teamId || "",
      sandboxUrl:
        claudeFlowState.step === "waiting_url"
          ? claudeFlowState.sandboxUrl
          : "",
      sessionId:
        claudeFlowState.step === "waiting_url" ? claudeFlowState.sessionId : "",
    },
    {
      enabled: claudeFlowState.step === "waiting_url" && !!teamId,
      refetchInterval: 1500,
      refetchIntervalInBackground: true,
    },
  )

  // Submit code mutation
  const submitClaudeCode = api.claudeCode.submitCode.useMutation({
    onSuccess: () => {
      toast.success("Claude Code connected successfully!")
      setClaudeFlowState({ step: "idle" })
      setAuthCode("")
      setUserClickedConnect(false)
      setUrlOpened(false)
      urlOpenedRef.current = false
      refetchClaudeCode()
      utils.claudeCode.getIntegration.invalidate({ teamId: teamId || "" })
    },
    onError: (error) => {
      setClaudeFlowState({ step: "error", message: error.message })
      toast.error(error.message || "Failed to complete authentication")
    },
  })

  // Disconnect mutation
  const disconnectClaudeCode = api.claudeCode.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Claude Code disconnected")
      refetchClaudeCode()
      utils.claudeCode.getIntegration.invalidate({ teamId: teamId || "" })
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect")
    },
  })

  // Update flow state when OAuth URL is ready (don't auto-open)
  useEffect(() => {
    if (
      claudeFlowState.step === "waiting_url" &&
      authStatus?.state === "waiting_code" &&
      authStatus.oauthUrl
    ) {
      setClaudeFlowState({
        step: "has_url",
        sandboxId: claudeFlowState.sandboxId,
        oauthUrl: authStatus.oauthUrl,
        sandboxUrl: claudeFlowState.sandboxUrl,
        sessionId: claudeFlowState.sessionId,
      })
    }
  }, [authStatus, claudeFlowState])

  // Open OAuth URL when it becomes ready (after user clicked Connect)
  useEffect(() => {
    if (
      claudeFlowState.step === "has_url" &&
      userClickedConnect &&
      !urlOpenedRef.current
    ) {
      urlOpenedRef.current = true
      setUrlOpened(true)
      // Open the OAuth URL directly - no blank page
      window.open(claudeFlowState.oauthUrl, "_blank")
    }
  }, [claudeFlowState, userClickedConnect])

  const handleStartClaudeAuth = () => {
    if (!teamId) return
    setUserClickedConnect(true)

    // If URL is already ready, open it immediately - no blank page needed
    if (claudeFlowState.step === "has_url") {
      urlOpenedRef.current = true
      setUrlOpened(true)
      window.open(claudeFlowState.oauthUrl, "_blank")
    } else if (claudeFlowState.step === "error") {
      // Retry on error - just restart auth, don't open blank
      urlOpenedRef.current = false
      setUrlOpened(false)
      setUserClickedConnect(false)
      setClaudeFlowState({ step: "starting" })
      startClaudeAuth.mutate({ teamId })
    } else if (claudeFlowState.step === "idle") {
      // Start auth process - don't open blank, wait for URL
      setClaudeFlowState({ step: "starting" })
      startClaudeAuth.mutate({ teamId })
    }
    // For "starting" or "waiting_url" - just wait, URL will be opened when ready via useEffect
  }

  // Check if the code looks like a valid Claude auth code (format: XXX#YYY)
  const isValidCodeFormat = (code: string) => {
    const trimmed = code.trim()
    // Auth codes are typically long strings with a # separator
    return trimmed.length > 50 && trimmed.includes("#")
  }

  const handleSubmitClaudeCode = () => {
    if (!authCode.trim() || claudeFlowState.step !== "has_url" || !teamId)
      return

    setClaudeFlowState({ step: "submitting" })
    submitClaudeCode.mutate({
      teamId,
      sandboxId: claudeFlowState.sandboxId,
      sandboxUrl: claudeFlowState.sandboxUrl,
      sessionId: claudeFlowState.sessionId,
      code: authCode.trim(),
    })
  }

  const handleClaudeCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAuthCode(value)

    // Auto-submit if the pasted value looks like a valid auth code
    if (
      isValidCodeFormat(value) &&
      claudeFlowState.step === "has_url" &&
      teamId
    ) {
      // Capture values before setTimeout to avoid race condition
      const { sandboxId, sandboxUrl, sessionId } = claudeFlowState
      // Small delay to let the UI update before submitting
      setTimeout(() => {
        setClaudeFlowState({ step: "submitting" })
        submitClaudeCode.mutate({
          teamId,
          code: value.trim(),
          sandboxId,
          sandboxUrl,
          sessionId,
        })
      }, 100)
    }
  }

  const handleClaudeCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && authCode.trim()) {
      handleSubmitClaudeCode()
    }
  }

  const handleCancelClaudeAuth = () => {
    setClaudeFlowState({ step: "idle" })
    setAuthCode("")
    setUserClickedConnect(false)
    setUrlOpened(false)
    urlOpenedRef.current = false
  }

  const handleDisconnectClaudeCode = () => {
    if (!teamId) return
    disconnectClaudeCode.mutate({ teamId })
  }

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  const currentImageUrl = previewUrl || profileImage || user?.imageUrl

  return (
    <div className="p-6 space-y-6">
      {/* Profile Settings Card */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-3 mb-4">
          <h3 className="text-sm font-medium text-foreground">Account</h3>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Profile Picture Field */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Profile Picture</Label>
                <p className="text-sm text-muted-foreground">
                  How you're shown around the app
                </p>
              </div>
              <div className="flex-shrink-0 relative group">
                {/* Glow effect - blurred image behind */}
                {currentImageUrl && (
                  <div
                    className="absolute inset-0 scale-[1.02] blur-sm opacity-40 transition-opacity duration-200 group-hover:opacity-0 rounded-full"
                    style={{
                      backgroundImage: `url(${currentImageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                )}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                  className={cn(
                    "w-12 h-12 bg-muted rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity aspect-square relative overflow-hidden",
                    !currentImageUrl && "border-2 border-dashed border-border",
                  )}
                  onClick={handleThumbnailClick}
                >
                  {currentImageUrl ? (
                    <>
                      <img
                        src={currentImageUrl}
                        alt={fullName || "User"}
                        className="w-full h-full rounded-full object-cover aspect-square"
                      />
                      {/* Edit overlay */}
                      <div className="absolute inset-0 bg-background/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Edit className="w-4 h-4 text-foreground" />
                      </div>
                    </>
                  ) : (
                    <Upload className="w-4 h-4 text-muted-foreground" />
                  )}
                </motion.div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Full Name Field */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Full Name</Label>
                <p className="text-sm text-muted-foreground">
                  This is your display name
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full"
                  placeholder="Enter your name"
                />
              </div>
            </div>
          </div>

          {/* Save Button Footer */}
          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-3 border-t">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
              className="text-xs"
            >
              <div className="flex items-center justify-center gap-2">
                {isSaving && (
                  <IconSpinner className="h-3.5 w-3.5 text-current" />
                )}
                Save
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Connected accounts */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-3 mb-4">
          <h3 className="text-sm font-medium text-foreground">
            Connected accounts
          </h3>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Claude Code Connection */}
            {teamId && (
              <div>
                {isLoadingClaudeCode ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <ClaudeCodeLogoIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Claude Code
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Loading...
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      disabled
                      size="sm"
                      className="text-xs"
                    >
                      <IconSpinner className="h-3 w-3" />
                    </Button>
                  </div>
                ) : isClaudeCodeConnected && claudeFlowState.step === "idle" ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <ClaudeCodeLogoIcon className="h-5 w-5 text-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Claude Code
                        </p>
                        <p className="text-xs text-muted-foreground">
                          AI-powered coding assistance enabled
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleDisconnectClaudeCode}
                      disabled={disconnectClaudeCode.isPending}
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive"
                    >
                      {disconnectClaudeCode.isPending && (
                        <IconSpinner className="h-3 w-3 mr-1.5" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                ) : urlOpened ||
                  claudeFlowState.step === "has_url" ||
                  claudeFlowState.step === "submitting" ? (
                  // Code input state - after URL opened
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <ClaudeCodeLogoIcon className="h-5 w-5 text-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Claude Code
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Paste the authentication code
                        </p>
                      </div>
                    </div>
                    <Input
                      value={authCode}
                      onChange={handleClaudeCodeChange}
                      onKeyDown={handleClaudeCodeKeyDown}
                      placeholder="Paste authentication code..."
                      className="h-8 text-xs font-mono rounded-lg"
                      autoFocus
                      disabled={claudeFlowState.step === "submitting"}
                    />
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        A new tab has opened for authentication
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleCancelClaudeAuth}
                          size="sm"
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSubmitClaudeCode}
                          disabled={
                            !authCode.trim() ||
                            claudeFlowState.step === "submitting"
                          }
                          size="sm"
                          className="text-xs"
                        >
                          {claudeFlowState.step === "submitting" ? (
                            <IconSpinner className="h-3 w-3" />
                          ) : (
                            "Continue"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : claudeFlowState.step === "error" ? (
                  // Error state
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <ClaudeCodeLogoIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Claude Code
                        </p>
                        <p className="text-xs text-destructive">
                          {claudeFlowState.message}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleStartClaudeAuth}
                      size="sm"
                      className="text-xs"
                    >
                      Try Again
                    </Button>
                  </div>
                ) : (
                  // Idle or loading state - show Connect button
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <ClaudeCodeLogoIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Claude Code
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Connect for AI-powered coding assistance
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleStartClaudeAuth}
                      disabled={
                        userClickedConnect &&
                        (claudeFlowState.step === "starting" ||
                          claudeFlowState.step === "waiting_url")
                      }
                      size="sm"
                      className="text-xs min-w-[72px]"
                    >
                      {userClickedConnect &&
                      (claudeFlowState.step === "starting" ||
                        claudeFlowState.step === "waiting_url") ? (
                        <IconSpinner className="h-3 w-3" />
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
