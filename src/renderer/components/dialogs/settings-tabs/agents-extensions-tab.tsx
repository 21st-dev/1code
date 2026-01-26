import { useState } from "react"

export function AgentsExtensionsTab() {
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Extensions</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Manage VS Code extensions for your projects.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 border border-border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Extension management is coming soon. This feature will allow you to install, update, and manage VS Code extensions for your projects.
          </p>
        </div>
      </div>
    </div>
  )
}
