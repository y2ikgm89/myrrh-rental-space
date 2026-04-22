import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

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
        "prose prose-neutral max-w-[var(--container-measure)] leading-[var(--leading-normal)]",
        "prose-a:text-accent prose-a:no-underline hover:prose-a:text-accent-light",
        "prose-blockquote:font-heading prose-blockquote:italic prose-blockquote:font-light prose-blockquote:border-accent",
        variant === "editorial" && "drop-cap",
        className,
      )}
    >
      {children}
    </div>
  );
}
