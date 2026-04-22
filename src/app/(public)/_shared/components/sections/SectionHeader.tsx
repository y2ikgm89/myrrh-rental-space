import type { ReactElement, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

const textAlignMap = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} satisfies Record<NonNullable<SectionDesign["textAlign"]>, string>;

export interface SectionHeaderProps {
  readonly label: string;
  readonly title: string;
  readonly description?: ReactNode;
  /** SectionDesign.textAlign に追従（未指定は left） */
  readonly textAlign?: SectionDesign["textAlign"];
  readonly className?: string;
}

/**
 * ホーム・標準セクション共通の見出しブロック（縦余白は --space-sm で SSoT）
 */
export function SectionHeader({
  label,
  title,
  description,
  textAlign = "left",
  className,
}: SectionHeaderProps): ReactElement {
  const align = textAlignMap[textAlign];

  return (
    <div className={cn("mb-[var(--space-sm)]", align, className)}>
      <p className="text-[0.8rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <h2 className="mt-4 font-heading text-[clamp(2rem,4vw,3rem)] font-light tracking-tight">
        {title}
      </h2>
      {description ? (
        <div className="mt-4 text-muted-foreground">{description}</div>
      ) : null}
    </div>
  );
}
