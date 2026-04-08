import {
  formatMonthYear,
  getJSTMonthKey,
} from "@/public/lib/format-event-date";
import { EventCard } from "./event-card";
import type { EventCardData } from "./event-card";

interface EventListViewProps {
  readonly events: readonly EventCardData[];
}

function groupByMonth(
  events: readonly EventCardData[],
): Map<string, EventCardData[]> {
  const map = new Map<string, EventCardData[]>();
  for (const event of events) {
    const key = getJSTMonthKey(event.startTime);
    const existing = map.get(key);
    if (existing) {
      existing.push(event);
    } else {
      map.set(key, [event]);
    }
  }
  return map;
}

export function EventListView({ events }: EventListViewProps) {
  if (events.length === 0) {
    return (
      <div className="py-[var(--spacing-section)] text-center">
        <p className="text-muted-foreground">
          現在予定されているイベントはありません。
        </p>
      </div>
    );
  }

  const grouped = groupByMonth(events);

  return (
    <div className="space-y-12 md:space-y-16">
      {[...grouped.entries()].map(([monthKey, monthEvents]) => {
        const firstEvent = monthEvents[0];
        if (!firstEvent) return null;
        const firstDate = new Date(firstEvent.startTime);
        const monthLabel = formatMonthYear(firstDate);

        return (
          <section key={monthKey}>
            <div className="mb-6 flex items-center gap-4 md:mb-8">
              <h2 className="font-heading text-lg font-light italic text-foreground md:text-xl">
                {monthLabel}
              </h2>
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <div>
              {monthEvents.map((event) => (
                <EventCard key={event.id} variant="list" event={event} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
