import { useState, useEffect } from "react"
import { useAtom } from "jotai"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { toast } from "sonner"
import { localProfileNameAtom } from "../../../lib/atoms"

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

export function AgentsProfileTab() {
  const [storedName, setStoredName] = useAtom(localProfileNameAtom)
  const [fullName, setFullName] = useState(storedName)
  const [isSaving, setIsSaving] = useState(false)
  const isNarrowScreen = useIsNarrowScreen()

  useEffect(() => {
    setFullName(storedName)
  }, [storedName])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      setStoredName(fullName.trim())
      toast.success("Profile saved")
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      )
    } finally {
      setIsSaving(false)
    }
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

    </div>
  )
}
