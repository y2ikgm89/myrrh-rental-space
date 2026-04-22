/**
 * Style 一覧グリッド（Server Component）。
 * Container Queries で幅に応じて 1〜3 列に適応する。
 * items.length === 0 で EmptyState 早期 return。
 */

import { EmptyState } from "@/admin/components/EmptyState";
import type { SectionStyleListItem } from "@/shared/domain/section-styles/queries";
import { StyleCard } from "./StyleCard";

export function StyleGrid({ styles }: { styles: SectionStyleListItem[] }) {
  if (styles.length === 0) {
    return (
      <EmptyState
        message="Style が登録されていません"
        description="「新規作成」ボタンから最初の Style を追加してください。"
        action={{ label: "新規作成", href: "/admin/styles/new" }}
      />
    );
  }
  return (
    <div className="@container/main">
      <div className="grid grid-cols-1 gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-3">
        {styles.map((style) => (
          <StyleCard key={style.id} style={style} />
        ))}
      </div>
    </div>
  );
}
