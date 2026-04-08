import type { SelectedProject } from "../atoms"

type ProjectLike = {
  id: string
  name: string
  path: string
  iconPath?: string | null
  updatedAt?: string | Date | null
  gitRemoteUrl?: string | null
  gitProvider?: string | null
  gitOwner?: string | null
  gitRepo?: string | null
}

function normalizeGitProvider(
  gitProvider: string | null | undefined,
): "github" | "gitlab" | "bitbucket" | null {
  if (
    gitProvider === "github" ||
    gitProvider === "gitlab" ||
    gitProvider === "bitbucket"
  ) {
    return gitProvider
  }

  return null
}

export function toSelectedProject(
  project: ProjectLike | null | undefined,
): SelectedProject {
  if (!project) return null

  return {
    id: project.id,
    name: project.name,
    path: project.path,
    iconPath: project.iconPath ?? null,
    updatedAt: project.updatedAt ?? null,
    gitRemoteUrl: project.gitRemoteUrl ?? null,
    gitProvider: normalizeGitProvider(project.gitProvider),
    gitOwner: project.gitOwner ?? null,
    gitRepo: project.gitRepo ?? null,
  }
}

export function getFreshSelectedProject(
  selectedProject: SelectedProject,
  projects: ProjectLike[] | undefined,
  isLoading: boolean,
): SelectedProject {
  if (!selectedProject) return null
  if (isLoading) return selectedProject
  if (!projects) return null

  const project = projects.find((candidate) => candidate.id === selectedProject.id)
  return toSelectedProject(project)
}
