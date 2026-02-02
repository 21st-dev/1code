import { useState, useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { trpc } from "../lib/trpc"
import superjson from "superjson"
import { wsLink } from "../lib/remote-transport/ws-link"

interface TRPCProviderProps {
  children: React.ReactNode
}

// Global query client instance for use outside React components
let globalQueryClient: QueryClient | null = null

export function getQueryClient(): QueryClient | null {
  return globalQueryClient
}

/**
 * Check if we're in remote/browser mode (no electronTRPC global)
 * Must be called at runtime, not at module load time
 */
function checkIsRemoteMode(): boolean {
  // @ts-ignore
  return typeof window !== "undefined" && !window.electronTRPC
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5000,
          refetchOnWindowFocus: false,
          networkMode: "always",
          retry: false,
        },
        mutations: {
          networkMode: "always",
          retry: false,
        },
      },
    })
    globalQueryClient = client
    return client
  })

  // Combine loading and client state to ensure atomic updates
  const [state, setState] = useState<{
    isLoading: boolean
    trpcClient: ReturnType<typeof trpc.createClient> | null
  }>({
    isLoading: true,
    trpcClient: null,
  })

  // Log render state
  console.log("[TRPCProvider] Render - isLoading:", state.isLoading, "trpcClient:", state.trpcClient)

  useEffect(() => {
    let mounted = true

    async function initClient() {
      try {
        let link: any

        // Check at runtime to ensure electronTRPC has been set by preload
        const isRemote = checkIsRemoteMode()
        console.log("[TRPCProvider] isRemote:", isRemote, "electronTRPC:", !!(window as any).electronTRPC)

        if (isRemote) {
          // Browser mode - use WebSocket link
          link = wsLink()
        } else {
          // Electron mode - dynamically import ipcLink
          console.log("[TRPCProvider] Loading ipcLink...")
          const module = await import("trpc-electron/renderer")
          console.log("[TRPCProvider] ipcLink module loaded:", module)
          link = module.ipcLink({ transformer: superjson })
          console.log("[TRPCProvider] ipcLink created:", link)
        }

        console.log("[TRPCProvider] Creating trpc client...")
        const client = trpc.createClient({ links: [link] })
        console.log("[TRPCProvider] Client created:", client)

        if (mounted) {
          setState({ isLoading: false, trpcClient: client })
          console.log("[TRPCProvider] State updated with client")
        }
      } catch (error) {
        console.error("[TRPCProvider] Error initializing client:", error)
        if (mounted) {
          setState((prev) => ({ ...prev, isLoading: false }))
        }
      }
    }

    initClient()

    return () => {
      mounted = false
    }
  }, [])

  // Show loading state while initializing client
  if (state.isLoading || !state.trpcClient) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Connecting...</div>
      </div>
    )
  }

  return (
    <trpc.Provider client={state.trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
