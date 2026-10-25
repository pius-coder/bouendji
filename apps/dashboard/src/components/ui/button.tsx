import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Bouton unique (D108) : taxonomie du kit Apple, mesures Chariow.
 * Prominent (défaut) = noir · Bordered = contour #cdd0d4 · Bordered Tinted =
 * couleur du thème (seul usage de la primaire sur un bouton) · Destructive.
 * Tailles Chariow : page 40 px rayon 12 ; compact 32 px rayon 8, 12/600.
 * Cible tactile 44 px sous 640 px.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap transition-[background,color,box-shadow,transform] duration-150 outline-none select-none active:scale-[0.98] focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        prominent: "bg-primary text-primary-foreground hover:bg-primary-hover",
        dark: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive: "bg-destructive-solid text-white hover:brightness-95",
        outline: "border border-control-border bg-transparent text-foreground hover:bg-group",
        tinted: "border border-accent-text/30 bg-accent-soft text-accent-text hover:border-accent-text/50",
        secondary: "bg-group text-foreground hover:bg-group-strong",
        ghost: "text-foreground hover:bg-group",
        link: "h-auto px-0 text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 rounded-xl px-4 text-subhead sm:min-h-10 [&_svg:not([class*='size-'])]:size-[1.125rem]",
        lg: "min-h-12 rounded-xl px-6 text-callout [&_svg:not([class*='size-'])]:size-5",
        sm: "min-h-11 gap-1.5 rounded-md px-3 text-caption-1 sm:min-h-8 [&_svg:not([class*='size-'])]:size-4",
        xs: "h-7 gap-1 rounded-md px-2.5 text-caption-1 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-11 rounded-full sm:size-9 [&_svg:not([class*='size-'])]:size-[1.125rem]",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-11 rounded-full sm:size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11 rounded-full [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
