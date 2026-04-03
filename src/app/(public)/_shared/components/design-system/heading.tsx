import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type HeadingLevel = 1 | 2 | 3 | 4;

const levelClasses = {
  1: "text-h1",
  2: "text-h2",
  3: "text-h3",
  4: "text-h4",
} as const satisfies Record<HeadingLevel, string>;

const fontClasses = {
  1: "font-heading font-light",
  2: "font-heading font-light",
  3: "font-sans font-normal",
  4: "font-sans font-medium",
} as const satisfies Record<HeadingLevel, string>;

interface HeadingProps {
  readonly level: HeadingLevel;
  readonly children: ReactNode;
  readonly className?: string;
  readonly accent?: boolean;
}

export function Heading({ level, children, className, accent }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <>
      <Tag className={cn(fontClasses[level], levelClasses[level], className)}>
        {children}
      </Tag>
      {accent ? (
        <div className="mt-4 h-0.5 w-16 bg-accent" aria-hidden="true" />
      ) : null}
    </>
  );
}
