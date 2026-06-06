import type { ChildProcess } from "node:child_process"

export type CodexLoginSessionState =
  | "running"
  | "success"
  | "error"
  | "cancelled"

export type CodexLoginSession = {
  id: string
  process: ChildProcess | null
  state: CodexLoginSessionState
  output: string
  rawOutput: string
  url: string | null
  error: string | null
  exitCode: number | null
}

export type CodexLoginSessionResponse = {
  sessionId: string
  state: CodexLoginSessionState
  url: string | null
  output: string
  error: string | null
  exitCode: number | null
}

const loginSessions = new Map<string, CodexLoginSession>()

export function createCodexLoginSession(params: {
  id: string
  process: ChildProcess
}): CodexLoginSession {
  const session: CodexLoginSession = {
    id: params.id,
    process: params.process,
    state: "running",
    output: "",
    rawOutput: "",
    url: null,
    error: null,
    exitCode: null,
  }
  loginSessions.set(session.id, session)
  return session
}

export function toCodexLoginSessionResponse(
  session: CodexLoginSession,
): CodexLoginSessionResponse {
  return {
    sessionId: session.id,
    state: session.state,
    url: session.url,
    output: session.output,
    error: session.error,
    exitCode: session.exitCode,
  }
}

export function getActiveCodexLoginSession(): CodexLoginSession | null {
  for (const session of loginSessions.values()) {
    if (session.state === "running" && session.process && !session.process.killed) {
      return session
    }
  }

  return null
}

export function getCodexLoginSession(
  sessionId: string,
): CodexLoginSession | null {
  return loginSessions.get(sessionId) ?? null
}

export function cancelCodexLoginSession(sessionId: string):
  | { success: true; found: false }
  | {
      success: true
      found: true
      session: CodexLoginSessionResponse
    } {
  const session = getCodexLoginSession(sessionId)
  if (!session) {
    return { success: true, found: false }
  }

  session.state = "cancelled"
  session.error = null

  if (session.process && !session.process.killed) {
    session.process.kill("SIGTERM")
  }

  return {
    success: true,
    found: true,
    session: toCodexLoginSessionResponse(session),
  }
}

export function clearCodexLoginSessions(): void {
  loginSessions.clear()
}
