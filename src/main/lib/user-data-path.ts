import { join, resolve } from "path"

export const USER_DATA_OVERRIDE_ENV_KEYS = [
  "LOCUS_USER_DATA_DIR",
  "AGENT_CODE_FOR_ME_USER_DATA_DIR",
] as const

export type UserDataPathConfig = {
  path: string
  source: "default" | (typeof USER_DATA_OVERRIDE_ENV_KEYS)[number]
}

export function resolveUserDataPath({
  appDataPath,
  isDev,
  legacyAppName,
  env = process.env,
}: {
  appDataPath: string
  isDev: boolean
  legacyAppName: string
  env?: NodeJS.ProcessEnv
}): UserDataPathConfig {
  for (const key of USER_DATA_OVERRIDE_ENV_KEYS) {
    const value = env[key]?.trim()
    if (value) {
      return {
        path: resolve(value),
        source: key,
      }
    }
  }

  const userDataName = isDev ? `${legacyAppName} Dev` : legacyAppName
  return {
    path: join(appDataPath, userDataName),
    source: "default",
  }
}
