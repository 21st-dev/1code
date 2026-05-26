const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"])

export function shouldOpenDevToolsOnStartup(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.LOCUS_OPEN_DEVTOOLS ?? env.AGENT_CODE_FOR_ME_OPEN_DEVTOOLS
  return TRUE_ENV_VALUES.has(value?.trim().toLowerCase() ?? "")
}
