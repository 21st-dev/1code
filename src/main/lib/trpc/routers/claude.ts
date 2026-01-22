import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { app, safeStorage } from "electron"
import path from "path"
import * as os from "os"
import * as fs from "fs/promises"
import { z } from "zod"
import {
  buildClaudeEnv,
  createTransformer,
  getBundledClaudeBinaryPath,
  logClaudeEnv,
  logRawClaudeMessage,
  TextDeltaBuffer,
  type UIMessageChunk,
} from "../../claude"
import { chats, claudeCodeCredentials, claudeCodeSettings, getDatabase, subChats } from "../../db"
import { publicProcedure, router } from "../index"
import { buildAgentsOption } from "./agent-utils"
import { getDevyardConfig } from "../../devyard-config"

/**
 * Parse @[agent:name] and @[skill:name] mentions from prompt text
 * Returns the cleaned prompt and lists of mentioned agents/skills
 */
function parseMentions(prompt: string): {
  cleanedPrompt: string
  agentMentions: string[]
  skillMentions: string[]
  fileMentions: string[]
  folderMentions: string[]
} {
  const agentMentions: string[] = []
  const skillMentions: string[] = []
  const fileMentions: string[] = []
  const folderMentions: string[] = []

  // Match @[prefix:name] pattern
  const mentionRegex = /@\[(file|folder|skill|agent):([^\]]+)\]/g
  let match

  while ((match = mentionRegex.exec(prompt)) !== null) {
    const [, type, name] = match
    switch (type) {
      case "agent":
        agentMentions.push(name)
        break
      case "skill":
        skillMentions.push(name)
        break
      case "file":
        fileMentions.push(name)
        break
      case "folder":
        folderMentions.push(name)
        break
    }
  }

  // Clean agent/skill mentions from prompt (they will be added as context)
  // Keep file/folder mentions as they are useful context
  const cleanedPrompt = prompt
    .replace(/@\[agent:[^\]]+\]/g, "")
    .replace(/@\[skill:[^\]]+\]/g, "")
    .trim()

  return { cleanedPrompt, agentMentions, skillMentions, fileMentions, folderMentions }
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Get Claude Code OAuth token from local SQLite
 * Returns null if not connected
 */
function getClaudeCodeToken(): string | null {
  try {
    const db = getDatabase()
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!cred?.oauthToken) {
      console.log("[claude] No Claude Code credentials found")
      return null
    }

    return decryptToken(cred.oauthToken)
  } catch (error) {
    console.error("[claude] Error getting Claude Code token:", error)
    return null
  }
}

/**
 * Get Claude Code custom settings (binary path, env vars, config dir, MCP settings, auth)
 */
function getClaudeCodeSettings(): {
  customBinaryPath: string | null
  customEnvVars: Record<string, string>
  customConfigDir: string | null
  mcpServerSettings: Record<string, { enabled: boolean }>
  authMode: "oauth" | "aws" | "apiKey" | "devyard"
  apiKey: string | null
  bedrockRegion: string | null
  anthropicBaseUrl: string | null
} {
  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings) {
      return {
        customBinaryPath: null,
        customEnvVars: {},
        customConfigDir: null,
        mcpServerSettings: {},
        authMode: "oauth",
        apiKey: null,
        bedrockRegion: "us-east-1",
        anthropicBaseUrl: null,
      }
    }

    const customEnvVars = settings.customEnvVars
      ? JSON.parse(settings.customEnvVars)
      : {}

    const mcpServerSettings = settings.mcpServerSettings
      ? JSON.parse(settings.mcpServerSettings)
      : {}

    // Decrypt API key if present
    let apiKey: string | null = null
    if (settings.apiKey) {
      try {
        if (!safeStorage.isEncryptionAvailable()) {
          apiKey = Buffer.from(settings.apiKey, "base64").toString("utf-8")
        } else {
          const buffer = Buffer.from(settings.apiKey, "base64")
          apiKey = safeStorage.decryptString(buffer)
        }
      } catch (error) {
        console.error("[claude] Failed to decrypt API key:", error)
      }
    }

    // Determine config directory based on auth mode
    let configDir = settings.customConfigDir
    const authMode = (settings.authMode || "oauth") as "oauth" | "aws" | "apiKey" | "devyard"

    // If Devyard mode is active, use Devyard's Claude plugin directory
    // This is where agents/commands/skills are stored in Devyard
    if (authMode === "devyard" && !configDir) {
      const devyardConfig = getDevyardConfig()
      if (devyardConfig.enabled && devyardConfig.claudePluginDir) {
        configDir = devyardConfig.claudePluginDir
        console.log(`[claude] Using Devyard Claude plugin dir: ${configDir}`)
      }
    }

    return {
      customBinaryPath: settings.customBinaryPath,
      customEnvVars,
      customConfigDir: configDir,
      mcpServerSettings,
      authMode,
      apiKey,
      bedrockRegion: settings.bedrockRegion || "us-east-1",
      anthropicBaseUrl: settings.anthropicBaseUrl || null,
    }
  } catch (error) {
    console.error("[claude] Error getting Claude Code settings:", error)
    return {
      customBinaryPath: null,
      customEnvVars: {},
      customConfigDir: null,
      mcpServerSettings: {},
      authMode: "oauth",
      apiKey: null,
      bedrockRegion: "us-east-1",
      anthropicBaseUrl: null,
    }
  }
}

