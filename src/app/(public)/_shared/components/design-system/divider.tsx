import { cn } from "@/shared/lib/cn";

type DividerVariant = "subtle" | "accent" | "fade";

const variantClasses = {
  subtle: "border-t border-border",
  accent: "editorial-border-accent mx-auto",
  fade: "h-px bg-gradient-to-r from-transparent via-border to-transparent border-0",
} as const satisfies Record<DividerVariant, string>;

interface DividerProps {
  readonly variant?: DividerVariant;
  readonly className?: string;
}

export function Divider({ variant = "subtle", className }: DividerProps) {
  return <hr className={cn(variantClasses[variant], className)} />;
}
