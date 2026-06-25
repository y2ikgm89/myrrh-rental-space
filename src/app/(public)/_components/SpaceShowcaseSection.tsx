/**
 * SpaceShowcaseSection — Dispatches to grid or carousel variant based on
 * `config.displayLayout`. Both variants live under `_components/space-showcase/`.
 */

import type { ReactElement } from "react";
import { SpacesCarousel } from "./space-showcase/_spaces-carousel";
import { SpacesGrid } from "./space-showcase/_spaces-grid";
import type { SpaceShowcaseConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type { GalleryItem } from "@/shared/lib/validations/gallery";

export interface ShowcaseSpaceData {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly descriptionPlainText: string;
  readonly capacity: number | null;
  readonly hourlyPrice: number | null;
  readonly area: number | null;
  readonly mainImageUrl: string;
  readonly gallery: readonly GalleryItem[];
  readonly categoryName: string | null;
  readonly locationName: string | null;
}

interface SpaceShowcaseSectionProps {
  readonly config: SpaceShowcaseConfig;
  readonly spaces: readonly ShowcaseSpaceData[];
  readonly style: SectionStylePayload;
}

export function SpaceShowcaseSection({
  config,
  spaces,
  style,
}: SpaceShowcaseSectionProps): ReactElement | null {
  if (config.displayLayout === "carousel") {
    return <SpacesCarousel config={config} spaces={spaces} style={style} />;
  }
  return <SpacesGrid config={config} spaces={spaces} style={style} />;
}
