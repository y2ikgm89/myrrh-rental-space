import type { ReactElement } from "react";
import type { PublicSection } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "../sections/section-renderer";

interface ManagedPageSectionsProps {
  readonly sections: readonly PublicSection[];
}

export async function ManagedPageSections({
  sections,
}: ManagedPageSectionsProps): Promise<ReactElement> {
  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
