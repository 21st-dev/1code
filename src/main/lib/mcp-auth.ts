import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BrowserWindow } from 'electron';
import { getClaudeShellEnvironment } from './claude/env';
import {
  GLOBAL_MCP_PATH,
  getLocusPluginMcpProvenance,
  getMcpServerConfig,
  readClaudeConfig,
  updateClaudeConfigAtomic,
  updateMcpServerConfig,
} from './claude-config';
import { assertOfficialCloudAllowed, openExternalUrl } from './local-only';
import {
  type McpOAuthTokensForStorage,
  readMcpOAuthTokens,
  saveMcpOAuthTokens,
} from './mcp-oauth-token-store';
import { CraftOAuth, fetchOAuthMetadata, getMcpBaseUrl, type OAuthMetadata, type OAuthTokens } from './oauth';
import { discoverPluginMcpServers } from './plugins';
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from './trpc/routers/claude-settings';
import { bringToFront } from './window';


/**
 * Fetch tools from an MCP server using the official MCP SDK
 * @param serverUrl The MCP server URL
 * @param accessToken Optional access token (not needed for public MCPs)
 */
export interface McpToolInfo {
  name: string;
  description?: string;
}

export async function fetchMcpTools(
  serverUrl: string,
  headers?: Record<string, string>
): Promise<McpToolInfo[]> {
  assertOfficialCloudAllowed('connect MCP server', serverUrl);

  let client: Client | null = null;
  let transport: StreamableHTTPClientTransport | null = null;

  try {
    client = new Client({
      name: 'locus',
      version: '1.0.0',
    });

    const requestInit: RequestInit = {};
    if (headers && Object.keys(headers).length > 0) {
      requestInit.headers = { ...headers };
    }

    transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      requestInit,
    });

    await client.connect(transport);

    const result = await client.listTools();
    const tools = result.tools || [];

    console.log(`[MCP] Fetched ${tools.length} tools via SDK`);
    return tools.map(t => ({ name: t.name, description: t.description }));
  } catch (error) {
    console.error('[MCP] Failed to fetch tools:', error);
    return [];
  } finally {
    // Clean up the connection
    try {
      if (transport) {
        await transport.close();
      }
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Sensitive env vars to filter out when spawning MCP subprocesses
 */
const BLOCKED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'OPENAI_API_KEY',
];

const STDIO_MCP_FETCH_TIMEOUT_MS = 40_000;

/**
 * Fetch tools from a stdio-based MCP server
 * Uses shell environment to ensure proper PATH (homebrew, nvm, etc.) in production
 */
export async function fetchMcpToolsStdio(config: {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
}): Promise<McpToolInfo[]> {
  let transport: StdioClientTransport | null = null;
  let timeout: NodeJS.Timeout | null = null;

  try {
    const client = new Client({
      name: 'locus',
      version: '1.0.0',
    });

    // Get shell environment with proper PATH (includes homebrew, nvm, etc.)
    // This is critical for production where Electron apps launched from Finder
    // have a minimal PATH that excludes user-installed tools
    const shellEnv = getClaudeShellEnvironment();

    // Filter sensitive env vars
    const safeEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(shellEnv)) {
      if (!BLOCKED_ENV_VARS.includes(key)) {
        safeEnv[key] = value;
      }
    }

    transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...safeEnv, ...config.env },
      cwd: config.cwd,
    });

    const fetchPromise = (async () => {
      await client.connect(transport!);
      const result = await client.listTools();
      return result.tools || [];
    })();
    fetchPromise.catch(() => undefined);

    const timeoutMs = config.timeoutMs ?? STDIO_MCP_FETCH_TIMEOUT_MS;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const tools = await Promise.race([fetchPromise, timeoutPromise]);

    console.log(`[MCP] Fetched ${tools.length} tools via stdio`);
    return tools.map(t => ({ name: t.name, description: t.description }));
  } catch (error) {
    console.error('[MCP] Failed to fetch tools via stdio:', error);
    return [];
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    try {
      if (transport) {
        await transport.close();
      }
    } catch {
      // Ignore close errors
    }
  }
}

