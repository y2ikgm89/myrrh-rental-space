import type { ReactElement } from "react";
import type { PublicSection } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "../sections/section-renderer";

interface ManagedPageSectionsProps {
  readonly sections: readonly PublicSection[];
  /**
   * 親ページの slug（preview / [...segments] route で取得した Page.slug）。
   * post-list archive variant の sidebar 表示判定など page-context が必要な
   * section に SectionRenderer 経由で流す。
   */
  readonly pageSlug?: string;
}

export async function ManagedPageSections({
  sections,
  pageSlug,
}: ManagedPageSectionsProps): Promise<ReactElement> {
  return (
    <>
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          {...(pageSlug ? { pageSlug } : {})}
        />
      ))}
    </>
  );
}
