import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type StackDirection = "vertical" | "horizontal";
type StackGap = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "section";

const gapClasses = {
  none: "gap-0",
  xs: "gap-1.5",
  sm: "gap-3",
  md: "gap-5",
  lg: "gap-8",
  xl: "gap-12",
  "2xl": "gap-16",
  section: "gap-[var(--spacing-section)]",
} as const satisfies Record<StackGap, string>;

interface StackProps {
  readonly children: ReactNode;
  readonly direction?: StackDirection;
  readonly gap?: StackGap;
  readonly className?: string;
  readonly as?: "div" | "section" | "ul" | "nav";
}

export function Stack({
  children,
  direction = "vertical",
  gap = "md",
  className,
  as: Tag = "div",
}: StackProps) {
  return (
    <Tag
      className={cn(
        direction === "vertical" ? "flex flex-col" : "flex flex-row",
        gapClasses[gap],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
