import { accessSync, constants, existsSync, statSync } from "node:fs"

export type RuntimeExecutableStatus = {
  ok: boolean
  path: string | null
  exists: boolean
  isExecutable: boolean
  error: string | null
  hint: string
}

export function getRuntimeExecutableStatus(
  filePath: string | null,
  hint: string,
): RuntimeExecutableStatus {
  if (!filePath) {
    return {
      ok: false,
      path: null,
      exists: false,
      isExecutable: false,
      error: "Runtime executable path could not be resolved.",
      hint,
    }
  }

  if (!existsSync(filePath)) {
    return {
      ok: false,
      path: filePath,
      exists: false,
      isExecutable: false,
      error: "Runtime executable was not found.",
      hint,
    }
  }

  try {
    const stats = statSync(filePath)
    if (!stats.isFile()) {
      return {
        ok: false,
        path: filePath,
        exists: true,
        isExecutable: false,
        error: "Runtime path exists but is not a file.",
        hint,
      }
    }

    if (process.platform !== "win32") {
      accessSync(filePath, constants.X_OK)
    }

    return {
      ok: true,
      path: filePath,
      exists: true,
      isExecutable: true,
      error: null,
      hint,
    }
  } catch (error) {
    return {
      ok: false,
      path: filePath,
      exists: true,
      isExecutable: false,
      error:
        error instanceof Error
          ? error.message
          : "Runtime executable is not executable.",
      hint,
    }
  }
}
