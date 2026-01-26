import { useState, useMemo, useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ipcLink } from "trpc-electron/renderer"
import { trpc } from "../lib/trpc"
import superjson from "superjson"

interface TRPCProviderProps {
  children: React.ReactNode
}

// Global query client instance for use outside React components
let globalQueryClient: QueryClient | null = null

export function getQueryClient(): QueryClient | null {
  return globalQueryClient
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  const [isReady, setIsReady] = useState(false)

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

  // Wait for electronTRPC to be available
  useEffect(() => {
    const checkElectronTRPC = () => {
      if ((window as any).electronTRPC) {
        setIsReady(true)
      } else {
        // Retry after a short delay
        setTimeout(checkElectronTRPC, 10)
      }
    }
    checkElectronTRPC()
  }, [])

  // Create TRPC client only after electronTRPC is ready
  const { trpcClient, error } = useMemo(() => {
    if (!isReady) {
      return { trpcClient: null, error: null }
    }

    try {
      const client = trpc.createClient({
        links: [ipcLink({ transformer: superjson })],
      })
      return { trpcClient: client, error: null }
    } catch (err) {
      console.error("[TRPCProvider] Failed to create client:", err)
      return { trpcClient: null, error: err as Error }
    }
  }, [isReady])

  if (!isReady || !trpcClient) {
    if (error) {
      return (
        <div style={{ padding: "20px", color: "red" }}>
          <h2>TRPC Initialization Error</h2>
          <p>{error?.message || "Failed to create TRPC client"}</p>
          <p>Please check that the preload script is properly configured.</p>
        </div>
      )
    }
    // Still loading
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Initializing...</p>
      </div>
    )
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
