import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { Mutex } from "async-mutex"
import { getElectronUserDataPath } from "./electron-app"
import {
  decryptStringFromStorage,
  encryptStringForStorage,
} from "./secure-storage"

const MCP_OAUTH_TOKEN_STORE_FILENAME = "mcp-oauth-tokens.json"

type StoredMcpOAuthTokenEntry = {
  serverName: string
  projectPath: string
  encryptedAccessToken: string
  encryptedRefreshToken?: string
  clientId?: string
  expiresAt?: number
  tokenType?: string
  updatedAt: string
}

type StoredMcpOAuthTokenPayload = {
  version: 1
  entries: Record<string, StoredMcpOAuthTokenEntry>
}

export type McpOAuthTokensForStorage = {
  accessToken: string
  refreshToken?: string
  clientId?: string
  expiresAt?: number
  tokenType?: string
}

type McpOAuthTokenStoreOptions = {
  userDataPath?: string
  getUserDataPath?: () => string
}

const storeMutex = new Mutex()

export function getMcpOAuthTokenStorePath(
  options: McpOAuthTokenStoreOptions = {},
): string {
  const userDataPath =
    options.userDataPath ??
    options.getUserDataPath?.() ??
    getElectronUserDataPath()
  return join(userDataPath, MCP_OAUTH_TOKEN_STORE_FILENAME)
}

function getTokenEntryKey(input: {
  serverName: string
  projectPath: string
}): string {
  return createHash("sha256")
    .update(`${input.projectPath}\0${input.serverName}`)
    .digest("hex")
}

function readPayload(
  options: McpOAuthTokenStoreOptions = {},
): StoredMcpOAuthTokenPayload {
  const storePath = getMcpOAuthTokenStorePath(options)
  if (!existsSync(storePath)) {
    return { version: 1, entries: {} }
  }

  try {
    const raw = JSON.parse(
      readFileSync(storePath, "utf-8"),
    ) as Partial<StoredMcpOAuthTokenPayload>
    if (
      raw.version !== 1 ||
      typeof raw.entries !== "object" ||
      raw.entries === null ||
      Array.isArray(raw.entries)
    ) {
      return { version: 1, entries: {} }
    }
    return raw as StoredMcpOAuthTokenPayload
  } catch {
    return { version: 1, entries: {} }
  }
}

function writePayload(
  payload: StoredMcpOAuthTokenPayload,
  options: McpOAuthTokenStoreOptions = {},
): void {
  const storePath = getMcpOAuthTokenStorePath(options)
  mkdirSync(dirname(storePath), { recursive: true })
  writeFileSync(storePath, JSON.stringify(payload, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  })
  chmodSync(storePath, 0o600)
}

export async function saveMcpOAuthTokens(input: {
  serverName: string
  projectPath: string
  tokens: McpOAuthTokensForStorage
  options?: McpOAuthTokenStoreOptions
}): Promise<void> {
  await storeMutex.runExclusive(async () => {
    const payload = readPayload(input.options)
    const key = getTokenEntryKey(input)
    payload.entries[key] = {
      serverName: input.serverName,
      projectPath: input.projectPath,
      encryptedAccessToken: encryptStringForStorage(input.tokens.accessToken),
      ...(input.tokens.refreshToken
        ? {
            encryptedRefreshToken: encryptStringForStorage(
              input.tokens.refreshToken,
            ),
          }
        : {}),
      ...(input.tokens.clientId ? { clientId: input.tokens.clientId } : {}),
      ...(input.tokens.expiresAt ? { expiresAt: input.tokens.expiresAt } : {}),
      ...(input.tokens.tokenType ? { tokenType: input.tokens.tokenType } : {}),
      updatedAt: new Date().toISOString(),
    }
    writePayload(payload, input.options)
  })
}

export function readMcpOAuthTokens(input: {
  serverName: string
  projectPath: string
  options?: McpOAuthTokenStoreOptions
}): McpOAuthTokensForStorage | null {
  const entry = readPayload(input.options).entries[getTokenEntryKey(input)]
  if (!entry?.encryptedAccessToken) return null

  const accessToken = decryptStringFromStorage(entry.encryptedAccessToken)
  if (!accessToken) return null

  const refreshToken = entry.encryptedRefreshToken
    ? decryptStringFromStorage(entry.encryptedRefreshToken)
    : null

  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(entry.clientId ? { clientId: entry.clientId } : {}),
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    ...(entry.tokenType ? { tokenType: entry.tokenType } : {}),
  }
}

export async function removeMcpOAuthTokens(input: {
  serverName: string
  projectPath: string
  options?: McpOAuthTokenStoreOptions
}): Promise<void> {
  await storeMutex.runExclusive(async () => {
    const payload = readPayload(input.options)
    delete payload.entries[getTokenEntryKey(input)]
    writePayload(payload, input.options)
  })
}

export async function clearMcpOAuthTokenStore(
  options: McpOAuthTokenStoreOptions = {},
): Promise<void> {
  await storeMutex.runExclusive(async () => {
    const storePath = getMcpOAuthTokenStorePath(options)
    if (existsSync(storePath)) {
      unlinkSync(storePath)
    }
  })
}
