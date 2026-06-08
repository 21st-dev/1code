import { router } from "../index"
import { chatCrudProcedures } from "./chats-crud"
import { subChatProcedures } from "./chats-sub-chats"
import { diffProcedures } from "./chats-diff"
import { generationProcedures } from "./chats-generation"
import { prProcedures } from "./chats-pr"
import { inspectProcedures } from "./chats-inspect"

/**
 * Chats router.
 *
 * The procedures are split across `chats-*.ts` modules by feature area
 * (CRUD/lifecycle, sub-chats, diff, name/commit generation, PR, inspection &
 * export) and composed here. The flat procedure names are preserved, so the
 * tRPC API surface (`chats.list`, `chats.create`, …) is unchanged.
 */
export const chatsRouter = router({
  ...chatCrudProcedures,
  ...subChatProcedures,
  ...diffProcedures,
  ...generationProcedures,
  ...prProcedures,
  ...inspectProcedures,
})
