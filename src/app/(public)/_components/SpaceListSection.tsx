/**
 * SpaceListSection — variant dispatcher (Server Component)
 *
 * `displayLayout` が "catalog" のときは FilterBar + SpaceGrid + Pagination を
 * 内包したアーカイブ表示を、それ以外（grid / list / carousel）のときは既存の
 * SpaceListSimpleView (CC) を描画する。
 *
 * 公開ページ /spaces は本セクションの "catalog" variant に統一テンプレート化されており、
 * SectionRenderer は searchParams を受け取って paginated データ + filters + reviewStats を
 * fetch して `mode={{ kind: "catalog", ... }}` で渡す。
 */

import { Suspense, type ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { Pagination } from "@/public/components/pagination";
import { FilterBar } from "@/public/components/ui/filter-bar";
import type { SpaceListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

import {
  SpaceListSimpleView,
  type SpaceListData,
} from "./space-list/space-list-simple-view";
import { SpaceGrid } from "./space-list/space-grid";

export type { SpaceListData };

interface FilterOption {
  readonly id: string;
  readonly name: string;
}

interface ReviewStats {
  readonly averageRating: number;
  readonly totalCount: number;
}

interface CatalogSpace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly descriptionPlainText: string;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly mainImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly category: { readonly name: string } | null;
  readonly location: { readonly name: string };
}

export type SpaceListMode =
  | { readonly kind: "simple"; readonly spaces: readonly SpaceListData[] }
  | {
      readonly kind: "catalog";
      readonly spaces: readonly CatalogSpace[];
      readonly categories: readonly FilterOption[];
      readonly locations: readonly FilterOption[];
      readonly reviewStats: Readonly<Record<string, ReviewStats>>;
      readonly currentPage: number;
      readonly totalPages: number;
      readonly totalCount: number;
      readonly categoryId: string | null;
      readonly locationId: string | null;
    };

interface SpaceListSectionProps {
  readonly config: SpaceListConfig;
  readonly style: SectionStylePayload;
  readonly mode: SpaceListMode;
}

export function SpaceListSection({
  config,
  style,
  mode,
}: SpaceListSectionProps): ReactElement {
  if (mode.kind === "catalog") {
    const hasFilters = mode.categoryId !== null || mode.locationId !== null;
    const hasHeader = Boolean(config.sectionLabel) || Boolean(config.title);

    return (
      <SectionWrapper style={style} layout={config.layout}>
        {hasHeader && (
          <div className="mb-10 text-center md:mb-14">
            {config.sectionLabel && (
              <ScrollReveal>
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              </ScrollReveal>
            )}
            {config.title && (
              <div className="mt-4" style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn("tracking-tight", getTitleClasses(style))}
                >
                  <SplitText>{config.title}</SplitText>
                </Heading>
              </div>
            )}
          </div>
        )}

        <Suspense fallback={null}>
          <div className="mb-10 md:mb-14">
            <FilterBar
              categories={mode.categories}
              locations={mode.locations}
              resultCount={mode.totalCount}
            />
          </div>
        </Suspense>

        <Suspense fallback={null}>
          <SpaceGrid
            spaces={mode.spaces}
            reviewStats={mode.reviewStats}
            hasFilters={hasFilters}
          />
        </Suspense>

        <div className="mt-10 md:mt-14">
          <Pagination
            currentPage={mode.currentPage}
            totalPages={mode.totalPages}
            basePath="/spaces"
            preservedQuery={{
              ...(mode.categoryId ? { category: mode.categoryId } : {}),
              ...(mode.locationId ? { location: mode.locationId } : {}),
            }}
          />
        </div>
      </SectionWrapper>
    );
  }

  return (
    <SpaceListSimpleView config={config} style={style} spaces={mode.spaces} />
  );
}
