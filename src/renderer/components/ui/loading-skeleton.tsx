export function LoadingSkeleton({ label = "Loading 1Code…" }: { label?: string }) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="space-y-4 w-full max-w-md p-4">
        <div
          className="text-center text-sm text-muted-foreground"
          style={{
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          {label}
        </div>
        {/* Header skeleton */}
        <div className="h-16 bg-muted animate-pulse rounded-lg" />

        {/* Content skeleton */}
        <div className="space-y-3">
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
        </div>

        {/* Footer skeleton */}
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
      </div>
    </div>
  )
}
