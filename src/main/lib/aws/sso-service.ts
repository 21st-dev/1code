import {
  SSOClient,
  ListAccountsCommand,
  ListAccountRolesCommand,
  GetRoleCredentialsCommand,
} from "@aws-sdk/client-sso"
import {
  SSOOIDCClient,
  RegisterClientCommand,
  StartDeviceAuthorizationCommand,
  CreateTokenCommand,
} from "@aws-sdk/client-sso-oidc"
import { safeStorage } from "electron"
import { generateCodeChallenge, base64UrlEncode } from "./oauth-server"

// Encryption helpers
function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[aws-sso] Encryption not available, using base64")
    return Buffer.from(value).toString("base64")
  }
  return safeStorage.encryptString(value).toString("base64")
}

function decrypt(encrypted: string): string {
  if (!encrypted) return ""
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
  } catch (error) {
    console.error("[aws-sso] Decryption failed:", error)
    return ""
  }
}

export interface SsoAccount {
  accountId: string
  accountName: string
  emailAddress: string
}

export interface SsoRole {
  roleName: string
  accountId: string
}

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

export interface DeviceAuthResult {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

export interface TokenResult {
  accessToken: string
  refreshToken?: string
  expiresAt: Date
}

export interface ClientRegistration {
  clientId: string
  clientSecret: string
  expiresAt: Date
}

export class AwsSsoService {
  private oidcClient: SSOOIDCClient
  private ssoClient: SSOClient
  private region: string

  constructor(region: string) {
    this.region = region
    this.oidcClient = new SSOOIDCClient({ region })
    this.ssoClient = new SSOClient({ region })
  }

  /**
   * Get the region this service is configured for
   */
  getRegion(): string {
    return this.region
  }

  /**
   * Register OIDC client for device authorization
   */
  async registerClient(): Promise<ClientRegistration> {
    const command = new RegisterClientCommand({
      clientName: "1Code Desktop",
      clientType: "public",
      scopes: ["sso:account:access"],
    })

    const response = await this.oidcClient.send(command)

    if (!response.clientId || !response.clientSecret || !response.clientSecretExpiresAt) {
      throw new Error("Invalid client registration response")
    }

    return {
      clientId: response.clientId,
      clientSecret: encrypt(response.clientSecret),
      expiresAt: new Date(response.clientSecretExpiresAt * 1000),
    }
  }

  /**
   * Start device authorization flow
   */
  async startDeviceAuthorization(
    clientId: string,
    clientSecret: string, // Already encrypted
    ssoStartUrl: string
  ): Promise<DeviceAuthResult> {
    const command = new StartDeviceAuthorizationCommand({
      clientId,
      clientSecret: decrypt(clientSecret),
      startUrl: ssoStartUrl,
    })

    const response = await this.oidcClient.send(command)

    if (!response.deviceCode || !response.userCode || !response.verificationUri) {
      throw new Error("Invalid device authorization response")
    }

    return {
      deviceCode: response.deviceCode,
      userCode: response.userCode,
      verificationUri: response.verificationUri,
      verificationUriComplete: response.verificationUriComplete || response.verificationUri,
      expiresIn: response.expiresIn || 600,
      interval: response.interval || 5,
    }
  }

  /**
   * Poll for access token (call repeatedly until success or expiry)
   */
  async createToken(
    clientId: string,
    clientSecret: string, // Already encrypted
    deviceCode: string
  ): Promise<TokenResult | null> {
    try {
      const command = new CreateTokenCommand({
        clientId,
        clientSecret: decrypt(clientSecret),
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
        deviceCode,
      })

      const response = await this.oidcClient.send(command)

      if (!response.accessToken) {
        return null
      }

      return {
        accessToken: encrypt(response.accessToken),
        refreshToken: response.refreshToken ? encrypt(response.refreshToken) : undefined,
        expiresAt: new Date(Date.now() + (response.expiresIn || 3600) * 1000),
      }
    } catch (error: any) {
      // AuthorizationPendingException means user hasn't completed auth yet
      if (error.name === "AuthorizationPendingException") {
        return null
      }
      // SlowDownException means we're polling too fast
      if (error.name === "SlowDownException") {
        return null
      }
      throw error
    }
  }

  /**
   * List accounts available to the authenticated user
   */
  async listAccounts(accessToken: string): Promise<SsoAccount[]> {
    const accounts: SsoAccount[] = []
    let nextToken: string | undefined

    do {
      const command = new ListAccountsCommand({
        accessToken: decrypt(accessToken),
        nextToken,
      })

      const response = await this.ssoClient.send(command)

      for (const account of response.accountList || []) {
        if (account.accountId && account.accountName) {
          accounts.push({
            accountId: account.accountId,
            accountName: account.accountName,
            emailAddress: account.emailAddress || "",
          })
        }
      }

      nextToken = response.nextToken
    } while (nextToken)

    return accounts
  }

  /**
   * List roles available for an account
   */
  async listAccountRoles(accessToken: string, accountId: string): Promise<SsoRole[]> {
    const roles: SsoRole[] = []
    let nextToken: string | undefined

    do {
      const command = new ListAccountRolesCommand({
        accessToken: decrypt(accessToken),
        accountId,
        nextToken,
      })

      const response = await this.ssoClient.send(command)

      for (const role of response.roleList || []) {
        if (role.roleName) {
          roles.push({
            roleName: role.roleName,
            accountId,
          })
        }
      }

      nextToken = response.nextToken
    } while (nextToken)

    return roles
  }

