import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import type { PublicSection } from "@/shared/domain/sections/queries";
import { SectionStack } from "../sections/section-stack";

interface ManagedPageSectionsProps {
  readonly sections: readonly PublicSection[];
  /**
   * 親ページの slug（preview / [...segments] route で取得した Page.slug）。
   * post-list archive variant の sidebar 表示判定など page-context が必要な
   * section に SectionRenderer 経由で流す。
   */
  readonly pageSlug?: string;
  /**
   * URL クエリ。archive の post-list / news-list が `?q` / `?page` を
   * 読むために、SectionStack と同じ条件付きスプレッドで forward する。
   */
  readonly searchParams?: Promise<SearchParams>;
}

export function ManagedPageSections({
  sections,
  pageSlug,
  searchParams,
}: ManagedPageSectionsProps): ReactElement {
  return (
    <SectionStack
      sections={sections}
      {...(pageSlug !== undefined ? { pageSlug } : {})}
      {...(searchParams !== undefined ? { searchParams } : {})}
    />
  );
}
