import { Database } from "bun:sqlite"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "../src/main/lib/db/schema"
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
} from "../src/main/lib/db/schema"

const testSafeStorage = {
  isEncryptionAvailable() {
    return true
  },
  encryptString(value: string) {
    return Buffer.from(`encrypted:${value}`, "utf-8")
  },
  decryptString(value: Buffer) {
    return value.toString("utf-8").replace(/^encrypted:/, "")
  },
}

mock.module("electron", () => ({
  app: {
    getPath() {
      return "/tmp/locus-test-user-data"
    },
  },
  safeStorage: testSafeStorage,
}))

const {
  createClaudeCodeCredentialEnvelope,
  disconnectActiveClaudeCodeAccount,
  decryptClaudeCodeCredential,
  getClaudeCodeCredentialMetadata,
  removeClaudeCodeAccount,
  reconcileClaudeCodeCredentialStorage,
} = await import("../src/main/lib/claude-credentials")
const {
  encryptStringForStorage,
  setElectronSafeStorageForTest,
  setSecureStorageMacKeychainPreflightForTest,
} = await import("../src/main/lib/secure-storage")

type CredentialDb = NonNullable<Parameters<typeof removeClaudeCodeAccount>[1]>

function createCredentialTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec(`
    CREATE TABLE claude_code_credentials (
      id text PRIMARY KEY NOT NULL,
      oauth_token text NOT NULL,
      connected_at integer,
      user_id text
    );
    CREATE TABLE anthropic_accounts (
      id text PRIMARY KEY NOT NULL,
      email text,
      display_name text,
      oauth_token text NOT NULL,
      connected_at integer,
      last_used_at integer,
      desktop_user_id text
    );
    CREATE TABLE anthropic_settings (
      id text PRIMARY KEY NOT NULL,
      active_account_id text,
      updated_at integer
    );
  `)
  return drizzle(sqlite, { schema })
}

function seedAccount(
  db: ReturnType<typeof createCredentialTestDb>,
  input: { id: string; token: string; connectedAt: Date },
) {
  db.insert(anthropicAccounts)
    .values({
      id: input.id,
      displayName: input.id,
      oauthToken: input.token,
      connectedAt: input.connectedAt,
    })
    .run()
}

function encryptedCredential(accessToken: string, expiresAt?: number) {
  return encryptStringForStorage(
    JSON.stringify(
      createClaudeCodeCredentialEnvelope({ accessToken, expiresAt }, "legacy_db"),
    ),
  )
}

