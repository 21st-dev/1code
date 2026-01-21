import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"

const LightningIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M9.06444 2C8.49628 2 7.97688 2.321 7.72279 2.82918L3.22279 11.8292C2.72412 12.8265 3.44936 14 4.56443 14H7.62982L5.62308 20.1874C5.15109 21.6427 6.90506 22.7879 8.04755 21.7703L21.6899 9.62015C22.7193 8.70329 22.0708 7 20.6922 7H16.7716L18.4086 4.27174C19.0084 3.27196 18.2883 2 17.1223 2H9.06444Z"
      fill="currentColor"
    />
  </svg>
)

export function NetworkStatus() {
  const { data } = trpc.ollama.getStatus.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const online = data?.internet.online ?? true

  if (online) {
    return null // Don't show anything when online
  }

  return (
    <div className="flex items-center gap-1.5">
      <LightningIcon className="w-3 h-3 text-orange-500" />
      <span className="text-xs text-muted-foreground">
        Offline
      </span>
    </div>
  )
}
