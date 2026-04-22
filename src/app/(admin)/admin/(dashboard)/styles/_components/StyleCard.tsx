/**
 * Style カードプレビュー（Server Component）。
 * _count バッジ + Editorial preview。
 */

import Link from "next/link";
import { Badge } from "@/admin/components/ui";
import type { SectionStyleListItem } from "@/shared/domain/section-styles/queries";

const SCOPE_LABELS: Record<string, string> = {
  global: "グローバル",
  page: "ページ",
  section: "セクション",
};

export function StyleCard({ style }: { style: SectionStyleListItem }) {
  const totalUsage =
    style._count.sections +
    style._count.pagesAsDefault +
    style._count.settingsGlobal;

  return (
    <Link
      href={`/admin/styles/${style.id}`}
      className="group block overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex h-24 items-center justify-center bg-muted/40 px-4">
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Editorial Preview
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground group-hover:text-primary">
            {style.name}
          </h3>
          <Badge variant="outline" className="shrink-0">
            {SCOPE_LABELS[style.scope] ?? style.scope}
          </Badge>
        </div>
        {style.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {style.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>使用箇所: {totalUsage}</span>
          {style._count.derived > 0 && (
            <span>派生: {style._count.derived}</span>
          )}
          {style.applicableTypes.length > 0 && (
            <span>対応 type: {style.applicableTypes.length}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
