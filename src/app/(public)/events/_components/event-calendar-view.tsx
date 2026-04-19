"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconChevronLeft,
  IconChevronRight,
  IconCalendar,
  IconMapPin,
} from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/public/components/design-system/badge";
import {
  getJSTDateParts,
  isSameJSTDay,
  formatTime,
  formatEventPrice,
} from "@/public/lib/format-event-date";
import { MonthPicker } from "./month-picker";
import type { EventCardData } from "./event-card";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

interface CalendarDay {
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
}

function getCalendarDays(year: number, month: number): CalendarDay[] {
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: CalendarDay[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    days.push({
      day: daysInPrevMonth - i,
      month: prevMonth,
      year: prevYear,
      isCurrentMonth: false,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, month, year, isCurrentMonth: true });
  }

  const totalCells = Math.ceil(days.length / 7) * 7;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  for (let d = 1; days.length < totalCells; d++) {
    days.push({
      day: d,
      month: nextMonth,
      year: nextYear,
      isCurrentMonth: false,
    });
  }

  return days;
}

// --- Side panel (desktop) ---

function SideDayPanel({
  events,
  selectedDay,
  month,
  year,
}: {
  readonly events: readonly EventCardData[];
  readonly selectedDay: number;
  readonly month: number;
  readonly year: number;
}) {
  const dayEvents = events.filter((e) =>
    isSameJSTDay(e.startTime, year, month, selectedDay),
  );

  return (
    <div className="flex h-full flex-col border border-border">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          {month + 1}月{selectedDay}日
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {dayEvents.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              イベントはありません
            </p>
          </div>
        ) : (
          <DayEventList events={dayEvents} />
        )}
      </div>
    </div>
  );
}

// --- Inline panel (mobile) ---

function InlineDayPanel({
  events,
  selectedDay,
  month,
  year,
}: {
  readonly events: readonly EventCardData[];
  readonly selectedDay: number;
  readonly month: number;
  readonly year: number;
}) {
  const dayEvents = events.filter((e) =>
    isSameJSTDay(e.startTime, year, month, selectedDay),
  );

  return (
    <div className="mt-6 border border-border">
      <div className="border-b border-border bg-surface px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          {month + 1}月{selectedDay}日のイベント
        </p>
      </div>
      {dayEvents.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">イベントはありません</p>
        </div>
      ) : (
        <DayEventList events={dayEvents} />
      )}
    </div>
  );
}

// --- Shared event list for both panels ---

