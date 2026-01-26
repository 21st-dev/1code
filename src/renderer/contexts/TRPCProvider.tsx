import { useState, useEffect } from "react"
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

/**
 * Wait for electronTRPC to be available (preload script may not have finished)
 */
function waitForElectronTRPC(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Window is not available"))
      return
    }

    // Check if already available (most common case)
    if ((window as any).electronTRPC) {
      resolve()
      return
    }

    // Wait for it to become available (with timeout)
    const maxWait = 2000 // 2 seconds (reduced from 5)
    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      if ((window as any).electronTRPC) {
        clearInterval(checkInterval)
        resolve()
      } else if (Date.now() - startTime > maxWait) {
        clearInterval(checkInterval)
        console.error("[TRPCProvider] Timeout waiting for electronTRPC")
        console.error("[TRPCProvider] window.electronTRPC:", (window as any).electronTRPC)
        console.error("[TRPCProvider] window.desktopApi:", (window as any).desktopApi)
        reject(
          new Error(
            "Could not find `electronTRPC` global after waiting. Check that `exposeElectronTRPC` has been called in your preload file."
          )
        )
      }
    }, 10)
  })
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

  useEffect(() => {
    waitForElectronTRPC()
      .then(() => {
        const client = trpc.createClient({
          links: [ipcLink({ transformer: superjson })],
        })
        setTrpcClient(client)
      })
      .catch((err) => {
        setError(err)
      })
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

  // Return null during initialization to avoid showing loading message
  // The initialization is typically very fast (<100ms), so users won't see a flash
  if (!trpcClient) {
    return null
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
