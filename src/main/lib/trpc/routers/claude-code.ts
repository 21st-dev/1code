import { z } from "zod"
import { getAuthManager } from "../../../index"
import { publicProcedure, router } from "../index"

/**
 * Azure Claude configuration router
 * Manages Azure API credentials for Claude
 */
export const claudeCodeRouter = router({
  /**
   * Check if Azure credentials are configured
   */
  getIntegration: publicProcedure.query(() => {
    const authManager = getAuthManager()
    const config = authManager.getConfig()

    return {
      isConnected: authManager.isAuthenticated(),
      endpoint: config?.endpoint || null,
      deploymentName: config?.deploymentName || null,
    }
  }),

  /**
   * Save Azure configuration
   */
  saveConfig: publicProcedure
    .input(
      z.object({
        endpoint: z.string().min(1, "Endpoint is required"),
        apiKey: z.string().min(1, "API key is required"),
        deploymentName: z.string().min(1, "Deployment name is required"),
      })
    )
    .mutation(({ input }) => {
      const authManager = getAuthManager()
      authManager.saveConfig({
        endpoint: input.endpoint.trim(),
        apiKey: input.apiKey.trim(),
        deploymentName: input.deploymentName.trim(),
      })
      console.log("[AzureConfig] Configuration saved")
      return { success: true }
    }),

  /**
   * Test Azure connection
   */
  testConnection: publicProcedure
    .input(
      z.object({
        endpoint: z.string().min(1),
        apiKey: z.string().min(1),
        deploymentName: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Try to make a simple API call to verify credentials
        const testUrl = `${input.endpoint.replace(/\/$/, "")}/v1/models`
        const response = await fetch(testUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
          },
        })

        if (response.ok) {
          return { success: true, message: "Connection successful" }
        } else if (response.status === 401) {
          return { success: false, message: "Invalid API key" }
        } else if (response.status === 404) {
          // Some endpoints don't have /v1/models, try a different check
          return { success: true, message: "Endpoint reachable (model list not available)" }
        } else {
          return { success: false, message: `Connection failed: ${response.status}` }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return { success: false, message: `Connection failed: ${message}` }
      }
    }),

  /**
   * Clear Azure configuration (disconnect)
   */
  disconnect: publicProcedure.mutation(() => {
    const authManager = getAuthManager()
    authManager.logout()
    console.log("[AzureConfig] Configuration cleared")
    return { success: true }
  }),

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig: publicProcedure.query(() => {
    const authManager = getAuthManager()
    const config = authManager.getConfig()

    if (!config) {
      return { configured: false, endpoint: null, deploymentName: null }
    }

    return {
      configured: true,
      endpoint: config.endpoint,
      deploymentName: config.deploymentName,
      // Don't expose the API key
    }
  }),
})
