/**
 * Shared OAuth utilities for Anthropic Claude authentication
 * Used by both oauth-server.ts (initial auth) and claude-token.ts (token refresh)
 */

export const OAUTH_ENDPOINTS = {
  authorization: "https://console.anthropic.com/oauth/authorize",
  token: "https://api.anthropic.com/v1/oauth/token",
} as const;

export const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

export const OAUTH_SCOPES = "org:create_api_key user:profile user:inference";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * Exchange authorization code for OAuth tokens
 */
export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  console.log("[OAuth] Exchanging authorization code for tokens...");
  console.log("[OAuth] Token endpoint:", OAUTH_ENDPOINTS.token);

  const response = await fetch(OAUTH_ENDPOINTS.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[OAuth] Token exchange failed:", response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

/**
 * Refresh OAuth token using refresh token
 */
export async function refreshOAuthToken(refreshToken: string): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: "claude-desktop",
  });

  const response = await fetch(OAUTH_ENDPOINTS.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = (await response.json()) as TokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

/**
 * Check if a token is expired or will expire soon (within 5 minutes)
 */
export function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) {
    return false;
  }
  const bufferMs = 5 * 60 * 1000;
  return Date.now() + bufferMs >= expiresAt;
}
