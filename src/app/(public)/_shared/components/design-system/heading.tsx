"use client";

import type { ReactNode } from "react";

type HeadingLevel = 1 | 2 | 3 | 4;

const levelClasses = {
  1: "text-[length:var(--text-h1)] font-bold leading-[var(--leading-tight)]",
  2: "text-[length:var(--text-h2)] font-bold leading-[var(--leading-tight)]",
  3: "text-[length:var(--text-h3)] font-semibold leading-[var(--leading-tight)]",
  4: "text-lg font-semibold leading-[var(--leading-tight)]",
} as const satisfies Record<HeadingLevel, string>;

interface HeadingProps {
  readonly level: HeadingLevel;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Heading({ level, children, className = "" }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={`font-heading tracking-[var(--tracking-tight)] ${levelClasses[level]} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