/**
 * Check if AWS credentials are available
 */
function hasAwsCredentials(): boolean {
  // Check for AWS environment variables
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return true
  }

  // Check for AWS credentials file
  const awsCredsPath = path.join(os.homedir(), ".aws", "credentials")
  try {
    const stats = require("fs").statSync(awsCredsPath)
    return stats.isFile() && stats.size > 0
  } catch {
    return false
  }
}

// Dynamic import for ESM module
const getClaudeQuery = async () => {
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  return sdk.query
}

// Active sessions for cancellation
const activeSessions = new Map<string, AbortController>()
const pendingToolApprovals = new Map<
  string,
  {
    subChatId: string
    resolve: (decision: {
      approved: boolean
      message?: string
      updatedInput?: unknown
    }) => void
  }
>()

const clearPendingApprovals = (message: string, subChatId?: string) => {
  for (const [toolUseId, pending] of pendingToolApprovals) {
    if (subChatId && pending.subChatId !== subChatId) continue
    pending.resolve({ approved: false, message })
    pendingToolApprovals.delete(toolUseId)
  }
}

// Image attachment schema
const imageAttachmentSchema = z.object({
  base64Data: z.string(),
  mediaType: z.string(), // e.g. "image/png", "image/jpeg"
  filename: z.string().optional(),
})

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>

