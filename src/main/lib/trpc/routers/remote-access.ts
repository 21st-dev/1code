// src/main/lib/trpc/routers/remote-access.ts

import { router, publicProcedure } from "../index"
import {
  enableRemoteAccess,
  disableRemoteAccess,
  getRemoteAccessStatus,
} from "../../remote-access"

export const remoteAccessRouter = router({
  /**
   * Get current remote access status
   */
  getStatus: publicProcedure.query(() => {
    return getRemoteAccessStatus()
  }),

  /**
   * Enable remote access
   */
  enable: publicProcedure.mutation(async () => {
    await enableRemoteAccess()
    return getRemoteAccessStatus()
  }),

  /**
   * Disable remote access
   */
  disable: publicProcedure.mutation(async () => {
    await disableRemoteAccess()
    return getRemoteAccessStatus()
  }),
})
