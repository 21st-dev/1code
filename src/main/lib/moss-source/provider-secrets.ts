import * as fs from "fs/promises"
import * as path from "path"
import { app, safeStorage } from "electron"

interface MossProviderSecretEntry {
  apiKey?: string
  updatedAt: string
}

interface MossProviderSecretStore {
  version: 1
  providers: Record<string, MossProviderSecretEntry>
}

const EMPTY_STORE: MossProviderSecretStore = {
  version: 1,
  providers: {},
}

function getStorePath(): string {
  return path.join(app.getPath("userData"), "moss-provider-secrets.dat")
}

function cloneStore(store: MossProviderSecretStore): MossProviderSecretStore {
  return {
    version: 1,
    providers: { ...store.providers },
  }
}

async function readStore(): Promise<MossProviderSecretStore> {
  const storePath = getStorePath()
  try {
    const encrypted = await fs.readFile(storePath)
    const raw = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(encrypted)
      : encrypted.toString("utf-8")
    const parsed = JSON.parse(raw) as MossProviderSecretStore
    if (!parsed || typeof parsed !== "object" || !parsed.providers) {
      return cloneStore(EMPTY_STORE)
    }
    return {
      version: 1,
      providers: { ...parsed.providers },
    }
  } catch {
    return cloneStore(EMPTY_STORE)
  }
}

async function writeStore(store: MossProviderSecretStore): Promise<void> {
  const storePath = getStorePath()
  await fs.mkdir(path.dirname(storePath), { recursive: true })

  const raw = JSON.stringify(store)
  if (safeStorage.isEncryptionAvailable()) {
    await fs.writeFile(storePath, safeStorage.encryptString(raw))
    return
  }

  console.warn(
    "[moss-provider-secrets] safeStorage unavailable; storing provider secrets without OS encryption.",
  )
  await fs.writeFile(storePath, raw, "utf-8")
}

export async function getMossProviderSecret(providerId: string): Promise<{
  apiKey?: string
}> {
  const store = await readStore()
  const entry = store.providers[providerId]
  return {
    apiKey: entry?.apiKey,
  }
}

export async function hasMossProviderSecret(providerId: string): Promise<boolean> {
  const secret = await getMossProviderSecret(providerId)
  return Boolean(secret.apiKey)
}

export async function setMossProviderSecret(params: {
  providerId: string
  apiKey?: string | null
}): Promise<void> {
  const store = await readStore()
  const existing = store.providers[params.providerId] ?? {
    updatedAt: new Date().toISOString(),
  }
  const trimmedApiKey = params.apiKey?.trim()

  if (!trimmedApiKey) {
    delete existing.apiKey
  } else {
    existing.apiKey = trimmedApiKey
  }

  existing.updatedAt = new Date().toISOString()
  if (existing.apiKey) {
    store.providers[params.providerId] = existing
  } else {
    delete store.providers[params.providerId]
  }

  await writeStore(store)
}
