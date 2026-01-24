import { useClerkAuth } from "../lib/hooks/use-clerk-auth"
import { Button } from "./ui/button"
import { Logo } from "./ui/logo"

export function ClerkLoginScreen() {
  const { login, signup, isLoading } = useClerkAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="flex flex-col items-center space-y-4 text-center">
          <Logo className="h-12 w-12" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">kcode</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              AI-Powered Code Assistant
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            onClick={login}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? "Opening browser..." : "Sign In"}
          </Button>

          <Button
            onClick={signup}
            disabled={isLoading}
            variant="outline"
            className="w-full"
            size="lg"
          >
            Create Account
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Your browser will open for secure authentication
        </p>
      </div>
    </div>
  )
}
