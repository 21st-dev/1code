import { z } from "zod";
import { router, publicProcedure } from "../index";
import { getDatabase } from "../../db";
import { chats, subChats, projects } from "../../db/schema";
import { eq } from "drizzle-orm";
import { app } from "electron";
import { getAuthManager, getBaseUrl } from "../../../index";
import { createWorktreeForChat } from "../../git/worktree";
import { importSandboxToWorktree, type ExportClaudeSession } from "../../git/sandbox-import";
import { getGitRemoteInfo } from "../../git";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Schema for remote chat data from web API
 */
const remoteSubChatSchema = z.object({
	id: z.string(),
	name: z.string(),
	mode: z.string(),
	messages: z.any(), // JSON messages array
	createdAt: z.string(),
	updatedAt: z.string(),
});

const remoteChatSchema = z.object({
	id: z.string(),
	name: z.string(),
	sandboxId: z.string().nullable(),
	meta: z
		.object({
			repository: z.string().optional(),
			branch: z.string().nullable().optional(),
		})
		.nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	subChats: z.array(remoteSubChatSchema),
});

/**
 * Write Claude session files to the isolated config directory for a subChat
 * This allows conversations to be resumed after importing from sandbox
 */
async function writeClaudeSession(
	subChatId: string,
	localProjectPath: string,
	session: ExportClaudeSession,
): Promise<void> {
	// Desktop's isolated config dir for this subChat (same as claude.ts uses)
	const isolatedConfigDir = join(
		app.getPath("userData"),
		"claude-sessions",
		subChatId
	);

	// Sanitize local path (same logic as Claude SDK)
	// SDK replaces both "/" and "." with "-"
	// /Users/sergey/.myapp → -Users-sergey--myapp
	const sanitizedPath = localProjectPath.replace(/[/.]/g, "-");
	const projectDir = join(isolatedConfigDir, "projects", sanitizedPath);

	console.log(`[writeClaudeSession] ========== DEBUG ==========`);
	console.log(`[writeClaudeSession] subChatId: ${subChatId}`);
	console.log(`[writeClaudeSession] localProjectPath: ${localProjectPath}`);
	console.log(`[writeClaudeSession] sanitizedPath: ${sanitizedPath}`);
	console.log(`[writeClaudeSession] isolatedConfigDir: ${isolatedConfigDir}`);
	console.log(`[writeClaudeSession] projectDir: ${projectDir}`);
	console.log(`[writeClaudeSession] sessionId: ${session.sessionId}`);

	await mkdir(projectDir, { recursive: true });

	// Rewrite paths in session data: /home/user/repo → local path
	const rewrittenData = session.data.replace(/\/home\/user\/repo/g, localProjectPath);

	// Write session JSONL file
	const sessionFilePath = join(projectDir, `${session.sessionId}.jsonl`);
	await writeFile(sessionFilePath, rewrittenData, "utf-8");

	console.log(`[writeClaudeSession] Wrote session file: ${sessionFilePath}`);

	// Write sessions-index.json (with fallbacks for empty metadata)
	const indexData = {
		version: 1,
		entries: [{
			sessionId: session.sessionId,
			fullPath: sessionFilePath,
			projectPath: localProjectPath,
			firstPrompt: session.metadata?.firstPrompt || "",
			messageCount: session.metadata?.messageCount || 0,
			created: session.metadata?.created || new Date().toISOString(),
			modified: session.metadata?.modified || new Date().toISOString(),
			gitBranch: session.metadata?.gitBranch || "",
			fileMtime: Date.now(),
			isSidechain: false,
		}],
	};

	const indexPath = join(projectDir, "sessions-index.json");
	await writeFile(indexPath, JSON.stringify(indexData, null, 2), "utf-8");

	console.log(`[writeClaudeSession] Wrote index file: ${indexPath}`);
	console.log(`[writeClaudeSession] ========== END DEBUG ==========`);
}

