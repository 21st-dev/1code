import { useEffect } from "react"
import { useSyncModelProfiles } from "../lib/atoms/model-profiles-sync"

/**
 * Component that initializes model profiles sync between localStorage and database.
 * Should be rendered once in the app root.
 */
export function ModelProfilesSync() {
  const { isLoading } = useSyncModelProfiles()

  // This component doesn't render anything - it just handles the sync
  return null
}
