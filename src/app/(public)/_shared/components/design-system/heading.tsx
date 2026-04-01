import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type HeadingLevel = 1 | 2 | 3 | 4;

const levelClasses = {
  1: "text-h1",
  2: "text-h2",
  3: "text-h3",
  4: "text-h4",
} as const satisfies Record<HeadingLevel, string>;

interface HeadingProps {
  readonly level: HeadingLevel;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Heading({ level, children, className }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag className={cn("font-heading", levelClasses[level], className)}>
      {children}
    </Tag>
  );
}