import { AUTH_SERVER_PORT, IS_DEV } from '../constants';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

type McpOAuthConfig = {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  expiresAt?: number;
  tokenType?: string;
  hasTokens?: boolean;
}

function removeAuthorizationHeader(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const next = Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'authorization'),
  );
  return Object.keys(next).length > 0 ? next : undefined;
}

function oauthMetadata(input: {
  tokens?: Pick<McpOAuthTokensForStorage, 'clientId' | 'expiresAt' | 'tokenType'> | null;
  fallback?: McpOAuthConfig;
}): McpOAuthConfig {
  return {
    hasTokens: true,
    ...(input.tokens?.clientId || input.fallback?.clientId
      ? { clientId: input.tokens?.clientId ?? input.fallback?.clientId }
      : {}),
    ...(input.tokens?.expiresAt || input.fallback?.expiresAt
      ? { expiresAt: input.tokens?.expiresAt ?? input.fallback?.expiresAt }
      : {}),
    ...(input.tokens?.tokenType || input.fallback?.tokenType
      ? { tokenType: input.tokens?.tokenType ?? input.fallback?.tokenType }
      : {}),
  };
}

function materializeAuthorizationHeaders(
  headers: Record<string, string> | undefined,
  accessToken: string,
): Record<string, string> {
  return {
    ...(headers || {}),
    Authorization: `Bearer ${accessToken}`,
  };
}

async function resolveMcpOAuthTokens(input: {
  serverName: string;
  projectPath: string;
  serverConfig: { _oauth?: McpOAuthConfig } | undefined;
}): Promise<McpOAuthTokensForStorage | null> {
  const storedTokens = readMcpOAuthTokens({
    serverName: input.serverName,
    projectPath: input.projectPath,
  });
  if (storedTokens?.accessToken) {
    return storedTokens;
  }

  const legacyOauth = input.serverConfig?._oauth;
  if (!legacyOauth?.accessToken) return null;

  const legacyTokens: McpOAuthTokensForStorage = {
    accessToken: legacyOauth.accessToken,
    ...(legacyOauth.refreshToken ? { refreshToken: legacyOauth.refreshToken } : {}),
    ...(legacyOauth.clientId ? { clientId: legacyOauth.clientId } : {}),
    ...(legacyOauth.expiresAt ? { expiresAt: legacyOauth.expiresAt } : {}),
    ...(legacyOauth.tokenType ? { tokenType: legacyOauth.tokenType } : {}),
  };

  await saveTokensToClaudeJson(
    input.serverName,
    input.projectPath,
    {
      accessToken: legacyTokens.accessToken,
      refreshToken: legacyTokens.refreshToken,
      expiresAt: legacyTokens.expiresAt,
      tokenType: legacyTokens.tokenType ?? 'Bearer',
    },
    legacyTokens.clientId,
  );

  return legacyTokens;
}

function getMcpOAuthRedirectUri(): string {
  return IS_DEV
    ? `http://localhost:${AUTH_SERVER_PORT}/callback`
    : `http://127.0.0.1:${AUTH_SERVER_PORT}/callback`;
}

interface PendingOAuth {
  serverName: string;
  projectPath: string;
  codeVerifier: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  resolve: (result: { success: boolean; error?: string }) => void;
  timeoutId: NodeJS.Timeout;
}

const pendingOAuthFlows = new Map<string, PendingOAuth>();

/**
 * Start MCP OAuth flow for a server
 * Fetches OAuth metadata from .well-known endpoint
 */
