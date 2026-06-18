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
  // 規約「--spacing-fluid-lg/xl は hero/dramatic 専用」に整合。SiteCTA / related-* の
  // セクション間余白を md(85/48px) に統一し、直前セクション pb との二重計上で
  // 生じる過大な空白(desktop 216px+)を解消する。
  default: "py-[var(--spacing-fluid-md)]",
  compact: "py-[var(--spacing-region)]",
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
