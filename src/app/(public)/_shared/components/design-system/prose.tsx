"use client";

import type { ReactNode } from "react";

interface ProseProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Prose({ children, className = "" }: ProseProps) {
  return (
    <div
      className={`prose prose-neutral max-w-[65ch] leading-[var(--leading-normal)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}
