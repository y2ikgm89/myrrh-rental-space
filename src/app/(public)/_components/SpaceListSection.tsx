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
import { SectionTitleBox } from "@/public/components/sections/section-color-boxes";
import { getTitleClasses } from "@/public/components/sections/section-style-helpers";
import { Pagination } from "@/public/components/pagination";
import { FilterBar } from "@/public/components/ui/filter-bar";
import type { SpaceListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type { SpaceSort } from "@/public/lib/search-params";

import {
  SpaceListSimpleView,
  type SpaceListData,
} from "./space-list/space-list-simple-view";
import { SpaceGrid } from "./space-list/space-grid";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import type { GalleryItem } from "@/shared/lib/validations/gallery";

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
  readonly gallery: readonly GalleryItem[];
  readonly category: { readonly name: string } | null;
  readonly location: { readonly name: string };
  /**
   * 空き時間帯 facet 検索時のみ付与される。営業時間・予約/イベント重複・
   * 臨時休業を判定した「この日時に予約できるか」。facet 未使用時は undefined
   * （バッジを出さない = 通常表示）。
   */
  readonly isAvailableForSearch?: boolean | undefined;
}

/**
 * catalog variant の facet 状態。Pagination の preservedQuery にそのままエコーする
 * 契約なので、URL に写る key と 1:1 で対応する。
 */
export interface CatalogFilterState {
  readonly categoryId: string | null;
  readonly locationId: string | null;
  readonly q: string;
  readonly minCapacity: number | null;
  readonly facilities: readonly string[];
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly sort: SpaceSort;
}

export type SpaceListMode =
  | { readonly kind: "simple"; readonly spaces: readonly SpaceListData[] }
  | {
      readonly kind: "catalog";
      readonly spaces: readonly CatalogSpace[];
      readonly categories: readonly FilterOption[];
      readonly locations: readonly FilterOption[];
      readonly facilityOptions: readonly string[];
      readonly reviewStats: Readonly<Record<string, ReviewStats>>;
      readonly currentPage: number;
      readonly totalPages: number;
      readonly totalCount: number;
      readonly filter: CatalogFilterState;
    };

interface SpaceListSectionProps {
  readonly config: SpaceListConfig;
  readonly style: SectionStylePayload;
  readonly mode: SpaceListMode;
  /**
   * 複製されたセクション同士で同じスペースが描画されても SpaceCard の
   * aria-describedby id がページ内で衝突しないようにする一意キー
   * （catalog variant のみ SpaceGrid 経由で使用）。
   */
  readonly sectionId: string;
  /**
   * catalog Pagination の path。FilterBar (nuqs = 現在 URL) と揃え、
   * 埋め込みページで `/spaces` へ飛ばないようにする。未指定時は `/spaces`。
   */
  readonly catalogBasePath?: string;
}

/**
 * catalog variant の URL facet を Pagination の preservedQuery 形式に flatten する。
 * ページ切替で filter が silent に落ちる regression を防ぐため、追加 facet はすべて
 * ここに列挙する（`filter.*` の key と Pagination 側の URL key を 1:1 対応させる）。
 */
function buildPreservedQuery(
  filter: CatalogFilterState,
): Readonly<Record<string, string | undefined>> {
  const q: Record<string, string | undefined> = {};
  if (filter.categoryId) q["category"] = filter.categoryId;
  if (filter.locationId) q["location"] = filter.locationId;
  if (filter.q) q["q"] = filter.q;
  if (filter.minCapacity !== null)
    q["minCapacity"] = String(filter.minCapacity);
  if (filter.facilities.length > 0)
    q["facilities"] = filter.facilities.join(",");
  if (filter.date) q["date"] = filter.date;
  if (filter.startTime) q["startTime"] = filter.startTime;
  if (filter.endTime) q["endTime"] = filter.endTime;
  if (filter.sort !== "recommended") q["sort"] = filter.sort;
  return q;
}

function hasAnyFacetActive(filter: CatalogFilterState): boolean {
  return (
    filter.categoryId !== null ||
    filter.locationId !== null ||
    filter.q !== "" ||
    filter.minCapacity !== null ||
    filter.facilities.length > 0 ||
    filter.date !== "" ||
    filter.startTime !== "" ||
    filter.endTime !== "" ||
    filter.sort !== "recommended"
  );
}

export function SpaceListSection({
  config,
  style,
  mode,
  sectionId,
  catalogBasePath = "/spaces",
}: SpaceListSectionProps): ReactElement {
  if (mode.kind === "catalog") {
    const hasFilters = hasAnyFacetActive(mode.filter);
    const hasTitle = config.title.length > 0;

    return (
      <SectionWrapper style={style} layout={config.layout}>
        {hasTitle && (
          <div className="mb-10 text-center md:mb-14">
            {config.sectionLabel && (
              <ScrollReveal>
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              </ScrollReveal>
            )}
            <SectionTitleBox style={style} className="mt-4">
              <Heading
                level={2}
                className={cn("tracking-tight", getTitleClasses(style))}
              >
                <SplitText>
                  <PortableTextSpans spans={config.title} />
                </SplitText>
              </Heading>
            </SectionTitleBox>
          </div>
        )}

        <Suspense fallback={null}>
          <div className="mb-10 md:mb-14">
            <FilterBar
              categories={mode.categories}
              locations={mode.locations}
              facilityOptions={mode.facilityOptions}
              resultCount={mode.totalCount}
            />
          </div>
        </Suspense>

        <Suspense fallback={null}>
          <SpaceGrid
            spaces={mode.spaces}
            reviewStats={mode.reviewStats}
            hasFilters={hasFilters}
            sectionId={sectionId}
          />
        </Suspense>

        <div className="mt-10 md:mt-14">
          <Pagination
            currentPage={mode.currentPage}
            totalPages={mode.totalPages}
            basePath={catalogBasePath}
            preservedQuery={buildPreservedQuery(mode.filter)}
          />
        </div>
      </SectionWrapper>
    );
  }

  return (
    <SpaceListSimpleView config={config} style={style} spaces={mode.spaces} />
  );
}
