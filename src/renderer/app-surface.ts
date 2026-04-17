export type AppSurface =
  | "backend-setup"
  | "select-repo"
  | "agents-layout"

export function getAppSurface(params: {
  hasBackendConfiguration: boolean
  hasValidatedProject: boolean
  isProjectsLoading: boolean
}): AppSurface {
  const {
    hasBackendConfiguration,
    hasValidatedProject,
    isProjectsLoading,
  } = params

  if (!hasBackendConfiguration) {
    return "backend-setup"
  }

  if (!hasValidatedProject && !isProjectsLoading) {
    return "select-repo"
  }

  return "agents-layout"
}
