import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { toast } from "sonner"

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

interface OpenCodexLocalProfile {
  displayName: string
  identityLabel: string
}

export function AgentsProfileTab() {
  const [profile, setProfile] = useState<OpenCodexLocalProfile | null>(null)
  const [fullName, setFullName] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const isNarrowScreen = useIsNarrowScreen()
  const savedNameRef = useRef("")

  useEffect(() => {
    async function fetchProfile() {
      if (window.desktopApi?.getLocalProfile) {
        const profileData = await window.desktopApi.getLocalProfile()
        setProfile(profileData)
        setFullName(profileData.displayName || "")
        savedNameRef.current = profileData.displayName || ""
      }
      setIsLoading(false)
    }
    void fetchProfile()
  }, [])

  const handleBlurSave = useCallback(async () => {
    const trimmed = fullName.trim()
    if (trimmed === savedNameRef.current) return
    try {
      if (window.desktopApi?.updateLocalProfile) {
        const updatedProfile = await window.desktopApi.updateLocalProfile({ displayName: trimmed })
        if (updatedProfile) {
          setProfile(updatedProfile)
          savedNameRef.current = updatedProfile.displayName || ""
          setFullName(updatedProfile.displayName || "")
        }
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      )
    }
  }, [fullName])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Profile Settings Card */}
      <div className="space-y-2">
        {/* Header - hidden on narrow screens since it's in the navigation bar */}
        {!isNarrowScreen && (
          <div className="flex items-center justify-between pb-3 mb-4">
            <h3 className="text-sm font-medium text-foreground">Workspace</h3>
          </div>
        )}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Full Name Field */}
          <div className="flex items-center justify-between p-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">Full Name</Label>
              <p className="text-sm text-muted-foreground">
                This is the local display name shown across OpenCodex
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={handleBlurSave}
                className="w-full"
                placeholder="Enter your name"
              />
            </div>
          </div>

          {/* Identity Mode Field (read-only) */}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="flex-1">
              <Label className="text-sm font-medium">Identity Mode</Label>
              <p className="text-sm text-muted-foreground">
                OpenCodex runs in local-native mode on this device
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={profile?.identityLabel || "Local device profile"}
                disabled
                className="w-full opacity-60"
              />
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
