import { defineConfig } from "drizzle-kit"
import { homedir } from "os"
import { join } from "path"

// Dev database path (matches Electron's userData for dev mode)
const devDbPath = join(homedir(), "Library/Application Support/Agents Dev/data/agents.db")

export default defineConfig({
  schema: "./src/main/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: devDbPath,
  },
})
