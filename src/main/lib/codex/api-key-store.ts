import { app } from "electron"
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

function getStorePath(): string {
  return join(app.getPath("userData"), CODEX_API_KEY_STORE_FILENAME)
}

function readPayload(): StoredCodexApiKeyPayload | null {
  const path = getStorePath()
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

export function getCodexApiKeyStatus(): CodexApiKeyStatus {
  const payload = readPayload()
  return {
    hasApiKey: Boolean(payload?.encryptedApiKey),
    encryptionAvailable: isSecureStorageAvailable(),
    updatedAt: payload?.updatedAt ?? null,
  }
}

export function saveCodexApiKey(apiKey: string): CodexApiKeyStatus {
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
  const path = getStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(payload), { encoding: "utf-8", mode: 0o600 })
  chmodSync(path, 0o600)

  return getCodexApiKeyStatus()
}

export function readCodexApiKey(): string | null {
  const payload = readPayload()
  if (!payload?.encryptedApiKey) return null

  const decrypted = decryptStringFromStorage(payload.encryptedApiKey)
  if (!decrypted) return null

  return normalizeCodexApiKey(decrypted)
}

export function removeCodexApiKey(): CodexApiKeyStatus {
  const path = getStorePath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
  return getCodexApiKeyStatus()
}
