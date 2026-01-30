"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Loader2, Check, X, Trash2, Eye, EyeOff } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

// Status indicator
function ConnectionStatus({ isConnected, hasCredentials }: { isConnected: boolean; hasCredentials: boolean }) {
  if (!hasCredentials) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
        <span className="text-sm text-muted-foreground">Not configured</span>
      </div>
    )
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-sm text-emerald-500">Connected</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      <span className="text-sm text-amber-500">Disconnected</span>
    </div>
  )
}

export function AgentsDataConnectionsTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    account: "",
    username: "",
    password: "",
    role: "",
    warehouse: "",
    database: "",
    schema: "",
    name: "",
  })

  // Get connection status
  const { data: status, refetch: refetchStatus } = trpc.snowflake.getStatus.useQuery()

  // Get saved connection
  const { data: connection, refetch: refetchConnection } = trpc.snowflake.getConnection.useQuery()

  // Mutations
  const saveConnectionMutation = trpc.snowflake.saveConnection.useMutation()
  const testConnectionMutation = trpc.snowflake.testConnection.useMutation()
  const deleteConnectionMutation = trpc.snowflake.deleteConnection.useMutation()

  // Populate form with saved connection data
  useEffect(() => {
    if (connection) {
      setFormData({
        account: connection.account || "",
        username: connection.username || "",
        password: "", // Don't populate password for security
        role: connection.role || "",
        warehouse: connection.warehouse || "",
        database: connection.database || "",
        schema: connection.schema || "",
        name: connection.name || "",
      })
    }
  }, [connection])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    if (!formData.account || !formData.username || !formData.password) {
      toast.error("Account, username, and password are required")
      return
    }

    setIsSaving(true)
    try {
      const result = await saveConnectionMutation.mutateAsync(formData)
      if (result.success) {
        toast.success("Connection saved and verified")
        await refetchStatus()
        await refetchConnection()
      } else {
        toast.error(result.error || "Failed to save connection")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save connection"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    try {
      const result = await testConnectionMutation.mutateAsync()
      if (result.success) {
        toast.success("Connection successful")
        await refetchStatus()
      } else {
        toast.error(result.error || "Connection failed")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed"
      toast.error(message)
    } finally {
      setIsTesting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteConnectionMutation.mutateAsync()
      if (result.success) {
        toast.success("Connection deleted")
        setFormData({
          account: "",
          username: "",
          password: "",
          role: "",
          warehouse: "",
          database: "",
          schema: "",
          name: "",
        })
        await refetchStatus()
        await refetchConnection()
      } else {
        toast.error(result.error || "Failed to delete connection")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete connection"
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  const hasChanges = connection
    ? formData.account !== connection.account ||
      formData.username !== connection.username ||
      formData.password !== "" ||
      formData.role !== (connection.role || "") ||
      formData.warehouse !== (connection.warehouse || "") ||
      formData.database !== (connection.database || "") ||
      formData.schema !== (connection.schema || "") ||
      formData.name !== (connection.name || "")
    : formData.account || formData.username || formData.password

  return (
    <div className="p-6 space-y-6 h-full">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Data Connections</h3>
          <p className="text-xs text-muted-foreground">
            Connect to external databases for Claude to query.
          </p>
        </div>
      )}

      {/* Snowflake Connection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">Snowflake</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect to your Snowflake data warehouse
            </p>
          </div>
          <ConnectionStatus
            isConnected={status?.isConnected || false}
            hasCredentials={status?.hasCredentials || false}
          />
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Connection Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs text-muted-foreground">
                Connection Name (optional)
              </Label>
              <Input
                id="name"
                name="name"
                placeholder="My Snowflake Connection"
                value={formData.name}
                onChange={handleInputChange}
                className="h-8"
              />
            </div>

            {/* Account */}
            <div className="space-y-1.5">
              <Label htmlFor="account" className="text-xs text-muted-foreground">
                Account <span className="text-red-500">*</span>
              </Label>
              <Input
                id="account"
                name="account"
                placeholder="xy12345.us-east-1"
                value={formData.account}
                onChange={handleInputChange}
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Your Snowflake account identifier (e.g., xy12345.us-east-1)
              </p>
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs text-muted-foreground">
                Username <span className="text-red-500">*</span>
              </Label>
              <Input
                id="username"
                name="username"
                placeholder="your_username"
                value={formData.username}
                onChange={handleInputChange}
                className="h-8"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-muted-foreground">
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={connection ? "••••••••" : "Enter password"}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="h-8 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {connection && (
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep existing password
                </p>
              )}
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-xs text-muted-foreground">
                Role
              </Label>
              <Input
                id="role"
                name="role"
                placeholder="ACCOUNTADMIN"
                value={formData.role}
                onChange={handleInputChange}
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Snowflake role to use (e.g., ACCOUNTADMIN, SYSADMIN, PUBLIC)
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Optional defaults (can be changed per query)
              </p>
            </div>

            {/* Warehouse */}
            <div className="space-y-1.5">
              <Label htmlFor="warehouse" className="text-xs text-muted-foreground">
                Warehouse
              </Label>
              <Input
                id="warehouse"
                name="warehouse"
                placeholder="COMPUTE_WH"
                value={formData.warehouse}
                onChange={handleInputChange}
                className="h-8"
              />
            </div>

            {/* Database */}
            <div className="space-y-1.5">
              <Label htmlFor="database" className="text-xs text-muted-foreground">
                Database
              </Label>
              <Input
                id="database"
                name="database"
                placeholder="MY_DATABASE"
                value={formData.database}
                onChange={handleInputChange}
                className="h-8"
              />
            </div>

            {/* Schema */}
            <div className="space-y-1.5">
              <Label htmlFor="schema" className="text-xs text-muted-foreground">
                Schema
              </Label>
              <Input
                id="schema"
                name="schema"
                placeholder="PUBLIC"
                value={formData.schema}
                onChange={handleInputChange}
                className="h-8"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 p-4 border-t border-border bg-muted/30">
            <div>
              {connection && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {status?.hasCredentials && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : status?.isConnected ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <X className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {connection ? "Update" : "Save"} & Connect
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded space-y-2">
        <p className="font-medium">How it works:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Your credentials are encrypted using your OS keychain</li>
          <li>Claude can query your Snowflake database when you ask</li>
          <li>Use the Schema Browser widget to explore your data</li>
          <li>Ask Claude things like "Show me the top 10 customers by revenue"</li>
        </ul>
      </div>
    </div>
  )
}
