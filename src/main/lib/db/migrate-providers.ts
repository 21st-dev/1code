import { eq } from "drizzle-orm"
import { getDatabase, claudeCodeCredentials, aiProviders } from "./index"

/**
 * Migrate existing claudeCodeCredentials to ai_providers table
 * Run once on app startup if ai_providers is empty but claudeCodeCredentials has data
 */
export async function migrateToProviders() {
  const db = getDatabase()

  // Check if migration is needed
  const existingProviders = db.select().from(aiProviders).all()
  if (existingProviders.length > 0) {
    console.log("[Migration] Providers already exist, skipping migration")
    return
  }

  const oldCredential = db
    .select()
    .from(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, "default"))
    .get()

  if (!oldCredential?.oauthToken) {
    console.log("[Migration] No existing credentials found")
    return
  }

  console.log("[Migration] Migrating existing OAuth credential to providers table")

  // Create new provider record with migrated data
  db.insert(aiProviders)
    .values({
      id: crypto.randomUUID(),
      name: "Default OAuth Anthropic",
      model: "claude-sonnet-4-5-20251101",
      providerType: "oauth",
      oauthToken: oldCredential.oauthToken,
      isActive: true,
      createdAt: oldCredential.connectedAt || new Date(),
      updatedAt: new Date(),
      userId: oldCredential.userId,
    })
    .run()

  console.log("[Migration] Successfully migrated to providers table")
}