describe("Claude Code account deletion storage reconciliation", () => {
  let db: ReturnType<typeof createCredentialTestDb>

  beforeEach(() => {
    setSecureStorageMacKeychainPreflightForTest(true)
    setElectronSafeStorageForTest(testSafeStorage)
    db = createCredentialTestDb()
  })

  afterEach(() => {
    setSecureStorageMacKeychainPreflightForTest(null)
    setElectronSafeStorageForTest(null)
  })

  const credentialDb = () => db as unknown as CredentialDb

  test("removing the last new account clears legacy fallback storage", () => {
    seedAccount(db, {
      id: "account-1",
      token: "new-token",
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    db.insert(anthropicSettings)
      .values({ id: "singleton", activeAccountId: "account-1" })
      .run()
    db.insert(claudeCodeCredentials)
      .values({ id: "default", oauthToken: "stale-token" })
      .run()

    removeClaudeCodeAccount("account-1", credentialDb())

    expect(db.select().from(anthropicAccounts).all()).toEqual([])
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
    expect(
      db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get()?.activeAccountId,
    ).toBeNull()
  })

  test("removing the legacy fallback account clears old storage", () => {
    db.insert(claudeCodeCredentials)
      .values({ id: "default", oauthToken: "legacy-token" })
      .run()

    removeClaudeCodeAccount("legacy-default", credentialDb())

    expect(db.select().from(anthropicAccounts).all()).toEqual([])
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
    expect(db.select().from(anthropicSettings).all()).toEqual([])
  })

  test("removing the active account selects the next account without mirroring legacy storage", () => {
    seedAccount(db, {
      id: "account-1",
      token: "deleted-token",
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    seedAccount(db, {
      id: "account-2",
      token: "remaining-token",
      connectedAt: new Date("2026-06-02T00:00:00.000Z"),
    })
    db.insert(anthropicSettings)
      .values({ id: "singleton", activeAccountId: "account-1" })
      .run()
    db.insert(claudeCodeCredentials)
      .values({ id: "default", oauthToken: "deleted-token" })
      .run()

    removeClaudeCodeAccount("account-1", credentialDb())

    expect(
      db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get()?.activeAccountId,
    ).toBe("account-2")
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
  })

  test("disconnect removes active account and clears legacy when none remain", () => {
    seedAccount(db, {
      id: "account-1",
      token: "new-token",
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    db.insert(anthropicSettings)
      .values({ id: "singleton", activeAccountId: "account-1" })
      .run()
    reconcileClaudeCodeCredentialStorage(credentialDb())

    disconnectActiveClaudeCodeAccount(credentialDb())

    expect(db.select().from(anthropicAccounts).all()).toEqual([])
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
    expect(
      db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get()?.activeAccountId,
    ).toBeNull()
  })

  test("reconcile migrates a legacy-only credential once and clears old storage", () => {
    db.insert(claudeCodeCredentials)
      .values({
        id: "default",
        oauthToken: encryptedCredential("legacy-access-token"),
        connectedAt: new Date("2026-06-01T00:00:00.000Z"),
        userId: "desktop-user-1",
      })
      .run()

    const result = reconcileClaudeCodeCredentialStorage(credentialDb())
    const account = db.select().from(anthropicAccounts).get()

    expect(account?.id).toBeTruthy()
    expect(account?.displayName).toBe("Claude Code Legacy Token")
    expect(account?.desktopUserId).toBe("desktop-user-1")
    expect(result.activeAccountId).toBe(account?.id)
    expect(
      db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get()?.activeAccountId,
    ).toBe(account?.id)
    expect(
      decryptClaudeCodeCredential(account?.oauthToken ?? "")?.envelope
        .accessToken,
    ).toBe("legacy-access-token")
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
  })

  test("reconcile clears stale legacy storage when canonical accounts exist", () => {
    seedAccount(db, {
      id: "account-1",
      token: "canonical-token",
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    db.insert(anthropicSettings)
      .values({ id: "singleton", activeAccountId: "account-1" })
      .run()
    db.insert(claudeCodeCredentials)
      .values({ id: "default", oauthToken: "stale-token" })
      .run()

    const result = reconcileClaudeCodeCredentialStorage(credentialDb())

    expect(result.activeAccountId).toBe("account-1")
    expect(db.select().from(anthropicAccounts).all()).toHaveLength(1)
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
  })

  test("reconcile does not create settings when no account or legacy credential exists", () => {
    const result = reconcileClaudeCodeCredentialStorage(credentialDb())

    expect(result.activeAccountId).toBeNull()
    expect(db.select().from(anthropicSettings).all()).toEqual([])
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
  })

  test("reconcile does not bump active settings when active account is already correct", () => {
    const updatedAt = new Date("2026-06-01T00:00:00.000Z")
    seedAccount(db, {
      id: "account-1",
      token: "canonical-token",
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    db.insert(anthropicSettings)
      .values({ id: "singleton", activeAccountId: "account-1", updatedAt })
      .run()

    const result = reconcileClaudeCodeCredentialStorage(credentialDb())

    expect(result.activeAccountId).toBe("account-1")
    expect(
      db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get()?.updatedAt,
    ).toEqual(updatedAt)
  })

  test("credential metadata migrates a legacy-only credential before reporting connection", () => {
    db.insert(claudeCodeCredentials)
      .values({
        id: "default",
        oauthToken: encryptedCredential("legacy-access-token"),
        connectedAt: new Date("2026-06-01T00:00:00.000Z"),
      })
      .run()

    const metadata = getClaudeCodeCredentialMetadata(credentialDb())
    const account = db.select().from(anthropicAccounts).get()

    expect(metadata.isConnected).toBe(true)
    expect(metadata.accountId).toBe(account?.id)
    expect(metadata.displayName).toBe("Claude Code Legacy Token")
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
  })

  test("credential metadata ignores and clears stale legacy storage when canonical account exists", () => {
    seedAccount(db, {
      id: "account-1",
      token: encryptedCredential("canonical-access-token"),
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    db.insert(anthropicSettings)
      .values({ id: "singleton", activeAccountId: "account-1" })
      .run()
    db.insert(claudeCodeCredentials)
      .values({
        id: "default",
        oauthToken: encryptedCredential("stale-legacy-token"),
      })
      .run()

    const metadata = getClaudeCodeCredentialMetadata(credentialDb())

    expect(metadata.isConnected).toBe(true)
    expect(metadata.accountId).toBe("account-1")
    expect(metadata.displayName).toBe("account-1")
    expect(db.select().from(claudeCodeCredentials).all()).toEqual([])
  })

  test("credential metadata distinguishes expired from expiring soon", () => {
    seedAccount(db, {
      id: "account-1",
      token: encryptedCredential("soon-expiring-token", Date.now() + 120_000),
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    db.insert(anthropicSettings)
      .values({ id: "singleton", activeAccountId: "account-1" })
      .run()

    const metadata = getClaudeCodeCredentialMetadata(credentialDb())

    expect(metadata.isExpired).toBe(false)
    expect(metadata.isExpiringSoon).toBe(true)
  })
})
