"use client";

import type { ReactNode } from "react";

type ContainerVariant = "default" | "narrow" | "wide";

const variantClasses = {
  default: "max-w-[var(--container-max)]",
  narrow: "max-w-3xl",
  wide: "max-w-screen-2xl",
} as const satisfies Record<ContainerVariant, string>;

interface ContainerProps {
  readonly children: ReactNode;
  readonly variant?: ContainerVariant;
  readonly className?: string;
  readonly as?: "div" | "section" | "article";
}

export function Container({
  children,
  variant = "default",
  className = "",
  as: Tag = "div",
}: ContainerProps) {
  return (
    <Tag
      className={`mx-auto px-[var(--container-padding)] ${variantClasses[variant]} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
