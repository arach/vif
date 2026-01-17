import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "glass"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg px-3 py-1 text-sm transition-all duration-200",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variant === "glass" && [
            "bg-white/[0.04] backdrop-blur-sm",
            "border border-white/[0.08]",
            "hover:bg-white/[0.06] hover:border-white/[0.12]",
            "focus:bg-white/[0.06] focus:border-vif-accent/50",
            "shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.02)]",
          ],
          variant === "default" && [
            "bg-input border border-input",
            "focus:border-primary",
          ],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
