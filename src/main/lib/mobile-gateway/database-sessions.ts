import { desc, eq } from "drizzle-orm"
import { chats, getDatabase, projects, subChats } from "../db"
import {
  mapMobileGatewaySessionRows,
  type MobileGatewaySessionRow,
} from "./sessions"
import type { MobileGatewaySessionSummary } from "./facade"

export function listMobileGatewaySessionsFromDatabase(): MobileGatewaySessionSummary[] {
  const db = getDatabase()
  const rows = db
    .select({
      chatId: chats.id,
      chatName: chats.name,
      chatWorktreePath: chats.worktreePath,
      projectName: projects.name,
      projectPath: projects.path,
      subChatId: subChats.id,
      subChatName: subChats.name,
      engine: subChats.engine,
      modelId: subChats.modelId,
      mode: subChats.mode,
      runtimeMetadata: subChats.runtimeMetadata,
      streamId: subChats.streamId,
      engineSessionId: subChats.engineSessionId,
      sessionId: subChats.sessionId,
      updatedAt: subChats.updatedAt,
    })
    .from(subChats)
    .innerJoin(chats, eq(subChats.chatId, chats.id))
    .innerJoin(projects, eq(chats.projectId, projects.id))
    .orderBy(desc(subChats.updatedAt))
    .all()

  return mapMobileGatewaySessionRows(rows satisfies MobileGatewaySessionRow[])
}
