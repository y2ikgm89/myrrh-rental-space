/**
 * SectionLabel — Gold accent label for section headings
 *
 * Displays a small uppercase label with a gold line accent on the left.
 */

import type { ReactElement } from "react";

interface SectionLabelProps {
  readonly children: string;
  readonly className?: string;
}

export function SectionLabel({
  children,
  className = "",
}: SectionLabelProps): ReactElement {
  return (
    <span
      className={`gold-line pl-1 text-[11px] uppercase tracking-[0.25em] text-accent ${className}`}
    >
      {children}
    </span>
  );
}
