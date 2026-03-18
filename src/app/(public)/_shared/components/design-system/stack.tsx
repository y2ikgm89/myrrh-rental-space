"use client";

import type { ReactNode } from "react";

type StackDirection = "vertical" | "horizontal";
type StackGap = "none" | "sm" | "md" | "lg" | "xl" | "section";

const gapClasses = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
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
  className = "",
  as: Tag = "div",
}: StackProps) {
  const dirClass = direction === "vertical" ? "flex flex-col" : "flex flex-row";
  return (
    <Tag className={`${dirClass} ${gapClasses[gap]} ${className}`.trim()}>
      {children}
    </Tag>
  );
}
