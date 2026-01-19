import { useState, useEffect } from "react"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { toast } from "sonner"
import { UsageStats } from "../../../features/settings/usage-stats"

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

export function AgentsProfileTab() {
  const [user, setUser] = useState<DesktopUser | null>(null)
  const [fullName, setFullName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const isNarrowScreen = useIsNarrowScreen()

  // Fetch real user data from desktop API
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
            <h3 className="text-sm font-medium text-foreground">Account</h3>
          </div>
        )}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
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

            {/* Email Field (read-only) */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground">
                  Your account email
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={user?.email || ""}
                  disabled
                  className="w-full opacity-60"
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

      {/* Usage Statistics */}
      <div className="space-y-2">
        {!isNarrowScreen && (
          <div className="pb-3 mb-4">
            <h3 className="text-sm font-medium text-foreground">Usage</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Directly fetch from 'https://api.anthropic.com/api/oauth/usage'
            </p>
          </div>
        )}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4">
            <UsageStats />
          </div>
        </div>
      </div>
    </div>
  )
}
