/**
 * SectionStack — 公開ページのセクション縦積みコンテナ（余白の SSoT）
 *
 * セクション間の余白は「各セクションが持つ padding」ではなく、この親コンテナの
 * 統一 gap が唯一の源泉。これにより:
 *   - どのセクションが `null` を返しても（データ無し / feature 無効）、
 *     並び替えても、見える隣接セクション間は常に一定（--space-md）。
 *   - padding 加算による二重余白も、両側 padding 無しによるゼロ余白も
 *     構造的に発生しない（flex gap は実在の子要素の間にだけ入る）。
 *
 * 全公開ページ（home / 各 system page / [...segments] / preview）がこの 1 つの
 * コンポーネントでセクションを描画する。SectionRenderer に流すオプション
 * (pageSlug / searchParams / inquiryDefaults) は exactOptionalPropertyTypes に
 * 合わせて条件付きスプレッドで forward する。
 */

import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";

import { SectionRenderer } from "./section-renderer";
import type { PublicSection } from "@/shared/domain/sections/queries";
import type { InquiryDefaults } from "@/shared/lib/inquiry/defaults";

interface SectionStackProps {
  readonly sections: readonly PublicSection[];
  readonly pageSlug?: string;
  readonly searchParams?: Promise<SearchParams>;
  readonly inquiryDefaults?: InquiryDefaults;
}

export function SectionStack({
  sections,
  pageSlug,
  searchParams,
  inquiryDefaults,
}: SectionStackProps): ReactElement {
  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          {...(pageSlug !== undefined ? { pageSlug } : {})}
          {...(searchParams !== undefined ? { searchParams } : {})}
          {...(inquiryDefaults !== undefined ? { inquiryDefaults } : {})}
        />
      ))}
    </div>
  );
}