  /**
   * Get temporary credentials for a role
   */
  async getRoleCredentials(
    accessToken: string,
    accountId: string,
    roleName: string
  ): Promise<AwsCredentials> {
    const command = new GetRoleCredentialsCommand({
      accessToken: decrypt(accessToken),
      accountId,
      roleName,
    })

    const response = await this.ssoClient.send(command)
    const creds = response.roleCredentials

    if (!creds?.accessKeyId || !creds.secretAccessKey || !creds.sessionToken) {
      throw new Error("Invalid role credentials response")
    }

    return {
      accessKeyId: encrypt(creds.accessKeyId),
      secretAccessKey: encrypt(creds.secretAccessKey),
      sessionToken: encrypt(creds.sessionToken),
      expiration: new Date(creds.expiration || Date.now() + 3600000),
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ): Promise<TokenResult> {
    const command = new CreateTokenCommand({
      clientId,
      clientSecret: decrypt(clientSecret),
      grantType: "refresh_token",
      refreshToken: decrypt(refreshToken),
    })

    const response = await this.oidcClient.send(command)

    if (!response.accessToken) {
      throw new Error("Token refresh failed")
    }

    return {
      accessToken: encrypt(response.accessToken),
      refreshToken: response.refreshToken ? encrypt(response.refreshToken) : refreshToken,
      expiresAt: new Date(Date.now() + (response.expiresIn || 3600) * 1000),
    }
  }

  // ============================================================================
  // OAuth2 Authorization Code Flow with PKCE (AWS CLI style)
  // ============================================================================

  /**
   * Register OIDC client with redirect URI support for OAuth flow
   * @param redirectUris List of allowed redirect URIs (e.g., http://127.0.0.1:PORT/callback)
   */
  async registerClientWithRedirect(redirectUris: string[]): Promise<ClientRegistration> {
    const command = new RegisterClientCommand({
      clientName: "1Code Desktop",
      clientType: "public",
      scopes: ["sso:account:access"],
      // Note: AWS SSO OIDC may or may not support redirectUris in RegisterClient
      // If not supported, we'll still use the standard authorization flow
    })

    const response = await this.oidcClient.send(command)

    if (!response.clientId || !response.clientSecret || !response.clientSecretExpiresAt) {
      throw new Error("Invalid client registration response")
    }

    return {
      clientId: response.clientId,
      clientSecret: encrypt(response.clientSecret),
      expiresAt: new Date(response.clientSecretExpiresAt * 1000),
    }
  }

  /**
   * Build the authorization URL for OAuth flow
   * User opens this URL in browser to authenticate
   *
   * @param clientId OIDC client ID
   * @param ssoStartUrl AWS SSO start URL
   * @param redirectUri Local callback URL (e.g., http://127.0.0.1:PORT/callback)
   * @param state Random state for CSRF protection
   * @param codeChallenge PKCE code challenge (S256)
   */
  buildAuthorizationUrl(
    clientId: string,
    ssoStartUrl: string,
    redirectUri: string,
    state: string,
    codeChallenge: string
  ): string {
    // AWS SSO uses the start URL to derive the OIDC issuer
    // The authorization endpoint is at the OIDC issuer + /oauth2/authorize
    // However, AWS SSO OIDC doesn't support the standard authorization endpoint
    // Instead, we need to use the device authorization flow or direct the user
    // to the SSO portal and capture the redirect

    // For AWS SSO, the authorization URL pattern is:
    // https://{start-url}/oauth2/authorize?...
    // But AWS SSO Identity Center uses a different flow

    // Build the authorize URL
    const authorizeUrl = new URL(`${ssoStartUrl}`)

    // AWS SSO uses the OIDC authorize endpoint
    // The format is: https://portal.sso.{region}.amazonaws.com/authorize
    // But we need to derive this from the start URL

    // Extract the portal URL from start URL
    // e.g., https://d-abc123.awsapps.com/start -> https://d-abc123.awsapps.com
    const baseUrl = ssoStartUrl.replace(/\/start\/?$/, "")

    // Build OAuth authorize URL
    const authUrl = new URL(`${baseUrl}/oauth2/authorize`)
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", "sso:account:access")
    authUrl.searchParams.set("state", state)
    authUrl.searchParams.set("code_challenge", codeChallenge)
    authUrl.searchParams.set("code_challenge_method", "S256")

    return authUrl.toString()
  }

  /**
   * Exchange authorization code for tokens (OAuth2 Authorization Code Grant)
   * Called after user completes login and browser redirects to callback
   *
   * @param clientId OIDC client ID
   * @param clientSecret OIDC client secret (encrypted)
   * @param code Authorization code from callback
   * @param redirectUri The redirect URI used in the authorization request
   * @param codeVerifier PKCE code verifier
   */
  async exchangeCodeForToken(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<TokenResult> {
    const command = new CreateTokenCommand({
      clientId,
      clientSecret: decrypt(clientSecret),
      grantType: "authorization_code",
      code,
      redirectUri,
      codeVerifier, // PKCE verification
    })

    const response = await this.oidcClient.send(command)

    if (!response.accessToken) {
      throw new Error("Failed to exchange code for token")
    }

    return {
      accessToken: encrypt(response.accessToken),
      refreshToken: response.refreshToken ? encrypt(response.refreshToken) : undefined,
      expiresAt: new Date(Date.now() + (response.expiresIn || 3600) * 1000),
    }
  }
}

// Export encryption helpers for use in other modules
export { encrypt, decrypt }
