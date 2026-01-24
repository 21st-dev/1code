import { useEffect, useState } from "react"
import { trpc } from "../trpc"

export interface ClerkUser {
  id: string
  email?: string
  name?: string
  imageUrl?: string
  subscriptionTier?: "free" | "pro" | "enterprise"
}

export interface UseClerkAuthReturn {
  isAuthenticated: boolean
  user: ClerkUser | null
  isLoading: boolean
  login: () => void
  signup: () => void
  logout: () => void
  validateToken: () => Promise<boolean>
  refreshToken: () => Promise<boolean>
}

/**
 * Hook for Clerk authentication in the desktop app
 */
export function useClerkAuth(): UseClerkAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<ClerkUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const utils = trpc.useUtils()

  // Get auth state query
  const authStateQuery = trpc.clerkAuth.getAuthState.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })

  // Mutations
  const loginMutation = trpc.clerkAuth.login.useMutation()
  const signupMutation = trpc.clerkAuth.signup.useMutation()
  const logoutMutation = trpc.clerkAuth.logout.useMutation({
    onSuccess: () => {
      setIsAuthenticated(false)
      setUser(null)
      authStateQuery.refetch()
    },
  })
  const refreshMutation = trpc.clerkAuth.refreshToken.useMutation()

  // Update state when query data changes
  useEffect(() => {
    if (authStateQuery.data) {
      console.log("[useClerkAuth] Auth state received:", authStateQuery.data)
      setIsAuthenticated(authStateQuery.data.isAuthenticated)
      setUser(authStateQuery.data.user)
      setIsLoading(false)
    } else if (!authStateQuery.isLoading) {
      setIsLoading(false)
    }
  }, [authStateQuery.data, authStateQuery.isLoading])

  // Listen for auth success from deep link
  useEffect(() => {
    const unsubscribe = window.desktopApi.onClerkAuthSuccess((data) => {
      console.log("[useClerkAuth] Auth success received:", data.userId)
      // Refetch auth state
      authStateQuery.refetch().then(() => {
        setIsLoading(false)
      })
    })

    return unsubscribe
  }, [authStateQuery])

  // Listen for auth errors
  useEffect(() => {
    const unsubscribe = window.desktopApi.onClerkAuthError((data) => {
      console.error("[useClerkAuth] Auth error:", data.error)
      setIsLoading(false)
    })

    return unsubscribe
  }, [])

  const login = () => {
    setIsLoading(true)
    loginMutation.mutate()
  }

  const signup = () => {
    setIsLoading(true)
    signupMutation.mutate()
  }

  const logout = () => {
    logoutMutation.mutate()
  }

  const validateToken = async (): Promise<boolean> => {
    try {
      const result = await utils.clerkAuth.validateToken.fetch()
      return result.isValid
    } catch (error) {
      console.error("[useClerkAuth] Token validation failed:", error)
      return false
    }
  }

  const refreshToken = async (): Promise<boolean> => {
    try {
      const result = await refreshMutation.mutateAsync()
      if (result.success) {
        await authStateQuery.refetch()
      }
      return result.success
    } catch (error) {
      console.error("[useClerkAuth] Token refresh failed:", error)
      return false
    }
  }

  return {
    isAuthenticated,
    user,
    isLoading,
    login,
    signup,
    logout,
    validateToken,
    refreshToken,
  }
}
