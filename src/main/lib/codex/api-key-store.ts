import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { normalizeCodexApiKey } from "../../../shared/codex-api-key"
import {
  decryptStringFromStorage,
  encryptStringForStorage,
  isSecureStorageAvailable,
} from "../secure-storage"
import { getElectronUserDataPath } from "../electron-app"

type StoredCodexApiKeyPayload = {
  version: 1
  encryptedApiKey: string
  updatedAt: string
}

export type CodexApiKeyStatus = {
  hasApiKey: boolean
  encryptionAvailable: boolean
  updatedAt: string | null
}

const CODEX_API_KEY_STORE_FILENAME = "codex-api-key.json"

type CodexApiKeyStoreOptions = {
  userDataPath?: string
  getUserDataPath?: () => string
}

function getStorePath(options: CodexApiKeyStoreOptions = {}): string {
  const userDataPath =
    options.userDataPath ??
    options.getUserDataPath?.() ??
    getElectronUserDataPath()
  return join(userDataPath, CODEX_API_KEY_STORE_FILENAME)
}

function readPayload(
  options: CodexApiKeyStoreOptions = {},
): StoredCodexApiKeyPayload | null {
  const path = getStorePath(options)
  if (!existsSync(path)) return null

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<StoredCodexApiKeyPayload>
    if (
      raw.version !== 1 ||
      typeof raw.encryptedApiKey !== "string" ||
      typeof raw.updatedAt !== "string"
    ) {
      return null
    }
    return raw as StoredCodexApiKeyPayload
  } catch {
    return null
  }
}

export function getCodexApiKeyStatus(
  options: CodexApiKeyStoreOptions = {},
): CodexApiKeyStatus {
  const payload = readPayload(options)
  return {
    hasApiKey: Boolean(payload?.encryptedApiKey),
    encryptionAvailable: isSecureStorageAvailable(),
    updatedAt: payload?.updatedAt ?? null,
  }
}

export function saveCodexApiKey(
  apiKey: string,
  options: CodexApiKeyStoreOptions = {},
): CodexApiKeyStatus {
  const normalized = normalizeCodexApiKey(apiKey)
  if (!normalized) {
    throw new Error("Invalid Codex API key")
  }

  const encryptedApiKey = encryptStringForStorage(normalized)
  const payload: StoredCodexApiKeyPayload = {
    version: 1,
    encryptedApiKey,
    updatedAt: new Date().toISOString(),
  }
  const path = getStorePath(options)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(payload), { encoding: "utf-8", mode: 0o600 })
  chmodSync(path, 0o600)

  return getCodexApiKeyStatus(options)
}

export function readCodexApiKey(
  options: CodexApiKeyStoreOptions = {},
): string | null {
  const payload = readPayload(options)
  if (!payload?.encryptedApiKey) return null

  const decrypted = decryptStringFromStorage(payload.encryptedApiKey)
  if (!decrypted) return null

  return normalizeCodexApiKey(decrypted)
}

export function removeCodexApiKey(
  options: CodexApiKeyStoreOptions = {},
): CodexApiKeyStatus {
  const path = getStorePath(options)
  if (existsSync(path)) {
    unlinkSync(path)
  }
  return getCodexApiKeyStatus(options)
}
