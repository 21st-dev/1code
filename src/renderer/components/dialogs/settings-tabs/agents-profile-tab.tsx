import { useState, useEffect } from "react"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { useClerkAuth } from "../../../lib/hooks/use-clerk-auth"
import { LogOut, User } from "lucide-react"
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

interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

export function AgentsProfileTab() {
  const { user: clerkUser, logout: clerkLogout, isLoading: isClerkLoading } = useClerkAuth()
  const [user, setUser] = useState<DesktopUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const isNarrowScreen = useIsNarrowScreen()

  // Fetch real user data from desktop API (legacy auth)
  useEffect(() => {
    async function fetchUser() {
      if (window.desktopApi?.getUser) {
        const userData = await window.desktopApi.getUser()
        setUser(userData)
      }
      setIsLoading(false)
    }
    fetchUser()
  }, [])

  // Compute display values from clerk user or legacy user
  const displayName = clerkUser?.name || user?.name || ""
  const profileImageUrl = clerkUser?.imageUrl || user?.imageUrl || null

  const handleLogout = () => {
    clerkLogout()
    toast.success("Signed out successfully")
  }

  if (isLoading || isClerkLoading) {
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
            {/* Clerk User Info */}
            {clerkUser && (
              <>
                <div className="flex items-center justify-between pb-4 border-b">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Signed in with Clerk
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <Button
                      onClick={handleLogout}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </div>

                {/* Subscription Tier */}
                {clerkUser.subscriptionTier && (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">Subscription</Label>
                      <p className="text-sm text-muted-foreground">
                        Your current plan
                      </p>
                    </div>
                    <div className="flex-shrink-0 w-80">
                      <div className="px-3 py-2 bg-muted rounded-md">
                        <span className="text-sm font-medium capitalize">
                          {clerkUser.subscriptionTier}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Profile Picture Field */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Profile Picture</Label>
                <p className="text-sm text-muted-foreground">
                  Your avatar from authentication provider
                </p>
              </div>
              <div className="flex-shrink-0">
                {profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt={displayName || "Profile"}
                    className="w-12 h-12 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center border border-border">
                    <User className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* Full Name Field (read-only) */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Full Name</Label>
                <p className="text-sm text-muted-foreground">
                  Your display name
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={displayName}
                  disabled
                  className="w-full opacity-60"
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
                  value={clerkUser?.email || user?.email || ""}
                  disabled
                  className="w-full opacity-60"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
