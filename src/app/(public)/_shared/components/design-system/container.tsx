import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type ContainerVariant = "default" | "narrow" | "wide" | "editorial";

const variantClasses = {
  default: "max-w-[var(--container-max)]",
  narrow: "max-w-3xl",
  wide: "max-w-screen-2xl",
  editorial: "max-w-[var(--container-measure)]",
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
  className,
  as: Tag = "div",
}: ContainerProps) {
  return (
    <Tag
      className={cn(
        "mx-auto ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
