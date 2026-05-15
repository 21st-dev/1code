import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { toast } from "sonner"
import { useLocalOnlyMode } from "../../../lib/hooks/use-local-only-mode"
import { LOCAL_ONLY_BLOCKED_MESSAGE } from "../../../../shared/local-only"

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
  const [isLoading, setIsLoading] = useState(true)
  const isLocalOnly = useLocalOnlyMode()
  const isNarrowScreen = useIsNarrowScreen()
  const savedNameRef = useRef("")

  // Fetch real user data from desktop API
  useEffect(() => {
    async function fetchUser() {
      if (window.desktopApi?.getUser) {
        const userData = await window.desktopApi.getUser()
        setUser(userData)
        setFullName(userData?.name || "")
        savedNameRef.current = userData?.name || ""
      }
      setIsLoading(false)
    }
    fetchUser()
  }, [])

  const handleBlurSave = useCallback(async () => {
    const trimmed = fullName.trim()
    if (trimmed === savedNameRef.current) return
    if (isLocalOnly) {
      toast.error(LOCAL_ONLY_BLOCKED_MESSAGE)
      setFullName(savedNameRef.current)
      return
    }
    try {
      if (window.desktopApi?.updateUser) {
        const updatedUser = await window.desktopApi.updateUser({ name: trimmed })
        if (updatedUser) {
          setUser(updatedUser)
          savedNameRef.current = updatedUser.name || ""
          setFullName(updatedUser.name || "")
        }
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      )
    }
  }, [fullName, isLocalOnly])

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
          {/* Full Name Field */}
          <div className="flex items-center justify-between p-4">
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
                onBlur={handleBlurSave}
                disabled={isLocalOnly}
                className="w-full"
                placeholder="Enter your name"
              />
            </div>
          </div>

          {/* Email Field (read-only) */}
          <div className="flex items-center justify-between p-4 border-t border-border">
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
      </div>

    </div>
  )
}
