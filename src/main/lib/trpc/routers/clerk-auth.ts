import { router, publicProcedure } from "../index"
import { getClerkAuthService } from "../../../clerk-auth-service"
import { z } from "zod"

/**
 * Clerk Authentication Router
 * Handles authentication state and actions for the desktop app
 */
export const clerkAuthRouter = router({
  /**
   * Get current authentication state
   */
  getAuthState: publicProcedure.query(async () => {
    const authService = getClerkAuthService()
    return {
      isAuthenticated: await authService.isAuthenticated(),
      user: await authService.getUser(),
    }
  }),

  /**
   * Initiate login flow (opens browser)
   */
  login: publicProcedure.mutation(async () => {
    const authService = getClerkAuthService()
    await authService.initiateLogin()
    return { started: true }
  }),

  /**
   * Initiate signup flow (opens browser)
   */
  signup: publicProcedure.mutation(async () => {
    const authService = getClerkAuthService()
    await authService.initiateSignup()
    return { started: true }
  }),

  /**
   * Logout and clear tokens
   */
  logout: publicProcedure.mutation(async () => {
    const authService = getClerkAuthService()
    await authService.logout()
    return { success: true }
  }),

  /**
   * Validate current token with server
   */
  validateToken: publicProcedure.query(async () => {
    const authService = getClerkAuthService()
    const isValid = await authService.validateToken()
    return { isValid }
  }),

  /**
   * Refresh access token
   */
  refreshToken: publicProcedure.mutation(async () => {
    const authService = getClerkAuthService()
    const success = await authService.refreshAccessToken()
    return { success }
  }),

  /**
   * Make authenticated API request
   */
  apiRequest: publicProcedure
    .input(
      z.object({
        endpoint: z.string(),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
        body: z.any().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const authService = getClerkAuthService()
      const response = await authService.apiRequest(input.endpoint, {
        method: input.method || "GET",
        body: input.body ? JSON.stringify(input.body) : undefined,
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`)
      }

      return response.json()
    }),
})
