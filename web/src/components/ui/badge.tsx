import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary/15 text-primary border border-primary/25",
        secondary:
          "bg-zinc-800 text-zinc-300 border border-zinc-700",
        destructive:
          "bg-red-500/15 text-red-400 border border-red-500/25",
        success:
          "bg-green-500/15 text-green-400 border border-green-500/25",
        warning:
          "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25",
        outline:
          "text-zinc-300 border border-zinc-700",
        // Matte variants (keeping names for compatibility)
        glass:
          "bg-zinc-800 text-zinc-300 border border-zinc-700",
        "glass-primary":
          "bg-vif-accent/15 text-vif-accent-bright border border-vif-accent/25",
        "glass-success":
          "bg-green-500/15 text-green-400 border border-green-500/25",
        "glass-warning":
          "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25",
        "glass-danger":
          "bg-red-500/15 text-red-400 border border-red-500/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
