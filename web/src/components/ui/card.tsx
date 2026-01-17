import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-lg text-card-foreground",
  {
    variants: {
      variant: {
        default: "bg-zinc-900 border border-zinc-800",
        glass: [
          "bg-zinc-900 border border-zinc-800",
          // Subtle 1px top highlight for depth
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
        ],
        "glass-elevated": [
          "bg-zinc-900 border border-zinc-800 shadow-xl",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03),0_25px_50px_-12px_rgba(0,0,0,0.5)]",
        ],
        "glass-interactive": [
          "bg-zinc-900/80",
          "border border-zinc-800",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
          "transition-colors duration-150",
          "hover:bg-zinc-800 hover:border-zinc-700",
          "cursor-pointer",
        ],
        surface: "bg-zinc-900/60 border border-zinc-800/80",
      },
    },
    defaultVariants: {
      variant: "glass",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
