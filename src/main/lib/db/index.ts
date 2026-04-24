import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { app } from "electron"
import { join } from "path"
import { existsSync, mkdirSync, renameSync } from "fs"
import * as schema from "./schema"

let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqlite: Database.Database | null = null

/**
 * Get the database path in the app's user data directory
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath("userData")
  const dataDir = join(userDataPath, "data")

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  return join(dataDir, "agents.db")
}

/**
 * Get the migrations folder path
 * Handles both development and production (packaged) environments
 */
function getMigrationsPath(): string {
  if (app.isPackaged) {
    // Production: migrations bundled in resources
    return join(process.resourcesPath, "migrations")
  }
  // Development: from out/main -> apps/desktop/drizzle
  return join(__dirname, "../../drizzle")
}

function openConnection(dbPath: string) {
  const conn = new Database(dbPath)
  conn.pragma("journal_mode = WAL")
  // synchronous=NORMAL is safe under WAL and materially reduces fsync load
  // during high-frequency writes (e.g., streaming message persistence).
  conn.pragma("synchronous = NORMAL")
  conn.pragma("foreign_keys = ON")
  return conn
}

/**
 * Initialize the database with Drizzle ORM.
 *
 * If migrations fail (e.g., corrupted DB, downgrade), the broken file is
 * renamed to `agents.db.broken-<timestamp>` and a fresh DB is created so the
 * app remains launchable. The broken file is kept for user/support triage.
 */
export function initDatabase() {
  if (db) {
    return db
  }

  const dbPath = getDatabasePath()
  console.log(`[DB] Initializing database at: ${dbPath}`)

  sqlite = openConnection(dbPath)
  db = drizzle(sqlite, { schema })

  const migrationsPath = getMigrationsPath()
  console.log(`[DB] Running migrations from: ${migrationsPath}`)

  try {
    migrate(db, { migrationsFolder: migrationsPath })
    console.log("[DB] Migrations completed")
  } catch (error) {
    console.error("[DB] Migration error:", error)

    // Recovery: close the connection, quarantine the file, start fresh.
    try {
      sqlite?.close()
    } catch {}
    sqlite = null
    db = null

    const brokenPath = `${dbPath}.broken-${Date.now()}`
    try {
      renameSync(dbPath, brokenPath)
      console.warn(`[DB] Quarantined broken DB to: ${brokenPath}`)
    } catch (renameErr) {
      console.error("[DB] Could not rename broken DB:", renameErr)
      throw error
    }

    sqlite = openConnection(dbPath)
    db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder: migrationsPath })
    console.log("[DB] Recovery complete: fresh DB initialized")
  }

  return db
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase()
  }
  return db
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
    console.log("[DB] Database connection closed")
  }
}

// Re-export schema for convenience
export * from "./schema"
