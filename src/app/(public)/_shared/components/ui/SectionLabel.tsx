/**
 * SectionLabel — Gold accent label for section headings
 *
 * Displays a small uppercase label with a gold line accent on the left.
 */

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";

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
      className={cn(
        "gold-line px-1 text-eyebrow uppercase text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}