function DayEventList({
  events,
}: {
  readonly events: readonly EventCardData[];
}) {
  return (
    <div className="divide-y divide-border">
      {events.map((event) => {
        const start = new Date(event.startTime);
        const end = new Date(event.endTime);
        return (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="group block px-4 py-4 transition-colors hover:bg-surface/50"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {event.price !== null ? (
                <Badge variant={event.price === 0 ? "success" : "default"}>
                  {formatEventPrice(event.price)}
                </Badge>
              ) : null}
              {!event.registrationOpen ? (
                <Badge variant="warning">受付終了</Badge>
              ) : null}
            </div>
            <h3 className="mt-1.5 text-sm font-medium text-foreground">
              {event.title}
            </h3>
            {event.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {event.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                {formatTime(start)} – {formatTime(end)}
              </span>
              {event.location ? (
                <span className="inline-flex items-center gap-1.5">
                  <IconMapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {event.location}
                </span>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// --- Main component ---

interface EventCalendarViewProps {
  readonly events: readonly EventCardData[];
}

export function EventCalendarView({ events }: EventCalendarViewProps) {
  const [today] = useState(() => getJSTDateParts(new Date()));
  const [currentYear, setCurrentYear] = useState(() => today.year);
  const [currentMonth, setCurrentMonth] = useState(() => today.month);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const days = getCalendarDays(currentYear, currentMonth);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDay(null);
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDay(null);
  }

  function goToday() {
    setCurrentYear(today.year);
    setCurrentMonth(today.month);
    setSelectedDay(today.day);
  }

  function jumpToMonth(y: number, m: number) {
    setCurrentYear(y);
    setCurrentMonth(m);
    setSelectedDay(null);
  }

  function dayHasEvents(day: number, m: number, y: number): boolean {
    return events.some((e) => isSameJSTDay(e.startTime, y, m, day));
  }

  function getDayEventTitles(day: number, m: number, y: number): string[] {
    return events
      .filter((e) => isSameJSTDay(e.startTime, y, m, day))
      .map((e) => e.title);
  }

  return (
    <div>
      {/* Header — month navigation */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2 justify-self-start">
          <button
            type="button"
            onClick={goToday}
            className="h-10 border border-border px-4 text-xs tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            今日
          </button>
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-10 w-10 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="前の月"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-10 w-10 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="次の月"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="justify-self-center">
          <MonthPicker
            year={currentYear}
            month={currentMonth}
            onSelect={jumpToMonth}
          />
        </div>

        <div aria-hidden="true" />
      </div>

      {/* Desktop: 2-column (calendar + side panel) */}
      <div className="mt-6 hidden items-stretch gap-8 lg:grid lg:grid-cols-[1fr_20rem]">
        <div>
          <CalendarGrid
            days={days}
            today={today}
            currentMonth={currentMonth}
            currentYear={currentYear}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            dayHasEvents={dayHasEvents}
            getDayEventTitles={getDayEventTitles}
          />
        </div>
        <aside>
          {selectedDay !== null ? (
            <SideDayPanel
              events={events}
              selectedDay={selectedDay}
              month={currentMonth}
              year={currentYear}
            />
          ) : (
            <div className="flex h-full items-center justify-center border border-border p-5 text-center">
              <p className="text-sm text-muted-foreground">
                日付をクリックすると
                <br />
                イベントが表示されます
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile: calendar + inline panel below */}
      <div className="mt-6 lg:hidden">
        <CalendarGrid
          days={days}
          today={today}
          currentMonth={currentMonth}
          currentYear={currentYear}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          dayHasEvents={dayHasEvents}
          getDayEventTitles={getDayEventTitles}
        />
        {selectedDay !== null ? (
          <InlineDayPanel
            events={events}
            selectedDay={selectedDay}
            month={currentMonth}
            year={currentYear}
          />
        ) : null}
      </div>
    </div>
  );
}

// --- Calendar grid (shared between desktop/mobile) ---

function CalendarGrid({
  days,
  today,
  currentMonth,
  currentYear,
  selectedDay,
  onSelectDay,
  dayHasEvents,
  getDayEventTitles,
}: {
  readonly days: readonly CalendarDay[];
  readonly today: { year: number; month: number; day: number };
  readonly currentMonth: number;
  readonly currentYear: number;
  readonly selectedDay: number | null;
  readonly onSelectDay: (day: number) => void;
  readonly dayHasEvents: (day: number, m: number, y: number) => boolean;
  readonly getDayEventTitles: (day: number, m: number, y: number) => string[];
}) {
  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-t border-l border-border">
        {WEEKDAY_LABELS.map((label, idx) => (
          <div
            key={label}
            className={cn(
              "border-b border-r border-border bg-surface py-3 text-center text-sm font-medium tracking-[0.18em]",
              idx === 0
                ? "text-destructive"
                : idx === 6
                  ? "text-info"
                  : "text-foreground/70",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((cell, i) => {
          const colIndex = i % 7;
          const isToday =
            cell.isCurrentMonth &&
            cell.day === today.day &&
            currentMonth === today.month &&
            currentYear === today.year;
          const isSelected = cell.isCurrentMonth && cell.day === selectedDay;
          const hasEvents =
            cell.isCurrentMonth &&
            dayHasEvents(cell.day, cell.month, cell.year);
          const eventTitles = cell.isCurrentMonth
            ? getDayEventTitles(cell.day, cell.month, cell.year)
            : [];

          return (
            <button
              key={`${String(cell.year)}-${String(cell.month)}-${String(cell.day)}`}
              type="button"
              disabled={!cell.isCurrentMonth}
              onClick={() => onSelectDay(cell.day)}
              className={cn(
                "relative flex min-h-[5.5rem] flex-col border-b border-r border-border p-1.5 text-left transition-colors sm:min-h-[7rem] sm:p-2",
                i % 7 === 0 && "border-l",
                i < 7 && "border-t",
                cell.isCurrentMonth
                  ? "hover:bg-surface/50"
                  : "cursor-default bg-background text-muted-foreground/30",
                isSelected && "bg-accent/5",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center text-sm sm:h-8 sm:w-8 sm:text-base",
                  isToday &&
                    "rounded-full bg-accent font-medium text-accent-foreground",
                  !isToday &&
                    cell.isCurrentMonth &&
                    (colIndex === 0
                      ? "text-destructive"
                      : colIndex === 6
                        ? "text-info"
                        : "text-foreground"),
                )}
              >
                {cell.day}
              </span>

              {hasEvents ? (
                <div className="mt-0.5 flex-1 space-y-0.5 overflow-hidden">
                  {eventTitles.slice(0, 2).map((title) => (
                    <div
                      key={title}
                      className="truncate rounded-sm bg-accent/10 px-1 py-0.5 text-[11px] leading-tight text-accent sm:text-xs"
                    >
                      {title}
                    </div>
                  ))}
                  {eventTitles.length > 2 ? (
                    <span className="text-[11px] text-muted-foreground">
                      +{eventTitles.length - 2}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
