#!/usr/bin/env node

function readArg(name) {
  const assignment = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (assignment) {
    return assignment.slice(name.length + 1)
  }

  const index = process.argv.indexOf(name)
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }

  return null
}

const expectedPlatform = readArg("--platform")
const allowCrossPlatform = process.env.LOCUS_ALLOW_CROSS_PLATFORM_PACKAGE === "1"

if (!expectedPlatform) {
  console.error("[release-host] Missing required --platform argument")
  process.exit(1)
}

if (allowCrossPlatform) {
  console.warn(
    `[release-host] Bypassing ${expectedPlatform} host check on ${process.platform}.`,
  )
  console.warn(
    "[release-host] Use this only for artifact inspection, not release builds with native modules.",
  )
  process.exit(0)
}

if (process.platform !== expectedPlatform) {
  console.error(
    `[release-host] Refusing to build ${expectedPlatform} package on ${process.platform}.`,
  )
  console.error(
    "[release-host] Build release packages on the target OS so Electron native modules are rebuilt and smoke-tested for that platform.",
  )
  console.error(
    "[release-host] Set LOCUS_ALLOW_CROSS_PLATFORM_PACKAGE=1 only for non-release artifact inspection.",
  )
  process.exit(1)
}
