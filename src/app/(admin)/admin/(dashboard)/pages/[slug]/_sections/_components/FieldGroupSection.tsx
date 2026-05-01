"use client";

/**
 * FieldGroupSection — Content フィールドを subGroup（text / image / button / other）
 * ごとに見出し付きで分類表示する SSoT コンポーネント。
 *
 * AutoSectionForm の content グループ内のみで使用する。
 */

import type { ReactNode } from "react";
import type { TablerIcon } from "@tabler/icons-react";

interface FieldGroupSectionProps {
  readonly title: string;
  readonly icon?: TablerIcon;
  readonly children: ReactNode;
}

export function FieldGroupSection({
  title,
  icon: Icon,
  children,
}: FieldGroupSectionProps) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
        {Icon ? (
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : null}
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
