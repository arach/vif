import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-zinc-700 bg-transparent hover:bg-zinc-800 hover:border-zinc-600",
        secondary:
          "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
        ghost:
          "hover:bg-zinc-800 hover:text-white",
        link:
          "text-primary underline-offset-4 hover:underline",
        // Matte variants with subtle highlights
        glass:
          "bg-zinc-800 border border-zinc-700 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] hover:bg-zinc-700 hover:border-zinc-600",
        "glass-primary":
          "bg-vif-accent/15 border border-vif-accent/25 text-vif-accent-bright shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:bg-vif-accent/25 hover:border-vif-accent/35",
        "glass-danger":
          "bg-vif-danger/15 border border-vif-danger/25 text-red-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:bg-vif-danger/25 hover:border-vif-danger/35",
        "glass-success":
          "bg-vif-success/15 border border-vif-success/25 text-green-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:bg-vif-success/25 hover:border-vif-success/35",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        xl: "h-12 rounded-lg px-10 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
