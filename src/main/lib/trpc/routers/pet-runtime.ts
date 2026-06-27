import { publicProcedure, router } from "../index"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { z } from "zod"
import { readPetRuntimeStatus } from "../../pet-runtime-status"

const execFileAsync = promisify(execFile)

export const petRuntimeRouter = router({
  getStatus: publicProcedure.query(() => readPetRuntimeStatus()),

  react: publicProcedure
    .input(z.object({ intent: z.enum(["waving", "goodnight"]) }))
    .mutation(async ({ input }) => {
      const status = readPetRuntimeStatus()
      if (!status.runtime.reactScriptExists) {
        throw new Error("Codex official pet runtime is not installed")
      }

      const result = await execFileAsync(
        process.execPath,
        [status.runtime.reactScriptPath, input.intent],
        {
          cwd: status.runtime.directory,
          timeout: 15_000,
        },
      )

      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
      }
    }),
})
