import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type SectionBackground = "default" | "surface";
type SectionBorder = "none" | "top" | "accent";
type SectionSpacing = "default" | "compact" | "none";

const bgClasses = {
  default: "bg-background",
  surface: "bg-surface",
} as const satisfies Record<SectionBackground, string>;

const borderClasses = {
  none: "",
  top: "border-t border-border",
  accent: "border-t-2 border-accent",
} as const satisfies Record<SectionBorder, string>;

const spacingClasses = {
  default: "py-[var(--spacing-section)]",
  compact: "py-[var(--spacing-block)]",
  none: "",
} as const satisfies Record<SectionSpacing, string>;

interface SectionProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly background?: SectionBackground;
  readonly border?: SectionBorder;
  readonly spacing?: SectionSpacing;
  readonly id?: string;
}

export function Section({
  children,
  className,
  background = "default",
  border = "none",
  spacing = "default",
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        bgClasses[background],
        borderClasses[border],
        spacingClasses[spacing],
        className,
      )}
    >
      {children}
    </section>
  );
}
