import type { ReactElement } from "react";
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
}

export function ManagedPageSections({
  sections,
  pageSlug,
}: ManagedPageSectionsProps): ReactElement {
  return (
    <SectionStack
      sections={sections}
      {...(pageSlug !== undefined ? { pageSlug } : {})}
    />
  );
}
