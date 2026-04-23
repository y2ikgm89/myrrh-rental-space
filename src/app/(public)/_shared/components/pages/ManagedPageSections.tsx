import type { ReactElement } from "react";
import type {
  PublicPageForStyle,
  PublicSection,
  PublicSectionStyle,
  PublicSettingsForStyle,
} from "@/shared/domain/sections/queries";
import { SectionRenderer } from "../sections/section-renderer";

interface ManagedPageSectionsProps {
  readonly sections: readonly PublicSection[];
  readonly pageStyle: PublicSectionStyle | null;
  readonly settings: PublicSettingsForStyle;
}

export async function ManagedPageSections({
  sections,
  pageStyle,
  settings,
}: ManagedPageSectionsProps): Promise<ReactElement> {
  const page: PublicPageForStyle = { pageStyle };

  return (
    <>
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          page={page}
          settings={settings}
        />
      ))}
    </>
  );
}
