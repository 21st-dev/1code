import { useState, useMemo } from "react"
import { useAtom } from "jotai"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../../components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import { IconChevronDown, CheckIcon, FolderPlusIcon, GitHubIcon } from "../../../components/ui/icons"
import { ProjectIcon } from "../../../components/ui/project-icon"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom } from "../atoms"
import { useI18n } from "../../../lib/i18n"

export function ProjectSelector() {
  const { t } = useI18n()
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")

  // Fetch projects from DB
  const { data: projects, isLoading: isLoadingProjects } = trpc.projects.list.useQuery()

  // Filter projects by search query
  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (!searchQuery.trim()) return projects
    const query = searchQuery.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.path.toLowerCase().includes(query),
    )
  }, [projects, searchQuery])

  // Get tRPC utils for cache management
  const utils = trpc.useUtils()

  // Open folder mutation
  const openFolder = trpc.projects.openFolder.useMutation({
    onSuccess: (project) => {
      if (project) {
        // Optimistically update the projects list cache to prevent validation failures
        utils.projects.list.setData(undefined, (oldData) => {
          if (!oldData) return [project]
          const exists = oldData.some((p) => p.id === project.id)
          if (exists) {
            return oldData.map((p) =>
              p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p,
            )
          }
          return [project, ...oldData]
        })

        setSelectedProject({
          id: project.id,
          name: project.name,
          path: project.path,
          gitRemoteUrl: project.gitRemoteUrl,
          gitProvider: project.gitProvider as
            | "github"
            | "gitlab"
            | "bitbucket"
            | null,
          gitOwner: project.gitOwner,
          gitRepo: project.gitRepo,
        })
      }
    },
  })

  // Clone from GitHub mutation
  const cloneFromGitHub = trpc.projects.cloneFromGitHub.useMutation({
    onSuccess: (project) => {
      if (project) {
        utils.projects.list.setData(undefined, (oldData) => {
          if (!oldData) return [project]
          const exists = oldData.some((p) => p.id === project.id)
          if (exists) {
            return oldData.map((p) =>
              p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p,
            )
          }
          return [project, ...oldData]
        })

        setSelectedProject({
          id: project.id,
          name: project.name,
          path: project.path,
          gitRemoteUrl: project.gitRemoteUrl,
          gitProvider: project.gitProvider as
            | "github"
            | "gitlab"
            | "bitbucket"
            | null,
          gitOwner: project.gitOwner,
          gitRepo: project.gitRepo,
        })
        setGithubDialogOpen(false)
        setGithubUrl("")
      }
    },
  })

  const handleOpenFolder = async () => {
    setOpen(false)
    await openFolder.mutateAsync()
  }

  const handleCloneFromGitHub = async () => {
    if (!githubUrl.trim()) return
    await cloneFromGitHub.mutateAsync({ repoUrl: githubUrl.trim() })
  }

  const handleSelectProject = (projectId: string) => {
    const project = projects?.find((p) => p.id === projectId)
    if (project) {
      setSelectedProject({
        id: project.id,
        name: project.name,
        path: project.path,
        gitRemoteUrl: project.gitRemoteUrl,
        gitProvider: project.gitProvider as
          | "github"
          | "gitlab"
          | "bitbucket"
          | null,
        gitOwner: project.gitOwner,
        gitRepo: project.gitRepo,
      })
      setOpen(false)
    }
  }

  // Validate selected project still exists and use latest DB data (e.g. renamed project)
  // While loading, trust localStorage value to prevent showing "Select repo" on app restart
  const validSelection = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB and use fresh data
    if (!projects) return null
    const dbProject = projects.find((p) => p.id === selectedProject.id)
    if (!dbProject) return null
    return {
      ...selectedProject,
      name: dbProject.name,
    }
  }, [selectedProject, projects, isLoadingProjects])

  // If no projects exist and none selected - show direct "Add repository" button
  if (!validSelection && (!projects || projects.length === 0) && !isLoadingProjects) {
    return (
      <button
        onClick={handleOpenFolder}
        disabled={openFolder.isPending}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
      >
        <FolderPlusIcon className="h-3.5 w-3.5" />
        <span>
          {openFolder.isPending
            ? t("agent.project.adding")
            : t("agent.project.addRepository")}
        </span>
      </button>
    )
  }

  return (
    <>
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) setSearchQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
          type="button"
        >
          <ProjectIcon
            project={validSelection}
            className="h-4 w-4"
          />
          <span className="truncate max-w-[120px]">
            {validSelection?.name || t("chat.selectRepo")}
          </span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("agent.project.searchRepos")}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
            {isLoadingProjects ? (
              <div className="px-2.5 py-4 text-center text-sm text-muted-foreground">
                {t("agent.project.loading")}
              </div>
            ) : filteredProjects.length > 0 ? (
              <CommandGroup>
                {filteredProjects.map((project) => {
                  const isSelected = validSelection?.id === project.id
                  return (
                    <CommandItem
                      key={project.id}
                      value={`${project.name} ${project.path}`}
                      onSelect={() => handleSelectProject(project.id)}
                      className="gap-2"
                    >
                      <ProjectIcon
                        project={project}
                        className="h-4 w-4"
                      />
                      <span className="truncate flex-1">{project.name}</span>
                      {isSelected && (
                        <CheckIcon className="h-4 w-4 shrink-0" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : (
              <CommandEmpty>{t("agent.project.noProjectsFound")}</CommandEmpty>
            )}
          </CommandList>
          <div className="border-t border-border/50 py-1">
            <button
              onClick={handleOpenFolder}
              disabled={openFolder.isPending}
              className="flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] rounded-md text-sm cursor-default select-none outline-none dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
            >
              <FolderPlusIcon className="h-4 w-4 text-muted-foreground" />
              <span>
                {openFolder.isPending
                  ? t("agent.project.adding")
                  : t("agent.project.addRepository")}
              </span>
            </button>
            <button
              onClick={() => {
                setOpen(false)
                setGithubDialogOpen(true)
              }}
              className="flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] rounded-md text-sm cursor-default select-none outline-none dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
            >
              <GitHubIcon className="h-4 w-4 text-muted-foreground" />
              <span>{t("agent.project.addFromGitHub")}</span>
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>

    <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
      <DialogContent className="w-[400px] p-0 gap-0 overflow-hidden">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleCloneFromGitHub()
          }}
        >
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">
              {t("agent.project.cloneFromGitHub")}
            </h2>
            <Input
              placeholder={t("agent.project.clonePlaceholder")}
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="w-full h-11 text-sm"
              autoFocus
            />
          </div>
          <div className="bg-muted p-4 flex justify-between border-t border-border">
            <Button
              type="button"
              onClick={() => setGithubDialogOpen(false)}
              variant="ghost"
              className="rounded-md"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!githubUrl.trim() || cloneFromGitHub.isPending}
              variant="default"
              className="rounded-md"
            >
              {cloneFromGitHub.isPending
                ? t("agent.project.cloning")
                : t("agent.project.clone")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}
