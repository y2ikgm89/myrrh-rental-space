"use client";

import {
  formatMonthYear,
  getJSTDateParts,
} from "@/public/lib/format-event-date";
import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { CalendarMonthNav } from "./calendar-month-nav";
import { useCalendarMonth } from "./use-calendar-month";
import { EventCard } from "./event-card";
import type { EventCardData } from "./event-card";

interface EventListViewProps {
  readonly events: readonly EventCardData[];
}

function isInJSTMonth(iso: string, year: number, month: number): boolean {
  const parts = getJSTDateParts(new Date(iso));
  return parts.year === year && parts.month === month;
}

function eventHasSlotInJSTMonth(
  event: EventCardData,
  year: number,
  month: number,
): boolean {
  return event.slots.some((slot) => isInJSTMonth(slot.startTime, year, month));
}

export function EventListView({ events }: EventListViewProps) {
  const { year, month, nowMs, prev, next, goToday, jump } = useCalendarMonth();

  const monthEvents = events.filter((e) =>
    eventHasSlotInJSTMonth(e, year, month),
  );
  const monthLabel = formatMonthYear(new Date(year, month, 1));

  return (
    <div>
      <CalendarMonthNav
        year={year}
        month={month}
        onPrev={prev}
        onNext={next}
        onToday={goToday}
        onJump={jump}
      />

      <section className="mt-10" aria-label={`${monthLabel}のイベント`}>
        {monthEvents.length === 0 ? (
          <div className="py-12 text-center md:py-16">
            <p className="text-muted-foreground">
              {monthLabel}にイベントはありません。
            </p>
            <p className="mt-2 text-xs tracking-[0.12em] text-muted-foreground/70">
              前後の月を確認してください
            </p>
          </div>
        ) : (
          <ScrollRevealGroup className="divide-y divide-divider">
            {monthEvents.map((event) => (
              <EventCard
                key={event.id}
                variant="list"
                event={event}
                isPast={new Date(event.endTime).getTime() < nowMs}
              />
            ))}
          </ScrollRevealGroup>
        )}
      </section>
    </div>
  );
}
