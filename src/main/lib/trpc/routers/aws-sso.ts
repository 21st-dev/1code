import { z } from "zod"
import { shell } from "electron"
import { eq } from "drizzle-orm"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeSettings } from "../../db"
import { AwsSsoService, decrypt } from "../../aws/sso-service"
import {
  OAuthCallbackServer,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../../aws/oauth-server"

// Cached service instance
let ssoService: AwsSsoService | null = null

function getSsoService(region: string): AwsSsoService {
  if (!ssoService || ssoService.getRegion() !== region) {
    ssoService = new AwsSsoService(region)
  }
  return ssoService
}

// Temporary storage for OAuth state (in-memory)
interface OAuthState {
  state: string
  codeVerifier: string
  redirectUri: string
  server: OAuthCallbackServer
}
let pendingOAuthState: OAuthState | null = null

export const awsSsoRouter = router({
  /**
   * Start browser-based OAuth flow (AWS CLI style)
   * This is the preferred method - no code copying required!
   */
  startBrowserAuth: publicProcedure
    .input(
      z.object({
        ssoStartUrl: z.string().url(),
        ssoRegion: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const service = getSsoService(input.ssoRegion)
      const db = getDatabase()

      // Get or register OIDC client
      let settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      let clientId = settings?.ssoClientId
      let clientSecret = settings?.ssoClientSecret
      let clientExpiresAt = settings?.ssoClientExpiresAt

      // Register new client if needed
      const now = new Date()
      if (!clientId || !clientSecret || !clientExpiresAt || clientExpiresAt < now) {
        console.log("[aws-sso] Registering new OIDC client for browser auth")
        const registration = await service.registerClient()
        clientId = registration.clientId
        clientSecret = registration.clientSecret
        clientExpiresAt = registration.expiresAt

        // Save client registration
        if (settings) {
          db.update(claudeCodeSettings)
            .set({
              ssoClientId: clientId,
              ssoClientSecret: clientSecret,
              ssoClientExpiresAt: clientExpiresAt,
              ssoStartUrl: input.ssoStartUrl,
              ssoRegion: input.ssoRegion,
              updatedAt: new Date(),
            })
            .where(eq(claudeCodeSettings.id, "default"))
            .run()
        } else {
          db.insert(claudeCodeSettings)
            .values({
              id: "default",
              customEnvVars: "{}",
              mcpServerSettings: "{}",
              authMode: "aws",
              bedrockRegion: "us-east-1",
              ssoClientId: clientId,
              ssoClientSecret: clientSecret,
              ssoClientExpiresAt: clientExpiresAt,
              ssoStartUrl: input.ssoStartUrl,
              ssoRegion: input.ssoRegion,
            })
            .run()
        }
      }

      // Clean up any previous OAuth state
      if (pendingOAuthState?.server) {
        pendingOAuthState.server.close()
      }

      // Start local HTTP server for callback
      const server = new OAuthCallbackServer()
      const port = await server.start()
      const redirectUri = server.getRedirectUri()

      // Generate PKCE parameters
      const state = generateState()
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      // Store state for later verification
      pendingOAuthState = {
        state,
        codeVerifier,
        redirectUri,
        server,
      }

      // Build authorization URL
      const authUrl = service.buildAuthorizationUrl(
        clientId,
        input.ssoStartUrl,
        redirectUri,
        state,
        codeChallenge
      )

      console.log("[aws-sso] Opening browser for OAuth:", authUrl)

      // Open browser
      shell.openExternal(authUrl)

      // Wait for callback (5 minute timeout)
      try {
        const callbackResult = await server.waitForCallback(300000)

        // Check for error in callback
        if (callbackResult.error) {
          throw new Error(
            `OAuth error: ${callbackResult.error}${
              callbackResult.errorDescription ? ` - ${callbackResult.errorDescription}` : ""
            }`
          )
        }

        // Verify state to prevent CSRF
        if (callbackResult.state !== pendingOAuthState.state) {
          throw new Error("State mismatch - possible CSRF attack")
        }

        // Exchange code for tokens
        const tokens = await service.exchangeCodeForToken(
          clientId,
          clientSecret,
          callbackResult.code,
          pendingOAuthState.redirectUri,
          pendingOAuthState.codeVerifier
        )

        // Save tokens to database
        db.update(claudeCodeSettings)
          .set({
            ssoAccessToken: tokens.accessToken,
            ssoRefreshToken: tokens.refreshToken || null,
            ssoTokenExpiresAt: tokens.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()

        // Clear pending state
        pendingOAuthState = null

        return {
          success: true,
          expiresAt: tokens.expiresAt.toISOString(),
        }
      } catch (error) {
        // Clean up on error
        if (pendingOAuthState?.server) {
          pendingOAuthState.server.close()
        }
        pendingOAuthState = null
        throw error
      }
    }),

  /**
   * Cancel pending OAuth flow
   */
  cancelBrowserAuth: publicProcedure.mutation(() => {
    if (pendingOAuthState?.server) {
      pendingOAuthState.server.close()
    }
    pendingOAuthState = null
    return { success: true }
  }),

  /**
   * Start SSO device authorization flow (legacy - use startBrowserAuth instead)
   */
  startDeviceAuth: publicProcedure
    .input(
      z.object({
        ssoStartUrl: z.string().url(),
        ssoRegion: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const service = getSsoService(input.ssoRegion)
      const db = getDatabase()

      // Get or register OIDC client
      let settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      let clientId = settings?.ssoClientId
      let clientSecret = settings?.ssoClientSecret
      let clientExpiresAt = settings?.ssoClientExpiresAt

      // Register new client if needed
      const now = new Date()
      if (!clientId || !clientSecret || !clientExpiresAt || clientExpiresAt < now) {
        console.log("[aws-sso] Registering new OIDC client")
        const registration = await service.registerClient()
        clientId = registration.clientId
        clientSecret = registration.clientSecret
        clientExpiresAt = registration.expiresAt

        // Save client registration
        if (settings) {
          db.update(claudeCodeSettings)
            .set({
              ssoClientId: clientId,
              ssoClientSecret: clientSecret,
              ssoClientExpiresAt: clientExpiresAt,
              ssoStartUrl: input.ssoStartUrl,
              ssoRegion: input.ssoRegion,
              updatedAt: new Date(),
            })
            .where(eq(claudeCodeSettings.id, "default"))
            .run()
        } else {
          db.insert(claudeCodeSettings)
            .values({
              id: "default",
              customEnvVars: "{}",
              mcpServerSettings: "{}",
              authMode: "aws",
              bedrockRegion: "us-east-1",
              ssoClientId: clientId,
              ssoClientSecret: clientSecret,
              ssoClientExpiresAt: clientExpiresAt,
              ssoStartUrl: input.ssoStartUrl,
              ssoRegion: input.ssoRegion,
            })
            .run()
        }
      }

      // Start device authorization
      const deviceAuth = await service.startDeviceAuthorization(
        clientId,
        clientSecret,
        input.ssoStartUrl
      )

      return {
        deviceCode: deviceAuth.deviceCode,
        userCode: deviceAuth.userCode,
        verificationUri: deviceAuth.verificationUri,
        verificationUriComplete: deviceAuth.verificationUriComplete,
        expiresIn: deviceAuth.expiresIn,
        interval: deviceAuth.interval,
      }
    }),

  /**
   * Open SSO verification URL in browser
   */
  openVerificationUrl: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(({ input }) => {
      shell.openExternal(input.url)
      return { opened: true }
    }),

  /**
   * Poll for device auth completion
   */
  pollDeviceAuth: publicProcedure
    .input(z.object({ deviceCode: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (!settings?.ssoClientId || !settings?.ssoClientSecret || !settings?.ssoRegion) {
        throw new Error("SSO client not registered")
      }

      const service = getSsoService(settings.ssoRegion)

      try {
        const token = await service.createToken(
          settings.ssoClientId,
          settings.ssoClientSecret,
          input.deviceCode
        )

        if (!token) {
          return { status: "pending" as const }
        }

        // Save tokens
        db.update(claudeCodeSettings)
          .set({
            ssoAccessToken: token.accessToken,
            ssoRefreshToken: token.refreshToken || null,
            ssoTokenExpiresAt: token.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()

        return { status: "success" as const, expiresAt: token.expiresAt.toISOString() }
      } catch (error: any) {
        if (error.name === "ExpiredTokenException") {
          return { status: "expired" as const }
        }
        if (error.name === "AccessDeniedException") {
          return { status: "denied" as const }
        }
        throw error
      }
    }),

  /**
   * List AWS accounts available to authenticated user
   */
  listAccounts: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
      return { accounts: [], error: "Not authenticated" }
    }

    // Check if token is expired
    if (settings.ssoTokenExpiresAt && settings.ssoTokenExpiresAt < new Date()) {
      return { accounts: [], error: "Token expired" }
    }

    try {
      const service = getSsoService(settings.ssoRegion)
      const accounts = await service.listAccounts(settings.ssoAccessToken)
      return { accounts }
    } catch (error: any) {
      console.error("[aws-sso] Failed to list accounts:", error)
      return { accounts: [], error: error.message }
    }
  }),

  /**
   * List roles for a specific account
   */
  listRoles: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
        return { roles: [], error: "Not authenticated" }
      }

      try {
        const service = getSsoService(settings.ssoRegion)
        const roles = await service.listAccountRoles(settings.ssoAccessToken, input.accountId)
        return { roles }
      } catch (error: any) {
        console.error("[aws-sso] Failed to list roles:", error)
        return { roles: [], error: error.message }
      }
    }),

  /**
   * Select account and role, then fetch credentials
   */
  selectProfile: publicProcedure
    .input(
      z.object({
        accountId: z.string(),
        accountName: z.string(),
        roleName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
        throw new Error("Not authenticated")
      }

      const service = getSsoService(settings.ssoRegion)

      // Get role credentials
      const credentials = await service.getRoleCredentials(
        settings.ssoAccessToken,
        input.accountId,
        input.roleName
      )

      // Save selection and credentials
      db.update(claudeCodeSettings)
        .set({
          ssoAccountId: input.accountId,
          ssoAccountName: input.accountName,
          ssoRoleName: input.roleName,
          awsAccessKeyId: credentials.accessKeyId,
          awsSecretAccessKey: credentials.secretAccessKey,
          awsSessionToken: credentials.sessionToken,
          awsCredentialsExpiresAt: credentials.expiration,
          updatedAt: new Date(),
        })
        .where(eq(claudeCodeSettings.id, "default"))
        .run()

      return {
        success: true,
        expiresAt: credentials.expiration.toISOString(),
      }
    }),

  /**
   * Get current SSO status
   */
  getStatus: publicProcedure.query(() => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings) {
      return {
        configured: false,
        authenticated: false,
        hasCredentials: false,
      }
    }

    const now = new Date()
    const tokenValid = settings.ssoTokenExpiresAt && settings.ssoTokenExpiresAt > now
    const credsValid = settings.awsCredentialsExpiresAt && settings.awsCredentialsExpiresAt > now

    return {
      configured: !!settings.ssoStartUrl && !!settings.ssoRegion,
      authenticated: !!settings.ssoAccessToken && tokenValid,
      hasCredentials: !!settings.awsAccessKeyId && credsValid,
      ssoStartUrl: settings.ssoStartUrl,
      ssoRegion: settings.ssoRegion,
      accountId: settings.ssoAccountId,
      accountName: settings.ssoAccountName,
      roleName: settings.ssoRoleName,
      tokenExpiresAt: settings.ssoTokenExpiresAt?.toISOString(),
      credentialsExpiresAt: settings.awsCredentialsExpiresAt?.toISOString(),
    }
  }),

  /**
   * Refresh AWS credentials using stored SSO token
   */
  refreshCredentials: publicProcedure.mutation(async () => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
      throw new Error("Not authenticated")
    }

    if (!settings.ssoAccountId || !settings.ssoRoleName) {
      throw new Error("No account/role selected")
    }

    const service = getSsoService(settings.ssoRegion)

    // Check if SSO token needs refresh
    const now = new Date()
    let accessToken = settings.ssoAccessToken

    if (settings.ssoTokenExpiresAt && settings.ssoTokenExpiresAt < now) {
      if (!settings.ssoRefreshToken || !settings.ssoClientId || !settings.ssoClientSecret) {
        throw new Error("SSO session expired, please re-authenticate")
      }

      // Refresh SSO token
      const newToken = await service.refreshToken(
        settings.ssoClientId,
        settings.ssoClientSecret,
        settings.ssoRefreshToken
      )

      accessToken = newToken.accessToken

      db.update(claudeCodeSettings)
        .set({
          ssoAccessToken: newToken.accessToken,
          ssoRefreshToken: newToken.refreshToken || settings.ssoRefreshToken,
          ssoTokenExpiresAt: newToken.expiresAt,
        })
        .where(eq(claudeCodeSettings.id, "default"))
        .run()
    }

    // Get new role credentials
    const credentials = await service.getRoleCredentials(
      accessToken,
      settings.ssoAccountId,
      settings.ssoRoleName
    )

    db.update(claudeCodeSettings)
      .set({
        awsAccessKeyId: credentials.accessKeyId,
        awsSecretAccessKey: credentials.secretAccessKey,
        awsSessionToken: credentials.sessionToken,
        awsCredentialsExpiresAt: credentials.expiration,
        updatedAt: new Date(),
      })
      .where(eq(claudeCodeSettings.id, "default"))
      .run()

    return {
      success: true,
      expiresAt: credentials.expiration.toISOString(),
    }
  }),

  /**
   * Logout from SSO
   */
  logout: publicProcedure.mutation(() => {
    const db = getDatabase()

    db.update(claudeCodeSettings)
      .set({
        ssoAccessToken: null,
        ssoRefreshToken: null,
        ssoTokenExpiresAt: null,
        ssoAccountId: null,
        ssoAccountName: null,
        ssoRoleName: null,
        awsAccessKeyId: null,
        awsSecretAccessKey: null,
        awsSessionToken: null,
        awsCredentialsExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(claudeCodeSettings.id, "default"))
      .run()

    return { success: true }
  }),
})
