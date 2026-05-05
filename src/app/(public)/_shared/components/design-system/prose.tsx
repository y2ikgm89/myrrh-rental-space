import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { EDITORIAL_PROSE_CLASSES } from "@/shared/lib/styles/prose";

type ProseVariant = "default" | "editorial";

interface ProseProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant?: ProseVariant;
}

export function Prose({
  children,
  className,
  variant = "default",
}: ProseProps) {
  return (
    <div
      className={cn(
        EDITORIAL_PROSE_CLASSES,
        "max-w-[var(--container-measure)]",
        variant === "editorial" && "drop-cap",
        className,
      )}
    >
      {children}
    </div>
  );
}