export const sandboxImportRouter = router({
	/**
	 * Import a sandbox chat to a local worktree
	 */
	importSandboxChat: publicProcedure
		.input(
			z.object({
				sandboxId: z.string(),
				remoteChatId: z.string(),
				remoteSubChatId: z.string().optional(),
				projectId: z.string(),
				chatName: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const db = getDatabase();
			const authManager = getAuthManager();
			const apiUrl = getBaseUrl();

			console.log(`[OPEN-LOCALLY] Starting import: remoteChatId=${input.remoteChatId}, remoteSubChatId=${input.remoteSubChatId || "all"}, sandboxId=${input.sandboxId}`);

			// Verify auth
			const token = await authManager.getValidToken();
			if (!token) {
				throw new Error("Not authenticated");
			}

			// Verify project exists
			const project = db
				.select()
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();

			if (!project) {
				throw new Error("Project not found");
			}

			// Fetch remote chat data (filter by subChatId if provided)
			const chatExportUrl = input.remoteSubChatId
				? `${apiUrl}/api/agents/chat/${input.remoteChatId}/export?subChatId=${input.remoteSubChatId}`
				: `${apiUrl}/api/agents/chat/${input.remoteChatId}/export`;
			console.log(`[OPEN-LOCALLY] Fetching chat data from: ${chatExportUrl}`);

			const chatResponse = await fetch(chatExportUrl, {
				method: "GET",
				headers: {
					"X-Desktop-Token": token,
				},
			});

			if (!chatResponse.ok) {
				throw new Error(`Failed to fetch chat data: ${chatResponse.statusText}`);
			}

			const remoteChatData = remoteChatSchema.parse(await chatResponse.json());
			console.log(`[OPEN-LOCALLY] Found ${remoteChatData.subChats.length} subchat(s) to import`);

			// Extract sessionId from the target subchat's messages BEFORE calling sandbox export
			// This allows us to request only the specific session from the sandbox
			let targetSessionId: string | undefined;
			if (remoteChatData.subChats.length > 0) {
				const targetSubChat = remoteChatData.subChats[0]; // First one (only one if filtered by subChatId)
				const messagesArray = targetSubChat.messages || [];
				const lastAssistant = [...messagesArray].reverse().find(
					(m: any) => m.role === "assistant"
				);
				targetSessionId = lastAssistant?.metadata?.sessionId;
				console.log(`[OPEN-LOCALLY] Target sessionId from subchat messages: ${targetSessionId || "none"}`);
			}

			// Create worktree for the chat
			const worktreeResult = await createWorktreeForChat(
				project.path,
				input.projectId,
				`imported-${Date.now()}`, // Unique ID for worktree directory
			);

			if (!worktreeResult.success || !worktreeResult.worktreePath) {
				throw new Error(worktreeResult.error || "Failed to create worktree");
			}

			// Import sandbox git state to worktree (pass sessionId to get only that session)
			const importResult = await importSandboxToWorktree(
				worktreeResult.worktreePath,
				apiUrl,
				input.sandboxId,
				token,
				false, // fullExport = false
				targetSessionId, // sessionId to filter
			);
			console.log(`[OPEN-LOCALLY] Received ${importResult.claudeSessions?.length || 0} Claude session(s) from sandbox`);

			if (!importResult.success) {
				console.warn(
					`[sandbox-import] Git state import failed: ${importResult.error}`,
				);
				// Continue anyway - chat history is still valuable
			}

			// Create local chat record
			const chat = db
				.insert(chats)
				.values({
					name: input.chatName || remoteChatData.name || "Imported Chat",
					projectId: input.projectId,
					worktreePath: worktreeResult.worktreePath,
					branch: worktreeResult.branch,
					baseBranch: worktreeResult.baseBranch,
				})
				.returning()
				.get();

			// Import sub-chats with messages and Claude sessions
			const claudeSessions = importResult.claudeSessions || [];
			console.log(`[sandbox-import] Available Claude sessions: ${claudeSessions.length}`);

			for (const remoteSubChat of remoteChatData.subChats) {
				const messagesArray = remoteSubChat.messages || [];

				// Find sessionId from last assistant message BEFORE creating subChat
				const lastAssistant = [...messagesArray].reverse().find(
					(m: any) => m.role === "assistant"
				);
				const messageSessionId = lastAssistant?.metadata?.sessionId;

				// Check if we have a matching Claude session
				const matchingSession = messageSessionId && claudeSessions.length > 0
					? claudeSessions.find(s => s.sessionId === messageSessionId)
					: undefined;

				// Create subChat with sessionId if we have a matching session
				const createdSubChat = db.insert(subChats)
					.values({
						chatId: chat.id,
						name: remoteSubChat.name,
						mode: (remoteSubChat.mode === "plan" || remoteSubChat.mode === "ask") ? remoteSubChat.mode : "agent",
						messages: JSON.stringify(messagesArray),
						// Set sessionId if we have matching Claude session (enables resume)
						...(matchingSession && { sessionId: messageSessionId }),
					})
					.returning()
					.get();

				// Write Claude session files if we have a matching one
				if (matchingSession) {
					try {
						await writeClaudeSession(
							createdSubChat.id,
							worktreeResult.worktreePath!,
							matchingSession,
						);
						console.log(`[sandbox-import] Wrote Claude session for subChat ${createdSubChat.id} with sessionId ${messageSessionId}`);
					} catch (sessionErr) {
						console.error(`[sandbox-import] Failed to write Claude session:`, sessionErr);
					}
				}
			}

			// If no sub-chats were imported, create an empty one
			const importedSubChats = db
				.select()
				.from(subChats)
				.where(eq(subChats.chatId, chat.id))
				.all();

			if (importedSubChats.length === 0) {
				db.insert(subChats)
					.values({
						chatId: chat.id,
						name: "Main",
						mode: "agent",
						messages: "[]",
					})
					.run();
			}

			return {
				success: true,
				chatId: chat.id,
				worktreePath: worktreeResult.worktreePath,
				gitImportSuccess: importResult.success,
				gitImportError: importResult.error,
			};
		}),

	/**
	 * Get list of user's remote sandbox chats
	 */
	listRemoteSandboxChats: publicProcedure
		.input(
			z.object({
				teamId: z.string(),
			}),
		)
		.query(async ({ input }) => {
			const authManager = getAuthManager();
			const apiUrl = getBaseUrl();

			const token = await authManager.getValidToken();
			if (!token) {
				throw new Error("Not authenticated");
			}

			// Call web API to get sandbox chats
			// Note: This would need a corresponding endpoint on the web side
			const response = await fetch(
				`${apiUrl}/api/agents/chats?teamId=${input.teamId}`,
				{
					method: "GET",
					headers: {
						"X-Desktop-Token": token,
					},
				},
			);

			if (!response.ok) {
				throw new Error(`Failed to fetch sandbox chats: ${response.statusText}`);
			}

			return response.json();
		}),

	/**
	 * Clone a repository from sandbox and import the chat
	 * This is for cases when user doesn't have the repo locally
	 */
	cloneFromSandbox: publicProcedure
		.input(
			z.object({
				sandboxId: z.string(),
				remoteChatId: z.string(),
				remoteSubChatId: z.string().optional(),
				chatName: z.string().optional(),
				targetPath: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			console.log(`[OPEN-LOCALLY] Starting clone process`);
			console.log(`[OPEN-LOCALLY] Input:`, {
				sandboxId: input.sandboxId,
				remoteChatId: input.remoteChatId,
				remoteSubChatId: input.remoteSubChatId || "all",
				chatName: input.chatName,
				targetPath: input.targetPath,
			});

			const db = getDatabase();
			const authManager = getAuthManager();
			const apiUrl = getBaseUrl();
			console.log(`[OPEN-LOCALLY] API URL: ${apiUrl}`);

			// Verify auth
			console.log(`[OPEN-LOCALLY] Getting auth token...`);
			const token = await authManager.getValidToken();
			if (!token) {
				console.error(`[OPEN-LOCALLY] No auth token available`);
				throw new Error("Not authenticated");
			}
			console.log(`[OPEN-LOCALLY] Auth token obtained`);

			// Fetch remote chat data first (filter by subChatId if provided)
			const chatExportUrl = input.remoteSubChatId
				? `${apiUrl}/api/agents/chat/${input.remoteChatId}/export?subChatId=${input.remoteSubChatId}`
				: `${apiUrl}/api/agents/chat/${input.remoteChatId}/export`;
			console.log(`[OPEN-LOCALLY] Fetching chat data from: ${chatExportUrl}`);
			const chatResponse = await fetch(chatExportUrl, {
				method: "GET",
				headers: {
					"X-Desktop-Token": token,
				},
			});

			if (!chatResponse.ok) {
				console.error(`[OPEN-LOCALLY] Failed to fetch chat data: ${chatResponse.status} ${chatResponse.statusText}`);
				throw new Error(`Failed to fetch chat data: ${chatResponse.statusText}`);
			}

			const chatJson = await chatResponse.json();
			console.log(`[OPEN-LOCALLY] Remote chat data received:`, {
				id: chatJson.id,
				name: chatJson.name,
				sandboxId: chatJson.sandboxId,
				meta: chatJson.meta,
				subChatsCount: chatJson.subChats?.length,
			});

			const remoteChatData = remoteChatSchema.parse(chatJson);
			console.log(`[OPEN-LOCALLY] Found ${remoteChatData.subChats.length} subchat(s) to import`);

			// Extract sessionId from the target subchat's messages BEFORE calling sandbox export
			let targetSessionId: string | undefined;
			if (remoteChatData.subChats.length > 0) {
				const targetSubChat = remoteChatData.subChats[0]; // First one (only one if filtered by subChatId)
				const messagesArray = targetSubChat.messages || [];
				const lastAssistant = [...messagesArray].reverse().find(
					(m: any) => m.role === "assistant"
				);
				targetSessionId = lastAssistant?.metadata?.sessionId;
				console.log(`[OPEN-LOCALLY] Target sessionId from subchat messages: ${targetSessionId || "none"}`);
			}

			// DEBUG: Fetch sandbox debug info to see what Claude sessions exist
			try {
				const debugUrl = `${apiUrl}/api/agents/sandbox/${input.sandboxId}/export/debug`;
				console.log(`[OPEN-LOCALLY] Fetching debug info from: ${debugUrl}`);
				const debugResponse = await fetch(debugUrl, {
					method: "GET",
					headers: { "X-Desktop-Token": token },
				});
				if (debugResponse.ok) {
					const debugData = await debugResponse.json();
					console.log(`[OPEN-LOCALLY] ========== SANDBOX DEBUG INFO ==========`);
					console.log(`[OPEN-LOCALLY] Paths:`, debugData.paths);
					console.log(`[OPEN-LOCALLY] Checks:`, debugData.checks);
					console.log(`[OPEN-LOCALLY] Files in .claude:`, debugData.files?.claudeHome);
					console.log(`[OPEN-LOCALLY] Projects dirs:`, debugData.files?.projects);
					console.log(`[OPEN-LOCALLY] Project dir contents:`, debugData.files?.projectDir);
					console.log(`[OPEN-LOCALLY] Sessions index:`, debugData.sessionsIndex);
					console.log(`[OPEN-LOCALLY] Session files exist:`, debugData.sessionFilesExist);
					console.log(`[OPEN-LOCALLY] Errors:`, debugData.errors);
					console.log(`[OPEN-LOCALLY] ========== END SANDBOX DEBUG ==========`);
				} else {
					console.log(`[OPEN-LOCALLY] Debug endpoint returned ${debugResponse.status}`);
				}
			} catch (debugErr) {
				console.log(`[OPEN-LOCALLY] Debug fetch failed:`, debugErr);
			}

			// Create target directory
			console.log(`[OPEN-LOCALLY] Creating target directory: ${input.targetPath}`);
			await mkdir(input.targetPath, { recursive: true });
			console.log(`[OPEN-LOCALLY] Target directory created`);

			// Initialize git repo
			console.log(`[OPEN-LOCALLY] Initializing git repo...`);
			await execAsync("git init", { cwd: input.targetPath });
			console.log(`[OPEN-LOCALLY] Git repo initialized`);

			// Import sandbox git state with FULL export (includes entire repo history)
			// Pass sessionId to get only that specific session
			console.log(`[OPEN-LOCALLY] Starting sandbox import with full export, sessionId: ${targetSessionId || "all"}`);
			const importResult = await importSandboxToWorktree(
				input.targetPath,
				apiUrl,
				input.sandboxId,
				token,
				true, // fullExport = true for cloning
				targetSessionId, // sessionId to filter
			);

			console.log(`[OPEN-LOCALLY] Import result:`, {
				success: importResult.success,
				error: importResult.error,
				claudeSessionsCount: importResult.claudeSessions?.length || 0,
			});

			if (!importResult.success) {
				console.warn(
					`[OPEN-LOCALLY] Git state import failed: ${importResult.error}`,
				);
				// Continue anyway - we can still use the directory
			}

			// Get git remote info (should have been set from the bundle)
			console.log(`[OPEN-LOCALLY] Getting git remote info...`);
			const gitInfo = await getGitRemoteInfo(input.targetPath);
			console.log(`[OPEN-LOCALLY] Git remote info:`, gitInfo);

			// Fallback: extract owner/repo from remote chat metadata if git remote wasn't set up
			// This happens when E2B export doesn't include remoteUrl in the meta
			let finalOwner = gitInfo.owner;
			let finalRepo = gitInfo.repo;
			let finalRemoteUrl = gitInfo.remoteUrl;
			let finalProvider = gitInfo.provider;

			if (!finalOwner || !finalRepo) {
				const repoFromMeta = remoteChatData.meta?.repository;
				if (repoFromMeta) {
					const [metaOwner, metaRepo] = repoFromMeta.split("/");
					if (metaOwner && metaRepo) {
						console.log(`[OPEN-LOCALLY] Git remote missing, using meta.repository: ${repoFromMeta}`);
						finalOwner = metaOwner;
						finalRepo = metaRepo;
						finalProvider = "github"; // Assume GitHub for now
						finalRemoteUrl = `https://github.com/${metaOwner}/${metaRepo}`;

						// Actually set up the git remote so repo is properly configured
						try {
							await execAsync(`git remote add origin ${finalRemoteUrl}`, { cwd: input.targetPath });
							console.log(`[OPEN-LOCALLY] Added origin remote: ${finalRemoteUrl}`);
						} catch (err) {
							// Remote might already exist, try to update it
							try {
								await execAsync(`git remote set-url origin ${finalRemoteUrl}`, { cwd: input.targetPath });
								console.log(`[OPEN-LOCALLY] Updated origin remote: ${finalRemoteUrl}`);
							} catch {
								console.warn(`[OPEN-LOCALLY] Could not set origin remote`);
							}
						}
					}
				}
			}

			console.log(`[OPEN-LOCALLY] Final git info: owner="${finalOwner}", repo="${finalRepo}"`);

			// Get the actual current branch from git
			console.log(`[OPEN-LOCALLY] Getting current branch from git...`);
			let actualBranch = remoteChatData.meta?.branch || "main"; // fallback
			try {
				const { stdout: currentBranch } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: input.targetPath });
				actualBranch = currentBranch.trim();
				console.log(`[OPEN-LOCALLY] Actual git branch: ${actualBranch}`);
			} catch (err) {
				console.warn(`[OPEN-LOCALLY] Could not get current branch, using fallback: ${actualBranch}`, err);
			}

			// Check if project already exists (from a previous failed attempt)
			console.log(`[OPEN-LOCALLY] Checking for existing project at path: ${input.targetPath}`);
			const existingProject = db
				.select()
				.from(projects)
				.where(eq(projects.path, input.targetPath))
				.get();

			console.log(`[OPEN-LOCALLY] Existing project:`, existingProject ? { id: existingProject.id, name: existingProject.name } : null);

			// Use existing project or create new one
			const project = existingProject
				? db
						.update(projects)
						.set({
							updatedAt: new Date(),
							gitRemoteUrl: finalRemoteUrl,
							gitProvider: finalProvider,
							gitOwner: finalOwner,
							gitRepo: finalRepo,
						})
						.where(eq(projects.id, existingProject.id))
						.returning()
						.get()!
				: db
						.insert(projects)
						.values({
							name: basename(input.targetPath),
							path: input.targetPath,
							gitRemoteUrl: finalRemoteUrl,
							gitProvider: finalProvider,
							gitOwner: finalOwner,
							gitRepo: finalRepo,
						})
						.returning()
						.get();

			console.log(`[OPEN-LOCALLY] Project created/updated:`, { id: project.id, name: project.name });

			// Create chat record (using the project path directly, no separate worktree needed
			// since this is a fresh clone)
			console.log(`[OPEN-LOCALLY] Creating chat record with branch: ${actualBranch}`);
			const chat = db
				.insert(chats)
				.values({
					name: input.chatName || remoteChatData.name || "Imported Chat",
					projectId: project.id,
					worktreePath: input.targetPath,
					branch: actualBranch,
					baseBranch: "main",
				})
				.returning()
				.get();

			console.log(`[OPEN-LOCALLY] Chat created:`, { id: chat.id, name: chat.name });

			// Import sub-chats with messages and Claude sessions
			console.log(`[OPEN-LOCALLY] Importing ${remoteChatData.subChats.length} sub-chats...`);
			const claudeSessions = importResult.claudeSessions || [];
			console.log(`[OPEN-LOCALLY] Available Claude sessions: ${claudeSessions.length}`);

			for (const remoteSubChat of remoteChatData.subChats) {
				const messagesArray = remoteSubChat.messages || [];
				const messagesCount = Array.isArray(messagesArray) ? messagesArray.length : 0;
				console.log(`[OPEN-LOCALLY] Importing sub-chat: ${remoteSubChat.name} (mode: ${remoteSubChat.mode}, messages: ${messagesCount})`);
				console.log(`[OPEN-LOCALLY] Messages preview:`, JSON.stringify(messagesArray).slice(0, 500));

				// Find sessionId from last assistant message BEFORE creating subChat
				const lastAssistant = [...messagesArray].reverse().find(
					(m: any) => m.role === "assistant"
				);
				const messageSessionId = lastAssistant?.metadata?.sessionId;

				// Check if we have a matching Claude session
				const matchingSession = messageSessionId && claudeSessions.length > 0
					? claudeSessions.find(s => s.sessionId === messageSessionId)
					: undefined;

				// Create subChat with sessionId if we have a matching session
				const createdSubChat = db.insert(subChats)
					.values({
						chatId: chat.id,
						name: remoteSubChat.name,
						mode: (remoteSubChat.mode === "plan" || remoteSubChat.mode === "ask") ? remoteSubChat.mode : "agent",
						messages: JSON.stringify(messagesArray),
						// Set sessionId if we have matching Claude session (enables resume)
						...(matchingSession && { sessionId: messageSessionId }),
					})
					.returning()
					.get();

				// Write Claude session files if we have a matching one
				if (matchingSession) {
					try {
						await writeClaudeSession(
							createdSubChat.id,
							input.targetPath,
							matchingSession,
						);
						console.log(`[OPEN-LOCALLY] Wrote Claude session for subChat ${createdSubChat.id} with sessionId ${messageSessionId}`);
					} catch (sessionErr) {
						console.error(`[OPEN-LOCALLY] Failed to write Claude session:`, sessionErr);
					}
				} else if (messageSessionId) {
					console.log(`[OPEN-LOCALLY] No matching Claude session found for sessionId: ${messageSessionId.slice(0, 8)}...`);
				} else {
					console.log(`[OPEN-LOCALLY] No sessionId in messages or no sessions exported`);
				}
			}

			// If no sub-chats were imported, create an empty one
			const importedSubChats = db
				.select()
				.from(subChats)
				.where(eq(subChats.chatId, chat.id))
				.all();

			if (importedSubChats.length === 0) {
				console.log(`[OPEN-LOCALLY] No sub-chats imported, creating default`);
				db.insert(subChats)
					.values({
						chatId: chat.id,
						name: "Main",
						mode: "agent",
						messages: "[]",
					})
					.run();
			}

			console.log(`[OPEN-LOCALLY] Clone completed successfully!`);
			console.log(`[OPEN-LOCALLY] Final result:`, {
				projectId: project.id,
				chatId: chat.id,
				gitImportSuccess: importResult.success,
				gitImportError: importResult.error,
			});

			return {
				success: true,
				projectId: project.id,
				chatId: chat.id,
				gitImportSuccess: importResult.success,
				gitImportError: importResult.error,
			};
		}),
});
