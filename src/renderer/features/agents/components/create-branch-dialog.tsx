"use client"

import { useState, useEffect, useMemo } from "react"
import { toast } from "sonner"
import { GitBranch, ChevronDown, Check } from "lucide-react"
import {
  Dialog,
  CanvasDialogContent,
  CanvasDialogHeader,
  CanvasDialogBody,
  CanvasDialogFooter,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../../../components/ui/command"
import { IconSpinner } from "../../../components/ui/icons"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { formatTimeAgo } from "../utils/format-time-ago"

interface CreateBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPath: string
  branches: Array<{
    name: string
    isDefault: boolean
    committedAt: string | null
    protected?: boolean
  }>
  defaultBranch: string
  onBranchCreated: (branchName: string) => void
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  projectPath,
  branches,
  defaultBranch,
  onBranchCreated,
}: CreateBranchDialogProps) {
  const [branchName, setBranchName] = useState("")
  const [baseBranch, setBaseBranch] = useState(defaultBranch)
  const [baseBranchOpen, setBaseBranchOpen] = useState(false)
  const [baseBranchSearch, setBaseBranchSearch] = useState("")

  // Reset baseBranch when defaultBranch changes
  useEffect(() => {
    setBaseBranch(defaultBranch)
  }, [defaultBranch])

  // Reset search when popover closes
  useEffect(() => {
    if (!baseBranchOpen) {
      setBaseBranchSearch("")
    }
  }, [baseBranchOpen])

  // Filter branches based on search (limit to 50 for performance)
  const filteredBaseBranches = useMemo(() => {
    let filtered = branches
    if (baseBranchSearch.trim()) {
      const search = baseBranchSearch.toLowerCase()
      filtered = branches.filter((b) => b.name.toLowerCase().includes(search))
    }
    return filtered.slice(0, 50)
  }, [branches, baseBranchSearch])

  const utils = trpc.useUtils()

  const createBranchMutation = trpc.changes.createBranch.useMutation({
    onSuccess: (data: { branchName: string }) => {
      toast.success(`Branch '${data.branchName}' created successfully`)
      // Invalidate branches query to refresh the list
      utils.changes.getBranches.invalidate({ worktreePath: projectPath })
      onBranchCreated(data.branchName)
      onOpenChange(false)
      setBranchName("")
      setBaseBranch(defaultBranch)
    },
    onError: (error: { message: string }) => {
      toast.error(`Failed to create branch: ${error.message}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!branchName.trim()) {
      toast.error("Branch name is required")
      return
    }

    // Basic validation for branch name
    if (!/^[a-zA-Z0-9._/-]+$/.test(branchName)) {
      toast.error(
        "Branch name can only contain letters, numbers, dots, hyphens, underscores, and slashes",
      )
      return
    }

    createBranchMutation.mutate({
      projectPath,
      branchName: branchName.trim(),
      baseBranch,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent className="sm:max-w-[350px] overflow-visible">
        <CanvasDialogHeader>
          <DialogTitle>Create a Branch</DialogTitle>
        </CanvasDialogHeader>

        <CanvasDialogBody className="space-y-4">
          {/* Branch Name Input */}
          <div className="space-y-2">
            <Label htmlFor="branch-name" className="text-sm">
              Name
            </Label>
            <Input
              id="branch-name"
              placeholder="feature/my-new-feature"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  branchName.trim() &&
                  !createBranchMutation.isPending
                ) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              autoFocus
              disabled={createBranchMutation.isPending}
              className="h-9"
            />
          </div>

          {/* Base Branch Selection with Search */}
          <div className="space-y-2">
            <Label className="text-sm">Create branch based on...</Label>
            {/* Using Popover WITHOUT Portal so it renders inside Dialog's DOM tree */}
            <PopoverPrimitive.Root
              open={baseBranchOpen}
              onOpenChange={setBaseBranchOpen}
            >
              <PopoverPrimitive.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-background px-3 py-2 text-sm shadow-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  disabled={createBranchMutation.isPending}
                >
                  <span className="truncate">{baseBranch}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverPrimitive.Trigger>
              {/* NO Portal wrapper - content renders inside Dialog */}
              <PopoverPrimitive.Content
                className="z-50 w-full rounded-[10px] bg-popover p-0 text-sm text-popover-foreground shadow-lg border border-border outline-none dark data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                align="start"
                sideOffset={4}
                style={{ width: "var(--radix-popover-trigger-width)" }}
              >
                <Command>
                  <CommandInput
                    placeholder="Search branches..."
                    value={baseBranchSearch}
                    onValueChange={setBaseBranchSearch}
                  />
                  <CommandList className="max-h-[200px]">
                    {filteredBaseBranches.length === 0 ? (
                      <CommandEmpty>No branches found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredBaseBranches.map((branch) => (
                          <CommandItem
                            key={branch.name}
                            value={branch.name}
                            onSelect={() => {
                              setBaseBranch(branch.name)
                              setBaseBranchOpen(false)
                            }}
                            className="gap-2 cursor-pointer"
                          >
                            <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1">{branch.name}</span>
                            {branch.committedAt && (
                              <span className="text-xs text-muted-foreground/70 shrink-0">
                                {formatTimeAgo(branch.committedAt)}
                              </span>
                            )}
                            {baseBranch === branch.name && (
                              <Check className="h-4 w-4 shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Root>
          </div>
        </CanvasDialogBody>

        <CanvasDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createBranchMutation.isPending}
            className="transition-transform duration-150 active:scale-[0.97] rounded-md"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={(e) => handleSubmit(e)}
            disabled={!branchName.trim() || createBranchMutation.isPending}
            className="transition-transform duration-150 active:scale-[0.97] rounded-md"
          >
            {createBranchMutation.isPending ? (
              <>
                <IconSpinner className="w-4 h-4 mr-2" />
                Creating...
              </>
            ) : (
              "Create Branch"
            )}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
