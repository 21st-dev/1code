/**
 * Legacy remote web backend bridge.
 * OpenCodex local-native mode does not expose cloud-signed desktop fetch.
 */
import { createTRPCClient, httpLink } from "@trpc/client"
import type { AppRouter } from "../../../../web/server/api/root"
import SuperJSON from "superjson"

const REMOTE_TRPC_PLACEHOLDER = "/__removed__/remote-trpc"

const removedRemoteFetch: typeof fetch = async (input, init) => {
  void input
  void init
  throw new Error(
    "OpenCodex local-native mode removed the legacy remote cloud bridge.",
  )
}

export const remoteTrpc = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: REMOTE_TRPC_PLACEHOLDER,
      fetch: removedRemoteFetch,
      transformer: SuperJSON,
    }),
  ],
})
