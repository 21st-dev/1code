import snowflake from "snowflake-sdk"

export interface SnowflakeConfig {
  account: string // e.g., "xy12345.us-east-1"
  username: string
  password: string
  role?: string // e.g., "ACCOUNTADMIN", "SYSADMIN", "PUBLIC"
  warehouse?: string
  database?: string
  schema?: string
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
}

export interface TableInfo {
  name: string
  type: string // "BASE TABLE" | "VIEW"
  rowCount?: number
}

export interface ViewInfo {
  name: string
  isSecure: boolean
  isMaterialized: boolean
}

export interface ProcedureInfo {
  name: string
  arguments: string
  returnType: string
}

export interface FunctionInfo {
  name: string
  arguments: string
  returnType: string
}

export interface SequenceInfo {
  name: string
}

export interface StageInfo {
  name: string
  type: string // "INTERNAL" | "EXTERNAL"
}

export interface TaskInfo {
  name: string
  state: string // "started" | "suspended"
  schedule: string
}

export interface DynamicTableInfo {
  name: string
  targetLag: string
}

export interface FileFormatInfo {
  name: string
  type: string // "CSV" | "JSON" | "PARQUET" etc.
}

export type SchemaObjectType = "tables" | "views" | "procedures" | "functions" | "sequences" | "stages" | "tasks" | "dynamicTables" | "fileFormats"

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue?: string
  comment?: string
}

export class SnowflakeConnection {
  private connection: snowflake.Connection | null = null
  private config: SnowflakeConfig | null = null

  /**
   * Connect to Snowflake with the provided configuration
   */
  async connect(config: SnowflakeConfig): Promise<void> {
    this.config = config

    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection({
        account: config.account,
        username: config.username,
        password: config.password,
        role: config.role,
        warehouse: config.warehouse,
        database: config.database,
        schema: config.schema,
      })

      this.connection.connect((err) => {
        if (err) {
          console.error("[Snowflake] Connection failed:", err.message)
          this.connection = null
          reject(new Error(`Failed to connect: ${err.message}`))
        } else {
          console.log("[Snowflake] Connected successfully")
          resolve()
        }
      })
    })
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connection !== null && this.connection.isUp()
  }

  /**
   * Execute a SQL query and return results
   */
  async execute(sql: string): Promise<QueryResult> {
    if (!this.connection || !this.isConnected()) {
      throw new Error("Not connected to Snowflake")
    }

    return new Promise((resolve, reject) => {
      this.connection!.execute({
        sqlText: sql,
        complete: (err, stmt, rows) => {
          if (err) {
            console.error("[Snowflake] Query failed:", err.message)
            reject(new Error(`Query failed: ${err.message}`))
            return
          }

          const columns = stmt.getColumns().map((col) => col.getName())
          const typedRows = (rows || []) as Record<string, unknown>[]

          resolve({
            columns,
            rows: typedRows,
            rowCount: typedRows.length,
          })
        },
      })
    })
  }

  /**
   * Get list of all databases
   */
  async getDatabases(): Promise<string[]> {
    const result = await this.execute("SHOW DATABASES")
    return result.rows.map((row) => row.name as string)
  }

  /**
   * Get list of schemas in a database
   */
  async getSchemas(database: string): Promise<string[]> {
    const result = await this.execute(`SHOW SCHEMAS IN DATABASE "${database}"`)
    return result.rows.map((row) => row.name as string)
  }

  /**
   * Get list of tables in a schema
   */
  async getTables(database: string, schema: string): Promise<TableInfo[]> {
    const result = await this.execute(
      `SHOW TABLES IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      type: (row.kind as string) || "BASE TABLE",
      rowCount: row.rows as number | undefined,
    }))
  }

  /**
   * Get columns for a table or view
   */
  async getColumns(
    database: string,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]> {
    const result = await this.execute(
      `DESCRIBE TABLE "${database}"."${schema}"."${table}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      type: row.type as string,
      nullable: (row.null as string) === "Y",
      defaultValue: row.default as string | undefined,
      comment: row.comment as string | undefined,
    }))
  }

  /**
   * Get views in a schema
   */
  async getViews(database: string, schema: string): Promise<ViewInfo[]> {
    const result = await this.execute(
      `SHOW VIEWS IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      isSecure: (row.is_secure as string) === "true",
      isMaterialized: (row.is_materialized as string) === "true",
    }))
  }

  /**
   * Get user-defined stored procedures in a schema
   */
  async getProcedures(database: string, schema: string): Promise<ProcedureInfo[]> {
    const result = await this.execute(
      `SHOW USER PROCEDURES IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      arguments: row.arguments as string || "",
      returnType: row.returns as string || "",
    }))
  }

  /**
   * Get user-defined functions in a schema
   */
  async getFunctions(database: string, schema: string): Promise<FunctionInfo[]> {
    const result = await this.execute(
      `SHOW USER FUNCTIONS IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      arguments: row.arguments as string || "",
      returnType: row.returns as string || "",
    }))
  }

  /**
   * Get sequences in a schema
   */
  async getSequences(database: string, schema: string): Promise<SequenceInfo[]> {
    const result = await this.execute(
      `SHOW SEQUENCES IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
    }))
  }

  /**
   * Get stages in a schema
   */
  async getStages(database: string, schema: string): Promise<StageInfo[]> {
    const result = await this.execute(
      `SHOW STAGES IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      type: row.type as string || "INTERNAL",
    }))
  }

  /**
   * Get tasks in a schema
   */
  async getTasks(database: string, schema: string): Promise<TaskInfo[]> {
    const result = await this.execute(
      `SHOW TASKS IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      state: row.state as string || "suspended",
      schedule: row.schedule as string || "",
    }))
  }

  /**
   * Get dynamic tables in a schema
   */
  async getDynamicTables(database: string, schema: string): Promise<DynamicTableInfo[]> {
    const result = await this.execute(
      `SHOW DYNAMIC TABLES IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      targetLag: row.target_lag as string || "",
    }))
  }

  /**
   * Get file formats in a schema
   */
  async getFileFormats(database: string, schema: string): Promise<FileFormatInfo[]> {
    const result = await this.execute(
      `SHOW FILE FORMATS IN "${database}"."${schema}"`
    )
    return result.rows.map((row) => ({
      name: row.name as string,
      type: row.type as string || "CSV",
    }))
  }

  /**
   * Disconnect from Snowflake
   */
  async disconnect(): Promise<void> {
    if (!this.connection) {
      return
    }

    return new Promise((resolve, reject) => {
      this.connection!.destroy((err) => {
        if (err) {
          console.error("[Snowflake] Disconnect failed:", err.message)
          reject(new Error(`Failed to disconnect: ${err.message}`))
        } else {
          console.log("[Snowflake] Disconnected")
          this.connection = null
          this.config = null
          resolve()
        }
      })
    })
  }

  /**
   * Get current connection config (without password)
   */
  getConfig(): Omit<SnowflakeConfig, "password"> | null {
    if (!this.config) return null
    const { password, ...safeConfig } = this.config
    return safeConfig
  }
}

// Singleton instance
let connectionInstance: SnowflakeConnection | null = null

export function getSnowflakeConnection(): SnowflakeConnection {
  if (!connectionInstance) {
    connectionInstance = new SnowflakeConnection()
  }
  return connectionInstance
}