export async function startMcpOAuth(
  serverName: string,
  projectPath: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Read server config from ~/.claude.json
  const config = await readClaudeConfig();
  let serverConfig = getMcpServerConfig(config, projectPath, serverName);
  if (getLocusPluginMcpProvenance(serverConfig)) {
    serverConfig = undefined;
  }

  // Fallback: check plugin MCP servers if not found in ~/.claude.json
  if (!serverConfig?.url) {
    const [
      pluginMcpConfigs,
      enabledPluginSources,
      approvedPluginMcpServers,
    ] = await Promise.all([
      discoverPluginMcpServers(),
      getEnabledPlugins(),
      getApprovedPluginMcpServers(),
    ]);
    for (const pluginConfig of pluginMcpConfigs) {
      const identifier = pluginConfig.approvalIdentifiers[serverName];
      if (
        pluginConfig.mcpServers[serverName] &&
        enabledPluginSources.includes(pluginConfig.pluginSource) &&
        pluginConfig.reviewGate.canUseMcp &&
        identifier &&
        approvedPluginMcpServers.includes(identifier)
      ) {
        serverConfig = pluginConfig.mcpServers[serverName];
        // Save plugin server config to ~/.claude.json so token storage works
        await updateClaudeConfigAtomic((cfg) => {
          return updateMcpServerConfig(cfg, GLOBAL_MCP_PATH, serverName, {
            url: serverConfig!.url,
            type: serverConfig!.url?.endsWith('/sse') ? 'sse' : 'http',
            authType: 'oauth',
            _locusPluginMcp: {
              pluginSource: pluginConfig.pluginSource,
              pluginReviewKey: pluginConfig.pluginReviewKey,
              serverName,
              approvalIdentifier: identifier,
            },
          });
        });
        break;
      }
    }
  }

  if (!serverConfig?.url) {
    return { success: false, error: `MCP server "${serverName}" URL not configured` };
  }

  // 2. Use CraftOAuth for OAuth logic
  const redirectUri = getMcpOAuthRedirectUri();
  const mcpBaseUrl = getMcpBaseUrl(serverConfig.url);
  assertOfficialCloudAllowed('start MCP OAuth', mcpBaseUrl);
  const oauth = new CraftOAuth(
    { mcpBaseUrl, redirectUri },
    { onStatus: (msg) => console.log(`[MCP OAuth] ${msg}`), onError: (err) => console.error(`[MCP OAuth] ${err}`) }
  );

  // 3. Start OAuth flow (fetches metadata from .well-known, then gets auth URL)
  let authFlowResult;
  try {
    authFlowResult = await oauth.startAuthFlow();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[MCP OAuth] Failed to start auth flow: ${msg}`);
    return { success: false, error: msg };
  }

  const { authUrl, state, codeVerifier, tokenEndpoint, clientId, clientSecret } = authFlowResult;

  // 4. Store pending flow and wait for callback
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingOAuthFlows.delete(state);
      resolve({ success: false, error: 'OAuth timeout' });
    }, OAUTH_TIMEOUT_MS);

    pendingOAuthFlows.set(state, {
      serverName,
      projectPath,
      codeVerifier,
      tokenEndpoint,
      clientId,
      clientSecret,
      redirectUri,
      resolve,
      timeoutId,
    });

    void openExternalUrl('open MCP OAuth authorization URL', authUrl).catch((error) => {
      clearTimeout(timeoutId);
      pendingOAuthFlows.delete(state);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

/**
 * Handle OAuth callback from deeplink
 */
export async function handleMcpOAuthCallback(code: string, state: string): Promise<void> {
  const pending = pendingOAuthFlows.get(state);
  if (!pending) {
    console.warn(`[MCP OAuth] No pending flow for state: ${state.slice(0, 8)}...`);
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingOAuthFlows.delete(state);

  try {
    // 1. Get server URL for CraftOAuth
    const config = await readClaudeConfig();
    const serverUrl = getMcpServerConfig(config, pending.projectPath, pending.serverName)?.url;

    if (!serverUrl) {
      throw new Error(`Server URL not found for ${pending.serverName}`);
    }

    // 2. Use CraftOAuth to exchange code for tokens
    const mcpBaseUrl = getMcpBaseUrl(serverUrl);
    assertOfficialCloudAllowed('complete MCP OAuth', mcpBaseUrl);
    const oauth = new CraftOAuth(
      { mcpBaseUrl, redirectUri: pending.redirectUri },
      { onStatus: () => {}, onError: () => {} }
    );

    const tokens = await oauth.completeAuthFlow(
      code,
      pending.codeVerifier,
      pending.tokenEndpoint,
      pending.clientId,
      pending.clientSecret
    );

    // 3. Save encrypted tokens and scrub plaintext Claude config fields.
    await saveTokensToClaudeJson(pending.serverName, pending.projectPath, tokens, pending.clientId);

    // 4. Notify renderer (tools will be fetched on demand via tRPC)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('mcp-auth-completed', {
        serverName: pending.serverName,
        projectPath: pending.projectPath,
        success: true,
      });
    });

    // 5. Focus the main window after OAuth callback
    bringToFront();

    pending.resolve({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    pending.resolve({ success: false, error: msg });
  }
}


/**
 * Check if MCP token needs refresh (within 5 minutes of expiry)
 */
function needsRefresh(expiresAt: number | undefined): boolean {
  if (!expiresAt) return false;
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() > expiresAt - fiveMinutes;
}

/**
 * Refresh MCP OAuth token for a server
 * Returns the new access token, or null if refresh fails
 */
export async function refreshMcpToken(
  serverName: string,
  projectPath: string
): Promise<string | null> {
  try {
    const config = await readClaudeConfig();
    let serverConfig = getMcpServerConfig(config, projectPath, serverName);
    let resolvedProjectPath = projectPath;

    // Fallback to global MCP servers if not found or missing URL in project scope.
    if (!serverConfig?.url) {
      const globalConfig = getMcpServerConfig(config, GLOBAL_MCP_PATH, serverName);
      if (globalConfig?.url) {
        serverConfig = globalConfig;
        resolvedProjectPath = GLOBAL_MCP_PATH;
      }
    }

    if (!serverConfig?.url) {
      console.log(`[MCP Refresh] No URL for server ${serverName}`);
      return null;
    }

    const oauth = serverConfig._oauth as McpOAuthConfig | undefined;
    const storedTokens = await resolveMcpOAuthTokens({
      serverName,
      projectPath: resolvedProjectPath,
      serverConfig,
    });
    const refreshToken = storedTokens?.refreshToken;
    const clientId = storedTokens?.clientId ?? oauth?.clientId;

    if (!refreshToken || !clientId) {
      console.log(`[MCP Refresh] No refresh token or clientId for ${serverName}`);
      return null;
    }

    // Use CraftOAuth to refresh the token
    const mcpBaseUrl = getMcpBaseUrl(serverConfig.url);
    assertOfficialCloudAllowed('refresh MCP OAuth', mcpBaseUrl);
    const craftOAuth = new CraftOAuth(
      { mcpBaseUrl },
      { onStatus: () => {}, onError: () => {} }
    );

    const tokens = await craftOAuth.refreshAccessToken(refreshToken, clientId);

    // Store refreshed tokens in app-owned safeStorage and scrub Claude config.
    await saveTokensToClaudeJson(serverName, resolvedProjectPath, tokens, clientId);

    console.log(`[MCP Refresh] Successfully refreshed token for ${serverName}`);
    return tokens.accessToken;
  } catch (error) {
    console.error(`[MCP Refresh] Failed to refresh token for ${serverName}:`, error);
    return null;
  }
}

/**
 * Ensure MCP servers have valid tokens, refreshing if needed
 * Call this before passing servers to the SDK
 * Returns the servers config with updated Authorization headers
 */
export async function ensureMcpTokensFresh(
  mcpServers: Record<string, any>,
  projectPath: string
): Promise<Record<string, any>> {
  const updatedServers = { ...mcpServers };

  for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
    const oauth = serverConfig._oauth as McpOAuthConfig | undefined;
    const storedTokens = await resolveMcpOAuthTokens({
      serverName,
      projectPath,
      serverConfig,
    });

    // Skip servers without OAuth
    if (!storedTokens?.accessToken) continue;

    // Check if token needs refresh (within 5 min of expiry)
    let accessToken = storedTokens.accessToken;
    let tokenMetadata: McpOAuthTokensForStorage = storedTokens;
    if (needsRefresh(storedTokens.expiresAt ?? oauth?.expiresAt)) {
      console.log(`[MCP] Token for ${serverName} expires soon, refreshing...`);
      const newToken = await refreshMcpToken(serverName, projectPath);

      if (newToken) {
        accessToken = newToken;
        tokenMetadata = readMcpOAuthTokens({ serverName, projectPath }) ?? storedTokens;
      }
    }

    // Materialize Authorization only in memory for the SDK/runtime.
    updatedServers[serverName] = {
      ...serverConfig,
      headers: materializeAuthorizationHeaders(
        serverConfig.headers as Record<string, string> | undefined,
        accessToken,
      ),
      _oauth: oauthMetadata({ tokens: tokenMetadata, fallback: oauth }),
    };
  }

  return updatedServers;
}

/**
 * Save OAuth tokens to app-owned safeStorage and scrub ~/.claude.json.
 * Uses a mutex to prevent race conditions when multiple concurrent
 * token refreshes try to update the config simultaneously.
 */
async function saveTokensToClaudeJson(
  serverName: string,
  projectPath: string,
  tokens: OAuthTokens,
  clientId?: string
): Promise<void> {
  await saveMcpOAuthTokens({
    serverName,
    projectPath,
    tokens: {
      accessToken: tokens.accessToken,
      ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      ...(clientId ? { clientId } : {}),
      ...(tokens.expiresAt ? { expiresAt: tokens.expiresAt } : {}),
      ...(tokens.tokenType ? { tokenType: tokens.tokenType } : {}),
    },
  });

  await updateClaudeConfigAtomic((config) => {
    // Get existing server config to preserve existing headers and determine type
    const existingConfig = getMcpServerConfig(config, projectPath, serverName) || {};
    const serverUrl = existingConfig.url as string | undefined;

    // Determine transport type from URL (SDK expects explicit type for HTTP servers)
    const serverType = serverUrl?.endsWith('/sse') ? 'sse' : 'http';

    // Preserve non-auth headers but never write bearer tokens into Claude config.
    const existingHeaders = (existingConfig.headers as Record<string, string>) || {};
    const headers = removeAuthorizationHeader(existingHeaders);

    return updateMcpServerConfig(config, projectPath, serverName, {
      // SDK-required fields
      type: serverType,
      authType: 'oauth',
      headers,
      // Internal tracking (for token refresh, status checking)
      _oauth: oauthMetadata({
        tokens: {
          clientId,
          expiresAt: tokens.expiresAt,
          tokenType: tokens.tokenType,
        },
        fallback: existingConfig._oauth as McpOAuthConfig | undefined,
      }),
    });
  });
}

export function cancelAllPendingOAuth(): void {
  for (const [state, pending] of pendingOAuthFlows) {
    clearTimeout(pending.timeoutId);
    pending.resolve({ success: false, error: 'Cancelled' });
  }
  pendingOAuthFlows.clear();
}

/**
 * Fetch OAuth metadata for MCP server if available
 * Returns metadata if server supports OAuth, undefined otherwise
 */
export async function fetchMcpOAuthMetadata(
  serverName: string,
  projectPath: string
): Promise<OAuthMetadata | undefined> {
  try {
    const config = await readClaudeConfig();
    const serverConfig = getMcpServerConfig(config, projectPath, serverName);

    if (!serverConfig?.url) {
      return undefined;
    }

    const baseUrl = getMcpBaseUrl(serverConfig.url);
    assertOfficialCloudAllowed('fetch MCP OAuth metadata', baseUrl);
    const metadata = await fetchOAuthMetadata(baseUrl);
    return metadata ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get auth status for MCP server
 */
export async function getMcpAuthStatus(
  serverName: string,
  projectPath: string
): Promise<{ hasTokens: boolean; isExpired?: boolean }> {
  try {
    const config = await readClaudeConfig();
    const serverConfig = getMcpServerConfig(config, projectPath, serverName);
    const tokens = await resolveMcpOAuthTokens({
      serverName,
      projectPath,
      serverConfig,
    });

    if (!tokens?.accessToken) return { hasTokens: false };

    const isExpired = tokens.expiresAt ? Date.now() > tokens.expiresAt : false;
    return { hasTokens: true, isExpired };
  } catch {
    return { hasTokens: false };
  }
}
