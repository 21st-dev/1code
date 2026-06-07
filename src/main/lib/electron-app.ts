import * as electron from "electron"

export type ElectronAppLike = {
  isPackaged?: boolean
  getAppPath?: () => string
  getPath: (name: "userData") => string
}

let userDataPathProviderForTest: (() => string) | null = null

export function setElectronUserDataPathProviderForTest(
  provider: (() => string) | null,
): void {
  userDataPathProviderForTest = provider
}

export function getElectronApp(): ElectronAppLike {
  const app = electron.app
  if (!app) {
    throw new Error("Electron app is unavailable in this runtime")
  }
  return app
}

export function getElectronUserDataPath(): string {
  if (userDataPathProviderForTest) {
    return userDataPathProviderForTest()
  }
  return getElectronApp().getPath("userData")
}