export const claudeRouter = router({
  /**
   * Stream chat with Claude - single subscription handles everything
   */
  chat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        prompt: z.string(),
        cwd: z.string(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        maxThinkingTokens: z.number().optional(), // Enable extended thinking
        images: z.array(imageAttachmentSchema).optional(), // Image attachments
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        const abortController = new AbortController()
        const streamId = crypto.randomUUID()
        activeSessions.set(input.subChatId, abortController)

        // Stream debug logging
        const subId = input.subChatId.slice(-8) // Short ID for logs
        const streamStart = Date.now()
        let chunkCount = 0
        let lastChunkType = ""
        // Shared sessionId for cleanup to save on abort
        let currentSessionId: string | null = null
        console.log(`[SD] M:START sub=${subId} stream=${streamId.slice(-8)} mode=${input.mode}`)

        // Track if observable is still active (not unsubscribed)
        let isObservableActive = true

        // Helper to safely emit (no-op if already unsubscribed)
        const safeEmit = (chunk: UIMessageChunk) => {
          if (!isObservableActive) return false
          try {
            emit.next(chunk)
            return true
          } catch {
            isObservableActive = false
            return false
          }
        }

        // Helper to safely complete (no-op if already closed)
        const safeComplete = () => {
          try {
            emit.complete()
          } catch {
            // Already completed or closed
          }
        }

        // Helper to emit error to frontend
        const emitError = (error: unknown, context: string) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          const errorStack = error instanceof Error ? error.stack : undefined

          console.error(`[claude] ${context}:`, errorMessage)
          if (errorStack) console.error("[claude] Stack:", errorStack)

          // Send detailed error to frontend (safely)
          safeEmit({
            type: "error",
            errorText: `${context}: ${errorMessage}`,
            // Include extra debug info
            ...(process.env.NODE_ENV !== "production" && {
              debugInfo: {
                context,
                cwd: input.cwd,
                mode: input.mode,
                PATH: process.env.PATH?.slice(0, 200),
              },
            }),
          } as UIMessageChunk)
        }

        ;(async () => {
          let retryCount = 0
          let shouldRetry = false

          // State variables shared across retries
          const parts: any[] = []
          let currentText = ""
          let metadata: any = {}
          const stderrLines: string[] = []
          let messageCount = 0
          let lastError: Error | null = null
          let planCompleted = false
          let exitPlanModeToolCallId: string | null = null

          do {
            shouldRetry = false

            // Reset accumulation state on retry
            if (retryCount > 0) {
              parts.length = 0
              currentText = ""
              stderrLines.length = 0
              messageCount = 0
              lastError = null
              planCompleted = false
              exitPlanModeToolCallId = null
              metadata = {}
            }

            try {
              const db = getDatabase()

              // 1. Get existing messages from DB
              const existing = db
                .select()
                .from(subChats)
                .where(eq(subChats.id, input.subChatId))
                .get()
              const existingMessages = JSON.parse(existing?.messages || "[]")
              const existingSessionId = existing?.sessionId || null
              const existingModel = existing?.model || null // Get model from sub_chat

              // Check if last message is already this user message (avoid duplicate)
              const lastMsg = existingMessages[existingMessages.length - 1]
              const isDuplicate =
                lastMsg?.role === "user" &&
                lastMsg?.parts?.[0]?.text === input.prompt

              // 2. Create user message and save BEFORE streaming (skip if duplicate OR if retry)
              let userMessage: any
              let messagesToSave: any[]

              if (retryCount > 0) {
                // Retry: skip user message creation, use existing messages
                messagesToSave = existingMessages
                console.log(`[claude] Retry attempt ${retryCount}: using existing messages, count=${messagesToSave.length}`)
              } else if (isDuplicate) {
                userMessage = lastMsg
                messagesToSave = existingMessages
              } else {
                userMessage = {
                  id: crypto.randomUUID(),
                  role: "user",
                  parts: [{ type: "text", text: input.prompt }],
                }
                messagesToSave = [...existingMessages, userMessage]

                db.update(subChats)
                  .set({
                    messages: JSON.stringify(messagesToSave),
                    streamId,
                    updatedAt: new Date(),
                  })
                  .where(eq(subChats.id, input.subChatId))
                  .run()
              }

            // 3. Get Claude SDK
            let claudeQuery
            try {
              claudeQuery = await getClaudeQuery()
            } catch (sdkError) {
              emitError(sdkError, "Failed to load Claude SDK")
              console.log(`[SD] M:END sub=${subId} reason=sdk_load_error n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            const transform = createTransformer()

            // 4. Accumulation state (declared outside loop, reset on retry above)

            // Parse mentions from prompt (agents, skills, files, folders)
            const { cleanedPrompt, agentMentions, skillMentions } = parseMentions(input.prompt)

            // Build agents option for SDK (proper registration via options.agents)
            const agentsOption = await buildAgentsOption(agentMentions, input.cwd)

            // Log if agents were mentioned
            if (agentMentions.length > 0) {
              console.log(`[claude] Registering agents via SDK:`, Object.keys(agentsOption))
            }

            // Log if skills were mentioned
            if (skillMentions.length > 0) {
              console.log(`[claude] Skills mentioned:`, skillMentions)
            }

            // Build final prompt with skill instructions if needed
            let finalPrompt = cleanedPrompt

            // Handle empty prompt when only mentions are present
            if (!finalPrompt.trim()) {
              if (agentMentions.length > 0 && skillMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) and invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
              } else if (agentMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) for this task.`
              } else if (skillMentions.length > 0) {
                finalPrompt = `Invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
              }
            } else if (skillMentions.length > 0) {
              // Append skill instruction to existing prompt
              finalPrompt = `${finalPrompt}\n\nUse the "${skillMentions.join('", "')}" skill(s) for this task.`
            }

            // Build prompt: if there are images, create an AsyncIterable<SDKUserMessage>
            // Otherwise use simple string prompt
            let prompt: string | AsyncIterable<any> = finalPrompt

            if (input.images && input.images.length > 0) {
              // Create message content array with images first, then text
              const messageContent: any[] = [
                ...input.images.map((img) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: img.mediaType,
                    data: img.base64Data,
                  },
                })),
              ]

              // Add text if present
              if (finalPrompt.trim()) {
                messageContent.push({
                  type: "text" as const,
                  text: finalPrompt,
                })
              }

              // Create an async generator that yields a single SDKUserMessage
              async function* createPromptWithImages() {
                yield {
                  type: "user" as const,
                  message: {
                    role: "user" as const,
                    content: messageContent,
                  },
                  parent_tool_use_id: null,
                }
              }

              prompt = createPromptWithImages()
            }

            // Build full environment for Claude SDK (includes HOME, PATH, etc.)
            const claudeEnv = buildClaudeEnv()

            // Debug logging in dev
            if (process.env.NODE_ENV !== "production") {
              logClaudeEnv(claudeEnv, `[${input.subChatId}] `)
            }

            // Get Claude Code OAuth token from local storage (optional)
            const claudeCodeToken = getClaudeCodeToken()

            // Use custom config dir if provided, otherwise use per-subchat isolated
            // The Claude binary stores sessions in ~/.claude/ based on cwd, which causes
            // cross-chat contamination when multiple chats use the same project folder
            const { customBinaryPath, customEnvVars, customConfigDir, authMode, apiKey, bedrockRegion, anthropicBaseUrl } = getClaudeCodeSettings()

            // Determine Claude config directory based on auth mode
            let claudeConfigDir: string
            if (customConfigDir) {
              // User-specified custom directory takes precedence
              claudeConfigDir = customConfigDir
            } else if (authMode === "devyard") {
              // Devyard mode: use $VIDYARD_PATH/devyard/claude/
              const devyardConfig = getDevyardConfig()
              claudeConfigDir = devyardConfig.claudeConfigDir || path.join(
                app.getPath("userData"),
                "claude-sessions",
                input.subChatId
              )
              console.log(`[claude] Devyard mode: using CLAUDE_CONFIG_DIR=${claudeConfigDir}`)
            } else {
              // Default: isolated per-subchat directory
              claudeConfigDir = path.join(
                app.getPath("userData"),
                "claude-sessions",
                input.subChatId
              )
            }

            // Ensure config dir exists
            await fs.mkdir(claudeConfigDir, { recursive: true })

            // If using isolated dir (not custom or devyard), symlink skills/agents/mcp.json from ~/.claude/
            // This is needed because SDK looks for skills at $CLAUDE_CONFIG_DIR/skills/ and mcp.json for MCP servers
            // Skip symlinking for Devyard mode since it uses the plugin directory directly
            if (!customConfigDir && authMode !== "devyard") {
              const homeClaudeDir = path.join(os.homedir(), ".claude")
              const skillsSource = path.join(homeClaudeDir, "skills")
              const skillsTarget = path.join(claudeConfigDir, "skills")
              const agentsSource = path.join(homeClaudeDir, "agents")
              const agentsTarget = path.join(claudeConfigDir, "agents")
              const mcpConfigSource = path.join(homeClaudeDir, "mcp.json")
              const mcpConfigTarget = path.join(claudeConfigDir, "mcp.json")

              // Symlink skills directory if source exists and target doesn't
              try {
                const skillsSourceExists = await fs.stat(skillsSource).then(() => true).catch(() => false)
                const skillsTargetExists = await fs.lstat(skillsTarget).then(() => true).catch(() => false)
                if (skillsSourceExists && !skillsTargetExists) {
                  await fs.symlink(skillsSource, skillsTarget, "dir")
                  console.log(`[claude] Symlinked skills: ${skillsTarget} -> ${skillsSource}`)
                }
              } catch (symlinkErr) {
                // Ignore symlink errors
              }

              // Symlink agents directory if source exists and target doesn't
              try {
                const agentsSourceExists = await fs.stat(agentsSource).then(() => true).catch(() => false)
                const agentsTargetExists = await fs.lstat(agentsTarget).then(() => true).catch(() => false)
                if (agentsSourceExists && !agentsTargetExists) {
                  await fs.symlink(agentsSource, agentsTarget, "dir")
                  console.log(`[claude] Symlinked agents: ${agentsTarget} -> ${agentsSource}`)
                }
              } catch (symlinkErr) {
                // Ignore symlink errors
              }

              // Symlink mcp.json file if source exists and target doesn't
              try {
                const mcpConfigSourceExists = await fs.stat(mcpConfigSource).then(() => true).catch(() => false)
                const mcpConfigTargetExists = await fs.lstat(mcpConfigTarget).then(() => true).catch(() => false)
                if (mcpConfigSourceExists && !mcpConfigTargetExists) {
                  await fs.symlink(mcpConfigSource, mcpConfigTarget, "file")
                  console.log(`[claude] Symlinked mcp.json: ${mcpConfigTarget} -> ${mcpConfigSource}`)
                }
              } catch (symlinkErr) {
                // Ignore symlink errors
                console.log(`[claude] Could not symlink mcp.json (may not exist): ${symlinkErr}`)
              }
            } else if (authMode === "devyard") {
              console.log(`[claude] Devyard mode active - using ${claudeConfigDir} directly (no symlinks needed)`)
            }

            // Build final env - use appropriate auth method based on mode
            const finalEnv: Record<string, string> = {
              ...claudeEnv,
              ...customEnvVars, // User-configured env vars (e.g., for Claude settings.json)
              // Use custom or isolated Claude config directory
              CLAUDE_CONFIG_DIR: claudeConfigDir,
            }

            // Add authentication based on mode
            if (authMode === "oauth") {
              // OAuth mode: get token from storage
              if (claudeCodeToken) {
                finalEnv.CLAUDE_CODE_OAUTH_TOKEN = claudeCodeToken
              }
            } else if (authMode === "apiKey" && apiKey) {
              // API key mode: use API key directly
              finalEnv.ANTHROPIC_API_KEY = apiKey
              // Set custom base URL if provided
              if (anthropicBaseUrl) {
                finalEnv.ANTHROPIC_BASE_URL = anthropicBaseUrl
                console.log(`[claude] Using custom API base URL: ${anthropicBaseUrl}`)
              }
              console.log("[claude] Using API key authentication mode")
            } else if (authMode === "aws") {
              // AWS mode: ensure AWS SDK can find credentials
              const hasCreds = hasAwsCredentials()
              if (!hasCreds) {
                console.warn("[claude] AWS mode selected but no credentials found in env vars or ~/.aws/credentials")
              }
              // Set AWS region for Bedrock
              finalEnv.AWS_REGION = bedrockRegion || "us-east-1"
              console.log(`[claude] Using AWS Bedrock authentication mode (region: ${finalEnv.AWS_REGION})`)
            }

            // Use custom binary path if provided, otherwise use bundled binary
            const claudeBinaryPath = customBinaryPath || getBundledClaudeBinaryPath()

            // On retry, force fresh session (no resume)
            const resumeSessionId = (retryCount === 0)
              ? (input.sessionId || existingSessionId || undefined)
              : undefined

            if (retryCount > 0) {
              console.log(`[claude] Retry attempt ${retryCount}: forcing fresh session (no resume)`)
            }

            const queryOptions = {
              prompt,
              options: {
                abortController, // Must be inside options!
                cwd: input.cwd,
                systemPrompt: {
                  type: "preset" as const,
                  preset: "claude_code" as const,
                },
                // Register mentioned agents with SDK via options.agents
                ...(Object.keys(agentsOption).length > 0 && { agents: agentsOption }),
                env: finalEnv,
                permissionMode:
                  input.mode === "plan"
                    ? ("plan" as const)
                    : ("bypassPermissions" as const),
                ...(input.mode !== "plan" && {
                  allowDangerouslySkipPermissions: true,
                }),
                includePartialMessages: true,
                // Load skills from project and user directories (native Claude Code skills)
                settingSources: ["project" as const, "user" as const],
                canUseTool: async (
                  toolName: string,
                  toolInput: Record<string, unknown>,
                  options: { toolUseID: string },
                ) => {
                  if (toolName === "AskUserQuestion") {
                    const { toolUseID } = options
                    // Emit to UI (safely in case observer is closed)
                    safeEmit({
                      type: "ask-user-question",
                      toolUseId: toolUseID,
                      questions: (toolInput as any).questions,
                    } as UIMessageChunk)

                    // Wait for response (60s timeout)
                    const response = await new Promise<{
                      approved: boolean
                      message?: string
                      updatedInput?: unknown
                    }>((resolve) => {
                      const timeoutId = setTimeout(() => {
                        pendingToolApprovals.delete(toolUseID)
                        // Emit chunk to notify UI that the question has timed out
                        // This ensures the pending question dialog is cleared
                        safeEmit({
                          type: "ask-user-question-timeout",
                          toolUseId: toolUseID,
                        } as UIMessageChunk)
                        resolve({ approved: false, message: "Timed out" })
                      }, 60000)

                      pendingToolApprovals.set(toolUseID, {
                        subChatId: input.subChatId,
                        resolve: (d) => {
                          clearTimeout(timeoutId)
                          resolve(d)
                        },
                      })
                    })

                    // Find the tool part in accumulated parts
                    const askToolPart = parts.find(
                      (p) => p.toolCallId === toolUseID && p.type === "tool-AskUserQuestion"
                    )

                    if (!response.approved) {
                      // Update the tool part with error result for skipped/denied
                      const errorMessage = response.message || "Skipped"
                      if (askToolPart) {
                        askToolPart.result = errorMessage
                        askToolPart.state = "result"
                      }
                      // Emit result to frontend so it updates in real-time
                      safeEmit({
                        type: "ask-user-question-result",
                        toolUseId: toolUseID,
                        result: errorMessage,
                      } as UIMessageChunk)
                      return {
                        behavior: "deny",
                        message: errorMessage,
                      }
                    }

                    // Update the tool part with answers result for approved
                    const answers = (response.updatedInput as any)?.answers
                    const answerResult = { answers }
                    if (askToolPart) {
                      askToolPart.result = answerResult
                      askToolPart.state = "result"
                    }
                    // Emit result to frontend so it updates in real-time
                    safeEmit({
                      type: "ask-user-question-result",
                      toolUseId: toolUseID,
                      result: answerResult,
                    } as UIMessageChunk)
                    return {
                      behavior: "allow",
                      updatedInput: response.updatedInput,
                    }
                  }
                  return {
                    behavior: "allow",
                    updatedInput: toolInput,
                  }
                },
                stderr: (data: string) => {
                  stderrLines.push(data)
                  console.error("[claude stderr]", data)
                },
                // Use bundled binary
                pathToClaudeCodeExecutable: claudeBinaryPath,
                ...(resumeSessionId && {
                  resume: resumeSessionId,
                  continue: true,
                }),
                // Use input.model if provided, otherwise use model from sub_chat in DB
                // Only include if model is a truthy value (not null/undefined)
                ...((() => {
                  const modelToUse = input.model || existingModel
                  return modelToUse ? { model: modelToUse } : {}
                })()),
                // fallbackModel: "claude-opus-4-5-20251101",
                ...(input.maxThinkingTokens && {
                  maxThinkingTokens: input.maxThinkingTokens,
                }),
              },
            }

            // 5. Run Claude SDK
            let stream
            try {
              stream = claudeQuery(queryOptions)
            } catch (queryError) {
              console.error("[CLAUDE] ✗ Failed to create SDK query:", queryError)
              emitError(queryError, "Failed to start Claude query")
              console.log(`[SD] M:END sub=${subId} reason=query_error n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // Note: lastError, planCompleted, exitPlanModeToolCallId declared outside loop (line 349-351)

            // Create buffer for text deltas (reduces IPC overhead)
            const deltaBuffer = new TextDeltaBuffer((chunk) => safeEmit(chunk))

            try {
              for await (const msg of stream) {
                if (abortController.signal.aborted) break

                messageCount++

                // Log raw message for debugging
                logRawClaudeMessage(input.chatId, msg)

                // Check for error messages from SDK (error can be embedded in message payload!)
                const msgAny = msg as any
                if (msgAny.type === "error" || msgAny.error) {
                  const sdkError =
                    msgAny.error || msgAny.message || "Unknown SDK error"
                  lastError = new Error(sdkError)

                  // Categorize SDK-level errors
                  let errorCategory = "SDK_ERROR"
                  let errorContext = "Claude SDK error"

                  if (
                    sdkError === "authentication_failed" ||
                    sdkError.includes("authentication")
                  ) {
                    errorCategory = "AUTH_FAILED_SDK"
                    errorContext =
                      "Authentication failed - not logged into Claude Code CLI"
                  } else if (
                    sdkError === "invalid_api_key" ||
                    sdkError.includes("api_key")
                  ) {
                    errorCategory = "INVALID_API_KEY_SDK"
                    errorContext = "Invalid API key in Claude Code CLI"
                  } else if (
                    sdkError === "rate_limit_exceeded" ||
                    sdkError.includes("rate")
                  ) {
                    errorCategory = "RATE_LIMIT_SDK"
                    errorContext = "Rate limit exceeded"
                  } else if (
                    sdkError === "overloaded" ||
                    sdkError.includes("overload")
                  ) {
                    errorCategory = "OVERLOADED_SDK"
                    errorContext = "Claude is overloaded, try again later"
                  }

                  // Emit auth-error for authentication failures, regular error otherwise
                  if (errorCategory === "AUTH_FAILED_SDK") {
                    safeEmit({
                      type: "auth-error",
                      errorText: errorContext,
                    } as UIMessageChunk)
                  } else {
                    safeEmit({
                      type: "error",
                      errorText: errorContext,
                      debugInfo: {
                        category: errorCategory,
                        sdkError: sdkError,
                        sessionId: msgAny.session_id,
                        messageId: msgAny.message?.id,
                      },
                    } as UIMessageChunk)
                  }

                  console.log(`[SD] M:END sub=${subId} reason=sdk_error cat=${errorCategory} n=${chunkCount}`)
                  safeEmit({ type: "finish" } as UIMessageChunk)
                  safeComplete()
                  return
                }

                // Track sessionId
                if (msgAny.session_id) {
                  metadata.sessionId = msgAny.session_id
                  currentSessionId = msgAny.session_id // Share with cleanup
                }

                // Transform and emit + accumulate (with buffering to reduce IPC overhead)
                for (const chunk of transform(msg)) {
                  chunkCount++
                  lastChunkType = chunk.type

                  // Use buffer to reduce IPC overhead (automatically flushes critical chunks)
                  if (!deltaBuffer.write(chunk)) {
                    // Observer closed (user clicked Stop), break out of loop
                    console.log(`[SD] M:EMIT_CLOSED sub=${subId} type=${chunk.type} n=${chunkCount}`)
                    break
                  }

                  // Accumulate based on chunk type
                  switch (chunk.type) {
                    case "text-delta":
                      currentText += chunk.delta
                      break
                    case "text-end":
                      if (currentText.trim()) {
                        parts.push({ type: "text", text: currentText })
                        currentText = ""
                      }
                      break
                    case "tool-input-available":
                      // DEBUG: Log tool calls
                      console.log(`[SD] M:TOOL_CALL sub=${subId} toolName="${chunk.toolName}" mode=${input.mode} callId=${chunk.toolCallId}`)

                      // Track ExitPlanMode toolCallId so we can stop when it completes
                      if (input.mode === "plan" && chunk.toolName === "ExitPlanMode") {
                        console.log(`[SD] M:PLAN_TOOL_DETECTED sub=${subId} callId=${chunk.toolCallId}`)
                        exitPlanModeToolCallId = chunk.toolCallId
                      }

                      parts.push({
                        type: `tool-${chunk.toolName}`,
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input,
                        state: "call",
                      })
                      break
                    case "tool-output-available":
                      const toolPart = parts.find(
                        (p) =>
                          p.type?.startsWith("tool-") &&
                          p.toolCallId === chunk.toolCallId,
                      )
                      if (toolPart) {
                        toolPart.result = chunk.output
                        toolPart.state = "result"
                      }
                      // Stop streaming after ExitPlanMode completes in plan mode
                      // Match by toolCallId since toolName is undefined in output chunks
                      if (input.mode === "plan" && exitPlanModeToolCallId && chunk.toolCallId === exitPlanModeToolCallId) {
                        console.log(`[SD] M:PLAN_STOP sub=${subId} callId=${chunk.toolCallId} n=${chunkCount} parts=${parts.length}`)
                        planCompleted = true
                        // Emit finish chunk so Chat hook properly resets its state
                        console.log(`[SD] M:PLAN_FINISH sub=${subId} - emitting finish chunk`)
                        safeEmit({ type: "finish" } as UIMessageChunk)
                        // Abort the Claude process so it doesn't keep running
                        console.log(`[SD] M:PLAN_ABORT sub=${subId} - aborting claude process`)
                        abortController.abort()
                      }
                      break
                    case "message-metadata":
                      metadata = { ...metadata, ...chunk.messageMetadata }
                      break
                  }
                  // Break from chunk loop if plan is done
                  if (planCompleted) {
                    console.log(`[SD] M:PLAN_BREAK_CHUNK sub=${subId}`)
                    break
                  }
                }
                // Break from stream loop if plan is done
                if (planCompleted) {
                  console.log(`[SD] M:PLAN_BREAK_STREAM sub=${subId}`)
                  break
                }
                // Break from stream loop if observer closed (user clicked Stop)
                if (!isObservableActive) {
                  console.log(`[SD] M:OBSERVER_CLOSED_STREAM sub=${subId}`)
                  break
                }
              }

              // Flush any remaining buffered chunks after stream completes
              deltaBuffer.flush()

            } catch (streamError) {
              // Flush buffer before handling error
              deltaBuffer.dispose()

              // This catches errors during streaming (like process exit)
              const err = streamError as Error
              const stderrOutput = stderrLines.join("\n")

              // Build detailed error message with category
              let errorContext = "Claude streaming error"
              let errorCategory = "UNKNOWN"

              // Check for "session not found" error in stderr
              if (stderrOutput.includes("No conversation found with session ID")) {
                errorContext = "Session expired - starting fresh conversation"
                errorCategory = "SESSION_NOT_FOUND"
                console.log(`[claude] Stale session detected at retry=${retryCount}`)

                // Clear stale sessionId from database
                db.update(subChats)
                  .set({ sessionId: null })
                  .where(eq(subChats.id, input.subChatId))
                  .run()

                // AUTO-RETRY: If first attempt and not aborted, retry with fresh session
                if (retryCount < 1 && !abortController.signal.aborted) {
                  console.log(`[claude] SESSION_RETRY sub=${subId} attempt=${retryCount + 1}`)

                  // Reset accumulation state for clean retry
                  parts.length = 0
                  currentText = ""
                  stderrLines.length = 0
                  messageCount = 0

                  // Set retry flag to restart the loop
                  retryCount++
                  shouldRetry = true

                  // Skip the rest of error handling - go directly to retry
                  console.log(`[SD] M:END sub=${subId} reason=session_retry retry=${retryCount}`)
                  continue // Restart do-while loop
                }

                // Retry limit exhausted or aborted - fall through to normal error handling
                console.log(`[claude] SESSION_RETRY_FAILED sub=${subId} exhausted=true aborted=${abortController.signal.aborted}`)
                errorContext = "Session expired - could not recover after retry"
              } else if (err.message?.includes("exited with code")) {
                errorContext = "Claude Code process crashed"
                errorCategory = "PROCESS_CRASH"
              } else if (err.message?.includes("ENOENT")) {
                errorContext = "Required executable not found in PATH"
                errorCategory = "EXECUTABLE_NOT_FOUND"
              } else if (
                err.message?.includes("authentication") ||
                err.message?.includes("401")
              ) {
                errorContext = "Authentication failed - check your API key"
                errorCategory = "AUTH_FAILURE"
              } else if (
                err.message?.includes("invalid_api_key") ||
                err.message?.includes("Invalid API Key") ||
                stderrOutput?.includes("invalid_api_key")
              ) {
                errorContext = "Invalid API key"
                errorCategory = "INVALID_API_KEY"
              } else if (
                err.message?.includes("rate_limit") ||
                err.message?.includes("429")
              ) {
                errorContext = "Rate limit exceeded"
                errorCategory = "RATE_LIMIT"
              } else if (
                err.message?.includes("network") ||
                err.message?.includes("ECONNREFUSED") ||
                err.message?.includes("fetch failed")
              ) {
                errorContext = "Network error - check your connection"
                errorCategory = "NETWORK_ERROR"
              }

              // Track error in Sentry (only if app is ready and Sentry is available)
              if (app.isReady() && app.isPackaged) {
                try {
                  const Sentry = await import("@sentry/electron/main")
                  Sentry.captureException(err, {
                    tags: {
                      errorCategory,
                      mode: input.mode,
                    },
                    extra: {
                      context: errorContext,
                      cwd: input.cwd,
                      stderr: stderrOutput || "(no stderr captured)",
                      chatId: input.chatId,
                      subChatId: input.subChatId,
                    },
                  })
                } catch {
                  // Sentry not available or failed to import - ignore
                }
              }

              // Send error with stderr output to frontend (only if not aborted by user)
              if (!abortController.signal.aborted) {
                // Special handling for session not found - give user helpful message
                const errorText = errorCategory === "SESSION_NOT_FOUND"
                  ? `${errorContext}. Please send your message again.`
                  : stderrOutput
                    ? `${errorContext}: ${err.message}\n\nProcess output:\n${stderrOutput}`
                    : `${errorContext}: ${err.message}`

                safeEmit({
                  type: "error",
                  errorText,
                  debugInfo: {
                    context: errorContext,
                    category: errorCategory,
                    cwd: input.cwd,
                    mode: input.mode,
                    stderr: stderrOutput || "(no stderr captured)",
                  },
                } as UIMessageChunk)
              }

              // ALWAYS save accumulated parts before returning (even on abort/error)
              console.log(`[SD] M:CATCH_SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`)
              if (currentText.trim()) {
                parts.push({ type: "text", text: currentText })
              }
              if (parts.length > 0) {
                const assistantMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  parts,
                  metadata,
                }
                const finalMessages = [...messagesToSave, assistantMessage]
                db.update(subChats)
                  .set({
                    messages: JSON.stringify(finalMessages),
                    sessionId: metadata.sessionId,
                    streamId: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(subChats.id, input.subChatId))
                  .run()
                db.update(chats)
                  .set({ updatedAt: new Date() })
                  .where(eq(chats.id, input.chatId))
                  .run()
              }

              console.log(`[SD] M:END sub=${subId} reason=stream_error cat=${errorCategory} n=${chunkCount} last=${lastChunkType}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // 6. Check if we got any response
            if (messageCount === 0 && !abortController.signal.aborted) {
              deltaBuffer.dispose() // Flush buffer before error
              emitError(
                new Error("No response received from Claude"),
                "Empty response",
              )
              console.log(`[SD] M:END sub=${subId} reason=no_response n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // 7. Save final messages to DB
            // ALWAYS save accumulated parts, even on abort (so user sees partial responses after reload)
            console.log(`[SD] M:SAVE sub=${subId} planCompleted=${planCompleted} aborted=${abortController.signal.aborted} parts=${parts.length}`)

            // Flush any remaining text
            if (currentText.trim()) {
              parts.push({ type: "text", text: currentText })
            }

            if (parts.length > 0) {
              const assistantMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                parts,
                metadata,
              }

              const finalMessages = [...messagesToSave, assistantMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(finalMessages),
                  sessionId: metadata.sessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            } else {
              // No assistant response - just clear streamId
              db.update(subChats)
                .set({
                  sessionId: metadata.sessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            // Update parent chat timestamp
            db.update(chats)
              .set({ updatedAt: new Date() })
              .where(eq(chats.id, input.chatId))
              .run()

            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            const reason = planCompleted ? "plan_complete" : "ok"
            console.log(`[SD] M:END sub=${subId} reason=${reason} n=${chunkCount} last=${lastChunkType} t=${duration}s`)
            safeComplete()
          } catch (error) {
            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            console.log(`[SD] M:END sub=${subId} reason=unexpected_error n=${chunkCount} t=${duration}s`)
            emitError(error, "Unexpected error")
            safeEmit({ type: "finish" } as UIMessageChunk)
            safeComplete()
          } finally {
            activeSessions.delete(input.subChatId)
          }
          } while (shouldRetry && !abortController.signal.aborted)
        })()

        // Cleanup on unsubscribe
        return () => {
          console.log(`[SD] M:CLEANUP sub=${subId} sessionId=${currentSessionId || 'none'}`)
          isObservableActive = false // Prevent emit after unsubscribe
          abortController.abort()
          activeSessions.delete(input.subChatId)
          clearPendingApprovals("Session ended.", input.subChatId)

          // Save sessionId on abort so conversation can be resumed
          // Clear streamId since we're no longer streaming
          const db = getDatabase()
          db.update(subChats)
            .set({
              streamId: null,
              ...(currentSessionId && { sessionId: currentSessionId })
            })
            .where(eq(subChats.id, input.subChatId))
            .run()
        }
      })
    }),

  /**
   * Cancel active session
   */
  cancel: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      const controller = activeSessions.get(input.subChatId)
      if (controller) {
        controller.abort()
        activeSessions.delete(input.subChatId)
        clearPendingApprovals("Session cancelled.", input.subChatId)
        return { cancelled: true }
      }
      return { cancelled: false }
    }),

  /**
   * Check if session is active
   */
  isActive: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => activeSessions.has(input.subChatId)),
  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
      }),
    )
    .mutation(({ input }) => {
      const pending = pendingToolApprovals.get(input.toolUseId)
      if (!pending) {
        return { ok: false }
      }
      pending.resolve({
        approved: input.approved,
        message: input.message,
        updatedInput: input.updatedInput,
      })
      pendingToolApprovals.delete(input.toolUseId)
      return { ok: true }
    }),
})
