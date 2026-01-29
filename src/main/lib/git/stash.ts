import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import simpleGit from "simple-git"

const APPLY_RETRIES = 3
const APPLY_RETRY_DELAY_MS = 200

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type CheckpointPayload = {
  sdkMessageUuid: string
  indexTree: string
  worktreeTree: string
}

/**
 * Create a checkpoint ref for rollback support.
 * Stores index and worktree trees in an orphan commit under refs/checkpoints/.
 * If there are no changes, no checkpoint is created (this is fine).
 */
export async function createRollbackStash(
  cwd: string,
  sdkMessageUuid: string,
): Promise<void> {
  try {
    const git = simpleGit(cwd)

    const indexTreeRaw = await git.raw(["write-tree"])
    const indexTree = indexTreeRaw.trim()
    if (!indexTree) {
      return
    }

    let worktreeTree = ""
    let tempDir: string | undefined
    try {
      tempDir = await mkdtemp(join(tmpdir(), "checkpoint-index-"))
      const tempIndexPath = join(tempDir, "index")
      const gitWithTempIndex = simpleGit(cwd).env({
        GIT_INDEX_FILE: tempIndexPath,
      })
      await gitWithTempIndex.raw(["add", "-A"])
      worktreeTree = (await gitWithTempIndex.raw(["write-tree"])).trim()
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true })
      }
    }

    if (!worktreeTree) {
      return
    }

    const checkpointPayload: CheckpointPayload = {
      sdkMessageUuid,
      indexTree,
      worktreeTree,
    }
    const commitRaw = await git.raw([
      "-c",
      "user.name=Checkpoint",
      "-c",
      "user.email=checkpoint@local",
      "commit-tree",
      worktreeTree,
      "-m",
      JSON.stringify(checkpointPayload),
    ])
    const commitHash = commitRaw.trim()
    if (!commitHash) {
      return
    }

    await git.raw([
      "update-ref",
      `refs/checkpoints/${sdkMessageUuid}`,
      commitHash,
    ])
  } catch (e) {
    console.error("[claude] Failed to create rollback checkpoint:", e)
  }
}

function parseCheckpointTrees(
  message: string,
): { indexTree: string | null; worktreeTree: string | null } {
  const body = message.trim()
  if (body) {
    try {
      const parsed = JSON.parse(body) as CheckpointPayload
      if (parsed.indexTree && parsed.worktreeTree) {
        return {
          indexTree: parsed.indexTree,
          worktreeTree: parsed.worktreeTree,
        }
      }
    } catch {
      // Ignore invalid payload.
    }
  }
  return {
    indexTree: null,
    worktreeTree: null,
  }
}

export type RollbackResult =
  | { success: true; checkpointFound: true }
  | { success: true; checkpointFound: false }
  | { success: false; error: string }

export async function applyRollbackStash(
  worktreePath: string,
  sdkMessageUuid: string,
): Promise<RollbackResult> {
  try {
    const git = simpleGit(worktreePath)

    const ref = `refs/checkpoints/${sdkMessageUuid}`
    let commitHash = ""
    try {
      commitHash = (await git.raw(["rev-parse", ref])).trim()
    } catch (error) {
      console.warn(
        `[claude] Rollback checkpoint not found for sdkMessageUuid=${sdkMessageUuid}`,
      )
      // Checkpoint not found - return success but indicate no checkpoint was applied
      // The caller can decide whether to proceed with message truncation
      return { success: true, checkpointFound: false }
    }

    const commitMessage = await git.raw([
      "show",
      "-s",
      "--format=%B",
      commitHash,
    ])
    const { indexTree, worktreeTree } = parseCheckpointTrees(commitMessage)
    if (!indexTree || !worktreeTree) {
      console.error(
        `[claude] Rollback checkpoint missing tree metadata for sdkMessageUuid=${sdkMessageUuid}`,
      )
      return { success: false, error: "Checkpoint missing tree metadata" }
    }

    let lastError: unknown
    for (let attempt = 1; attempt <= APPLY_RETRIES; attempt += 1) {
      try {
        await git.raw(["read-tree", worktreeTree])
        await git.raw(["checkout-index", "-a", "-f"])
        await git.raw(["clean", "-fd"])
        await git.raw(["read-tree", indexTree])
        return { success: true, checkpointFound: true }
      } catch (error) {
        lastError = error
        if (attempt < APPLY_RETRIES) {
          await sleep(APPLY_RETRY_DELAY_MS)
        }
      }
    }
    throw lastError
  } catch (e) {
    console.error("[claude] Failed to apply rollback checkpoint:", e)
    const errorMessage = e instanceof Error ? e.message : "Unknown error"
    return { success: false, error: errorMessage }
  }
}
