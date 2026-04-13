import {
  formatMonthYear,
  getJSTMonthKey,
} from "@/public/lib/format-event-date";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
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
      <div className="space-y-4 py-12 text-center md:py-16">
        <p className="text-muted-foreground">
          現在予定されているイベントはありません。
        </p>
        <Button variant="editorial" size="sm" href="/contact">
          お問い合わせ
        </Button>
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
              <h2 className="text-xl font-light tracking-wide text-foreground md:text-2xl">
                {monthLabel}
              </h2>
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <div className="divide-y divide-border">
              {monthEvents.map((event, index) => (
                <ScrollReveal key={event.id} delay={0.08 * Math.min(index, 8)}>
                  <EventCard variant="list" event={event} />
                </ScrollReveal>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
