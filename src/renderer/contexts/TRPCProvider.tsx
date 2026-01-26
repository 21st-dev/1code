import { useState, useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ipcLink } from "trpc-electron/renderer"
import { trpc } from "../lib/trpc"
import { LoadingSkeleton } from "../components/ui/loading-skeleton"
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

  const [trpcClient, setTrpcClient] = useState<ReturnType<typeof trpc.createClient> | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [initStatus, setInitStatus] = useState({
    elapsedMs: 0,
    hasElectronTRPC: false,
    hasDesktopApi: false,
  })

  useEffect(() => {
    const startTime = Date.now()
    const hasElectronTRPC = Boolean((window as any).electronTRPC)
    const hasDesktopApi = Boolean((window as any).desktopApi)
    setInitStatus({
      elapsedMs: Date.now() - startTime,
      hasElectronTRPC,
      hasDesktopApi,
    })

    try {
      const client = trpc.createClient({
        links: [ipcLink({ transformer: superjson })],
      })
      setTrpcClient(client)
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  if (error) {
    return (
      <div style={{ padding: "20px", color: "red" }}>
        <h2>TRPC Initialization Error</h2>
        <p>{error.message}</p>
        <p>Please check that the preload script is properly configured.</p>
      </div>
    )
  }

  // Show a lightweight skeleton during initialization to avoid blank screen
  if (!trpcClient) {
    return (
      <div className="relative">
        <LoadingSkeleton label="Connecting to app services…" />
        {import.meta.env.DEV && (
          <div
            style={{
              position: "fixed",
              bottom: 8,
              right: 8,
              zIndex: 99999,
              padding: "6px 8px",
              fontSize: 11,
              borderRadius: 6,
              background: "rgba(0,0,0,0.7)",
              color: "white",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            <div>TRPC init… {initStatus.elapsedMs}ms</div>
            <div>electronTRPC: {String(initStatus.hasElectronTRPC)}</div>
            <div>desktopApi: {String(initStatus.hasDesktopApi)}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
