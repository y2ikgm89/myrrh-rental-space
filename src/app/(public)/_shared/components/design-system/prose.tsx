import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface ProseProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Prose({ children, className }: ProseProps) {
  return (
    <div
      className={cn(
        "prose prose-neutral max-w-[65ch] leading-[var(--leading-normal)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
