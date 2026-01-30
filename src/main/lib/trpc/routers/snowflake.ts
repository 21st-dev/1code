import { z } from "zod"
import { app } from "electron"
import { router, publicProcedure } from ".."
import {
  getSnowflakeConnection,
  getSnowflakeCredentialStore,
  type SnowflakeConfig,
} from "../../snowflake"

// Schema for Snowflake connection configuration
const connectionConfigSchema = z.object({
  account: z.string().min(1, "Account is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  role: z.string().optional(), // e.g., "ACCOUNTADMIN", "SYSADMIN", "PUBLIC"
  warehouse: z.string().optional(),
  database: z.string().optional(),
  schema: z.string().optional(),
  name: z.string().optional(), // User-friendly connection name
})

/**
 * Snowflake tRPC Router
 * Handles connection management, schema introspection, and query execution
 */
export const snowflakeRouter = router({
  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Save and connect to Snowflake
   */
  saveConnection: publicProcedure
    .input(connectionConfigSchema)
    .mutation(async ({ input }) => {
      const connection = getSnowflakeConnection()
      const credentialStore = getSnowflakeCredentialStore(app.getPath("userData"))

      try {
        // Disconnect existing connection if any
        if (connection.isConnected()) {
          await connection.disconnect()
        }

        // Try to connect with new credentials
        const config: SnowflakeConfig = {
          account: input.account,
          username: input.username,
          password: input.password,
          role: input.role,
          warehouse: input.warehouse,
          database: input.database,
          schema: input.schema,
        }

        await connection.connect(config)

        // Save credentials on successful connection
        credentialStore.save({
          config,
          name: input.name || `${input.account}/${input.username}`,
          createdAt: new Date().toISOString(),
        })

        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection failed"
        return { success: false, error: message }
      }
    }),

  /**
   * Get saved connection info (without password)
   */
  getConnection: publicProcedure.query(() => {
    const connection = getSnowflakeConnection()
    const credentialStore = getSnowflakeCredentialStore(app.getPath("userData"))

    const stored = credentialStore.load()
    if (!stored) {
      return null
    }

    // Don't return password
    const { password, ...safeConfig } = stored.config

    return {
      ...safeConfig,
      name: stored.name,
      createdAt: stored.createdAt,
      lastUsedAt: stored.lastUsedAt,
      isConnected: connection.isConnected(),
    }
  }),

  /**
   * Test connection with current saved credentials
   */
  testConnection: publicProcedure.mutation(async () => {
    const connection = getSnowflakeConnection()
    const credentialStore = getSnowflakeCredentialStore(app.getPath("userData"))

    const stored = credentialStore.load()
    if (!stored) {
      return { success: false, error: "No saved connection" }
    }

    try {
      // Disconnect if already connected
      if (connection.isConnected()) {
        await connection.disconnect()
      }

      await connection.connect(stored.config)
      credentialStore.updateLastUsed()

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed"
      return { success: false, error: message }
    }
  }),

  /**
   * Disconnect from Snowflake
   */
  disconnect: publicProcedure.mutation(async () => {
    const connection = getSnowflakeConnection()

    try {
      if (connection.isConnected()) {
        await connection.disconnect()
      }
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Disconnect failed"
      return { success: false, error: message }
    }
  }),

  /**
   * Delete saved connection and disconnect
   */
  deleteConnection: publicProcedure.mutation(async () => {
    const connection = getSnowflakeConnection()
    const credentialStore = getSnowflakeCredentialStore(app.getPath("userData"))

    try {
      if (connection.isConnected()) {
        await connection.disconnect()
      }
      credentialStore.clear()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed"
      return { success: false, error: message }
    }
  }),

  /**
   * Get current connection status
   */
  getStatus: publicProcedure.query(() => {
    const connection = getSnowflakeConnection()
    const credentialStore = getSnowflakeCredentialStore(app.getPath("userData"))

    return {
      hasCredentials: credentialStore.hasCredentials(),
      isConnected: connection.isConnected(),
    }
  }),

  // ============================================================================
  // Schema Introspection
  // ============================================================================

  /**
   * Get list of databases
   */
  getDatabases: publicProcedure.query(async () => {
    const connection = getSnowflakeConnection()

    if (!connection.isConnected()) {
      throw new Error("Not connected to Snowflake")
    }

    return connection.getDatabases()
  }),

  /**
   * Get schemas in a database
   */
  getSchemas: publicProcedure
    .input(z.object({ database: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getSchemas(input.database)
    }),

  /**
   * Get tables in a schema
   */
  getTables: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getTables(input.database, input.schema)
    }),

  /**
   * Get columns in a table or view
   */
  getColumns: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string(), table: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getColumns(input.database, input.schema, input.table)
    }),

  /**
   * Get views in a schema
   */
  getViews: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getViews(input.database, input.schema)
    }),

  /**
   * Get procedures in a schema
   */
  getProcedures: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getProcedures(input.database, input.schema)
    }),

  /**
   * Get functions in a schema
   */
  getFunctions: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getFunctions(input.database, input.schema)
    }),

  /**
   * Get sequences in a schema
   */
  getSequences: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getSequences(input.database, input.schema)
    }),

  /**
   * Get stages in a schema
   */
  getStages: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getStages(input.database, input.schema)
    }),

  /**
   * Get tasks in a schema
   */
  getTasks: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getTasks(input.database, input.schema)
    }),

  /**
   * Get dynamic tables in a schema
   */
  getDynamicTables: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getDynamicTables(input.database, input.schema)
    }),

  /**
   * Get file formats in a schema
   */
  getFileFormats: publicProcedure
    .input(z.object({ database: z.string(), schema: z.string() }))
    .query(async ({ input }) => {
      const connection = getSnowflakeConnection()

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      return connection.getFileFormats(input.database, input.schema)
    }),

  // ============================================================================
  // Query Execution
  // ============================================================================

  /**
   * Execute a SQL query
   */
  execute: publicProcedure
    .input(z.object({ sql: z.string().min(1, "SQL query is required") }))
    .mutation(async ({ input }) => {
      const connection = getSnowflakeConnection()
      const credentialStore = getSnowflakeCredentialStore(app.getPath("userData"))

      if (!connection.isConnected()) {
        throw new Error("Not connected to Snowflake")
      }

      try {
        const result = await connection.execute(input.sql)
        credentialStore.updateLastUsed()
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : "Query execution failed"
        throw new Error(message)
      }
    }),
})
