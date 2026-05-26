import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { EDITORIAL_PROSE_CLASSES } from "@/shared/lib/styles/prose";

type ProseVariant = "default" | "editorial";

interface ProseProps {
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * `editorial` は本文を `--container-measure` で読みやすい幅に絞り、
   * 公開 ↔ Lexical エディタで同じ Kinfolk タイポ contract を共有する。
   * drop-cap は brand 規約に基づき 2026-05-27 に全撤去（spaces / events /
   * news / posts / terms 全 5 layout で先頭文字装飾なし、同色統一）。
   */
  readonly variant?: ProseVariant;
}

export function Prose({ children, className }: ProseProps) {
  return (
    <div
      className={cn(
        EDITORIAL_PROSE_CLASSES,
        "max-w-[var(--container-measure)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
