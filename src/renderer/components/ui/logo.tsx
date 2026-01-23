import * as React from "react"
import { cn } from "../../lib/utils"
// @ts-ignore
import logoPng from "../../icons/logo.png"

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string
  fill?: string // Kept for backward compatibility but unused
}

export function Logo({ className, fill, ...props }: LogoProps) {
  return (
    <img
      src={logoPng}
      className={cn("object-contain", className)}
      alt="kcode"
      {...props}
    />
  )
}
