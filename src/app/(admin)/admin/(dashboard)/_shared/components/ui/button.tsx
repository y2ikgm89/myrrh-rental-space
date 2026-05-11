import { Slot as SlotPrimitive } from "radix-ui";
import { tv, type VariantProps } from "tailwind-variants";

import { cn } from "@/shared/lib/cn";

const buttonVariants = tv({
  base: [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    // Swiss Design: 微細なホバー時の上昇感
    "active:scale-[0.98]",
  ],
  variants: {
    variant: {
      default: [
        "bg-primary text-primary-foreground",
        "shadow-sm hover:shadow-md",
        "hover:bg-primary/90 hover:-translate-y-px",
      ],
      destructive: [
        "bg-destructive text-destructive-foreground",
        "shadow-sm hover:shadow-md",
        "hover:bg-destructive/90 hover:-translate-y-px",
      ],
      "destructive-ghost": [
        "text-destructive bg-transparent",
        "hover:bg-destructive/10 hover:text-destructive",
      ],
      outline: [
        "border border-input bg-background",
        "shadow-sm hover:shadow-md",
        "hover:bg-accent hover:text-accent-foreground hover:border-accent",
      ],
      secondary: [
        "bg-secondary text-secondary-foreground",
        "shadow-sm",
        "hover:bg-secondary/80",
      ],
      ghost: ["hover:bg-accent hover:text-accent-foreground"],
      link: ["text-primary underline-offset-4 hover:underline"],
    },
    // WCAG 2.5.5 Enhanced (AAA) — all sizes meet 44×44 CSS px minimum
    size: {
      default: "h-11 px-4 py-2",
      sm: "h-11 rounded-md px-3 text-xs",
      lg: "h-12 rounded-md px-8",
      icon: "h-11 w-11",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  );
}

export { Button, buttonVariants };
