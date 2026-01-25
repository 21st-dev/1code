import { useState, useEffect } from "react"
import { Plus, Trash2, Edit2, Eye, EyeOff, Key } from "lucide-react"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner } from "../../../icons"
import { toast } from "sonner"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"

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

type Credential = {
  id: string
  label: string
  email: string
  domain: string | null
}

type FormData = {
  label: string
  email: string
  password: string
  domain: string
}

const emptyFormData: FormData = {
  label: "",
  email: "",
  password: "",
  domain: "",
}

export function AgentsDevAccountsTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyFormData)
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Fetch credentials list
  const { data: credentials, isLoading, refetch } = trpc.devCredentials.list.useQuery()

  // Mutations
  const createMutation = trpc.devCredentials.create.useMutation({
    onSuccess: () => {
      toast.success("Credential saved")
      setShowAddForm(false)
      setFormData(emptyFormData)
      setShowPassword(false)
      refetch()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save credential")
    },
  })

  const updateMutation = trpc.devCredentials.update.useMutation({
    onSuccess: () => {
      toast.success("Credential updated")
      setEditingId(null)
      setFormData(emptyFormData)
      setShowPassword(false)
      refetch()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update credential")
    },
  })

  const deleteMutation = trpc.devCredentials.delete.useMutation({
    onSuccess: () => {
      toast.success("Credential deleted")
      refetch()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete credential")
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          label: formData.label,
          email: formData.email,
          password: formData.password || undefined,
          domain: formData.domain || null,
        })
      } else {
        await createMutation.mutateAsync({
          label: formData.label,
          email: formData.email,
          password: formData.password,
          domain: formData.domain || undefined,
        })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (cred: Credential) => {
    setEditingId(cred.id)
    setFormData({
      label: cred.label,
      email: cred.email,
      password: "", // Don't prefill password for security
      domain: cred.domain || "",
    })
    setShowAddForm(true)
    setShowPassword(false)
  }

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync({ id })
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingId(null)
    setFormData(emptyFormData)
    setShowPassword(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        {!isNarrowScreen && (
          <div className="flex items-center justify-between pb-3 mb-4">
            <h3 className="text-sm font-medium text-foreground">Dev Accounts</h3>
          </div>
        )}

        {/* Description */}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-foreground font-medium">
                  Development Login Credentials
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Save login credentials for development servers. Use these to quickly fill login forms in the preview sidebar.
                  Credentials are encrypted using your system keychain.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Credentials List */}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {credentials && credentials.length > 0 ? (
            <div className="divide-y divide-border">
              {credentials.map((cred) => (
                <div
                  key={cred.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {cred.label}
                      </span>
                      {cred.domain && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {cred.domain}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {cred.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(cred)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(cred.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : !showAddForm ? (
            <div className="p-8 text-center">
              <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No dev accounts configured
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="mt-3"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Account
              </Button>
            </div>
          ) : null}

          {/* Add button when list is not empty */}
          {credentials && credentials.length > 0 && !showAddForm && (
            <div className="p-3 bg-muted border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Account
              </Button>
            </div>
          )}
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <form onSubmit={handleSubmit}>
              <div className="p-4 space-y-4">
                <h4 className="text-sm font-medium">
                  {editingId ? "Edit Account" : "New Account"}
                </h4>

                {/* Label */}
                <div className="space-y-1.5">
                  <Label htmlFor="label" className="text-xs">
                    Label
                  </Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, label: e.target.value }))
                    }
                    placeholder="e.g., Test User, Admin Account"
                    required
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">
                    Email / Username
                  </Label>
                  <Input
                    id="email"
                    type="text"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, email: e.target.value }))
                    }
                    placeholder="user@example.com"
                    required
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs">
                    Password{editingId && " (leave blank to keep current)"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData((d) => ({ ...d, password: e.target.value }))
                      }
                      placeholder={editingId ? "••••••••" : "Enter password"}
                      required={!editingId}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Domain (optional) */}
                <div className="space-y-1.5">
                  <Label htmlFor="domain" className="text-xs">
                    Domain (optional)
                  </Label>
                  <Input
                    id="domain"
                    value={formData.domain}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, domain: e.target.value }))
                    }
                    placeholder="e.g., localhost:3000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Filter credentials by domain in the preview
                  </p>
                </div>
              </div>

              {/* Form Footer */}
              <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="text-xs"
                >
                  <div className="flex items-center gap-2">
                    {isSaving && (
                      <IconSpinner className="h-3.5 w-3.5 text-current" />
                    )}
                    {editingId ? "Update" : "Save"}
                  </div>
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
