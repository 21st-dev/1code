import { z } from "zod"
import { eq } from "drizzle-orm"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { publicProcedure, router } from "../index"
import { anthropicAuthSettings, getDatabase } from "../../db"

export const anthropicAuthRouter = router({
  // Get current authentication settings
  getSettings: publicProcedure.query(async () => {
    const db = getDatabase()
    let settings = db
      .select()
      .from(anthropicAuthSettings)
      .where(eq(anthropicAuthSettings.id, "singleton"))
      .get()

    // Initialize with defaults if not exists
    if (!settings) {
      db.insert(anthropicAuthSettings)
        .values({
          id: "singleton",
          authMode: "oauth",
          awsRegion: "us-east-1",
        })
        .run()

      settings = db
        .select()
        .from(anthropicAuthSettings)
        .where(eq(anthropicAuthSettings.id, "singleton"))
        .get()
    }

    return settings
  }),

  // Update authentication mode and AWS settings
  updateSettings: publicProcedure
    .input(
      z.object({
        authMode: z.enum(["oauth", "bedrock"]),
        awsRegion: z.string().optional(),
        awsProfile: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Upsert settings
      const existing = db
        .select()
        .from(anthropicAuthSettings)
        .where(eq(anthropicAuthSettings.id, "singleton"))
        .get()

      if (existing) {
        db.update(anthropicAuthSettings)
          .set({
            authMode: input.authMode,
            awsRegion: input.awsRegion,
            awsProfile: input.awsProfile,
            updatedAt: new Date(),
          })
          .where(eq(anthropicAuthSettings.id, "singleton"))
          .run()
      } else {
        db.insert(anthropicAuthSettings)
          .values({
            id: "singleton",
            authMode: input.authMode,
            awsRegion: input.awsRegion || "us-east-1",
            awsProfile: input.awsProfile,
          })
          .run()
      }

      console.log(`[anthropic-auth] Auth mode changed to: ${input.authMode}`)

      return db
        .select()
        .from(anthropicAuthSettings)
        .where(eq(anthropicAuthSettings.id, "singleton"))
        .get()
    }),

  // Validate AWS credentials are available in environment
  validateAwsCredentials: publicProcedure.query(async () => {
    // Check if AWS credentials are available in environment
    const hasEnvCredentials = !!(
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    )

    const hasProfile = !!process.env.AWS_PROFILE

    const awsConfigFile =
      process.env.AWS_CONFIG_FILE || path.join(os.homedir(), ".aws", "config")
    const awsCredentialsFile =
      process.env.AWS_SHARED_CREDENTIALS_FILE ||
      path.join(os.homedir(), ".aws", "credentials")

    const hasConfigFile = fs.existsSync(awsConfigFile)
    const hasCredentialsFile = fs.existsSync(awsCredentialsFile)

    const hasAwsCredentials =
      hasEnvCredentials ||
      hasProfile ||
      (hasConfigFile && hasCredentialsFile)

    return {
      hasAwsCredentials,
      hasEnvCredentials,
      hasProfile,
      hasConfigFile,
      hasCredentialsFile,
      awsProfile: process.env.AWS_PROFILE || "default",
      awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null,
      awsConfigPath: awsConfigFile,
      awsCredentialsPath: awsCredentialsFile,
    }
  }),
})
