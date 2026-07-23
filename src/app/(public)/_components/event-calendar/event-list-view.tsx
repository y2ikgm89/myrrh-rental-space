import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { Pagination } from "@/public/components/pagination";
import type { EventListTab } from "@/public/lib/search-params";
import { EventCard, type EventCardData } from "./event-card";
import {
  EventListFilters,
  type EventListFiltersCategory,
} from "./event-list-filters";

export interface EventListFilterState {
  readonly tab: EventListTab;
  readonly q: string;
  readonly categoryId: string | null;
}

export interface EventListViewData {
  readonly items: readonly EventCardData[];
  readonly categories: readonly EventListFiltersCategory[];
  readonly currentPage: number;
  readonly totalPages: number;
  readonly totalCount: number;
  readonly filter: EventListFilterState;
}

interface EventListViewProps {
  readonly data: EventListViewData;
}

/**
 * ページ切替時も tab/q/categoryId を URL に保持する(`page` は Pagination が上書き)。
 * `SpaceListSection.buildPreservedQuery` と同型。
 */
function buildPreservedQuery(
  filter: EventListFilterState,
): Readonly<Record<string, string | undefined>> {
  const q: Record<string, string | undefined> = {};
  if (filter.tab !== "upcoming") q["tab"] = filter.tab;
  if (filter.q) q["q"] = filter.q;
  if (filter.categoryId) q["categoryId"] = filter.categoryId;
  return q;
}

export function EventListView({ data }: EventListViewProps) {
  const { items, categories, currentPage, totalPages, totalCount, filter } =
    data;
  // tab が upcoming/past を server 側で既に絞り込んでいるため、カードの
  // 「終了」バッジは個々の slot 時刻ではなくタブの意味そのもので決める。
  const isPast = filter.tab === "past";

  return (
    <div>
      <EventListFilters categories={categories} resultCount={totalCount} />

      {items.length === 0 ? (
        <div className="py-12 text-center md:py-16">
          <p className="text-muted-foreground">
            該当するイベントはありません。
          </p>
        </div>
      ) : (
        <ScrollRevealGroup className="mt-10 divide-y divide-divider">
          {items.map((event) => (
            <EventCard
              key={event.id}
              variant="list"
              event={event}
              isPast={isPast}
            />
          ))}
        </ScrollRevealGroup>
      )}

      <div className="mt-10 md:mt-14">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/events"
          preservedQuery={buildPreservedQuery(filter)}
        />
      </div>
    </div>
  );
}
