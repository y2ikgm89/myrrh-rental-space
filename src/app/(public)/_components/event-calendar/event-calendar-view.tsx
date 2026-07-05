"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/cn";
import { isSameJSTDay } from "@/public/lib/format-event-date";
import { CalendarMonthNav } from "./calendar-month-nav";
import { useCalendarMonth } from "./use-calendar-month";
import { EventCard } from "./event-card";
import type { EventCardData } from "./event-card";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const WEEKDAY_FULL_LABELS = [
  "日曜日",
  "月曜日",
  "火曜日",
  "水曜日",
  "木曜日",
  "金曜日",
  "土曜日",
] as const;

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

function getCalendarDayKey(cell: CalendarDay): string {
  return `${String(cell.year)}-${String(cell.month)}-${String(cell.day)}`;
}

// --- Side panel (desktop) ---

function SideDayPanel({
  events,
  selectedDay,
  month,
  year,
  nowMs,
}: {
  readonly events: readonly EventCardData[];
  readonly selectedDay: number;
  readonly month: number;
  readonly year: number;
  readonly nowMs: number;
}) {
  const dayEvents = events.filter((e) =>
    eventHasSlotOnJSTDay(e, year, month, selectedDay),
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
          <DayEventList events={dayEvents} nowMs={nowMs} />
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
  nowMs,
}: {
  readonly events: readonly EventCardData[];
  readonly selectedDay: number;
  readonly month: number;
  readonly year: number;
  readonly nowMs: number;
}) {
  const dayEvents = events.filter((e) =>
    eventHasSlotOnJSTDay(e, year, month, selectedDay),
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
        <DayEventList events={dayEvents} nowMs={nowMs} />
      )}
    </div>
  );
}

// --- Shared event list for both panels ---

function DayEventList({
  events,
  nowMs,
}: {
  readonly events: readonly EventCardData[];
  readonly nowMs: number;
}) {
  return (
    <div className="divide-y divide-divider">
      {events.map((event) => (
        <EventCard
          key={event.id}
          variant="compact"
          event={event}
          isPast={new Date(event.endTime).getTime() < nowMs}
        />
      ))}
    </div>
  );
}

// --- Main component ---

interface EventCalendarViewProps {
  readonly events: readonly EventCardData[];
  readonly initialNowIso?: string;
}

function eventHasSlotOnJSTDay(
  event: EventCardData,
  year: number,
  month: number,
  day: number,
): boolean {
  return event.slots.some((slot) =>
    isSameJSTDay(slot.startTime, year, month, day),
  );
}

export function EventCalendarView({
  events,
  initialNowIso,
}: EventCalendarViewProps) {
  const {
    today,
    year: currentYear,
    month: currentMonth,
    nowMs,
    prev,
    next,
    goToday,
    jump,
  } = useCalendarMonth(initialNowIso);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const monthKey = `${String(currentYear)}-${String(currentMonth)}`;
  const [previousMonthKey, setPreviousMonthKey] = useState(monthKey);
  if (monthKey !== previousMonthKey) {
    setPreviousMonthKey(monthKey);
    setSelectedDay(null);
  }

  const days = getCalendarDays(currentYear, currentMonth);

  function dayHasEvents(day: number, m: number, y: number): boolean {
    return events.some((e) => eventHasSlotOnJSTDay(e, y, m, day));
  }

  function getDayEventTitles(day: number, m: number, y: number): string[] {
    return events
      .filter((e) => eventHasSlotOnJSTDay(e, y, m, day))
      .map((e) => e.title);
  }

  return (
    <div>
      <CalendarMonthNav
        year={currentYear}
        month={currentMonth}
        onPrev={prev}
        onNext={next}
        onToday={goToday}
        onJump={jump}
      />

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
              nowMs={nowMs}
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
            nowMs={nowMs}
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
  const captionId = useId();
  const cellMapRef = useRef<Record<string, HTMLTableCellElement | null>>({});
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);

  const selectedCell = days.find(
    (cell) => cell.isCurrentMonth && cell.day === selectedDay,
  );
  const todayCell = days.find(
    (cell) =>
      cell.isCurrentMonth &&
      cell.day === today.day &&
      currentMonth === today.month &&
      currentYear === today.year,
  );
  const fallbackActiveCell =
    selectedCell ?? todayCell ?? days.find((cell) => cell.isCurrentMonth);
  const resolvedActiveCellKey =
    activeCellKey &&
    days.some((cell) => getCalendarDayKey(cell) === activeCellKey)
      ? activeCellKey
      : fallbackActiveCell
        ? getCalendarDayKey(fallbackActiveCell)
        : null;

  function focusCellAt(index: number) {
    const target = days[index];
    if (!target?.isCurrentMonth) {
      return;
    }

    const key = getCalendarDayKey(target);
    setActiveCellKey(key);
    cellMapRef.current[key]?.focus();
  }

  function findFocusableIndex(startIndex: number, step: number): number | null {
    for (
      let index = startIndex;
      index >= 0 && index < days.length;
      index += step
    ) {
      if (days[index]?.isCurrentMonth) {
        return index;
      }
    }

    return null;
  }

  function selectCell(cell: CalendarDay) {
    if (!cell.isCurrentMonth) {
      return;
    }

    setActiveCellKey(getCalendarDayKey(cell));
    onSelectDay(cell.day);
  }

  function handleCellKeyDown(
    event: KeyboardEvent<HTMLTableCellElement>,
    index: number,
    cell: CalendarDay,
  ) {
    if (!cell.isCurrentMonth) {
      return;
    }

    const rowStart = index - (index % 7);
    const rowEnd = rowStart + 6;
    let targetIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
        targetIndex = findFocusableIndex(index + 1, 1);
        break;
      case "ArrowLeft":
        targetIndex = findFocusableIndex(index - 1, -1);
        break;
      case "ArrowDown":
        targetIndex = findFocusableIndex(index + 7, 7);
        break;
      case "ArrowUp":
        targetIndex = findFocusableIndex(index - 7, -7);
        break;
      case "Home":
        targetIndex = findFocusableIndex(rowStart, 1);
        break;
      case "End":
        targetIndex = findFocusableIndex(rowEnd, -1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        selectCell(cell);
        return;
      default:
        return;
    }

    if (targetIndex !== null) {
      event.preventDefault();
      focusCellAt(targetIndex);
    }
  }

  return (
    <table
      role="grid"
      aria-labelledby={captionId}
      className="w-full table-fixed border-collapse"
    >
      <caption id={captionId} className="sr-only">
        {currentYear}年{currentMonth + 1}月のイベントカレンダー
      </caption>
      <thead>
        <tr>
          {WEEKDAY_LABELS.map((label, idx) => (
            <th
              key={label}
              scope="col"
              abbr={WEEKDAY_FULL_LABELS[idx]}
              className={cn(
                "border border-border bg-surface py-3 text-center text-sm font-medium tracking-eyebrow",
                idx === 0
                  ? "text-destructive"
                  : idx === 6
                    ? "text-info"
                    : "text-foreground/70",
              )}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: Math.ceil(days.length / 7) }, (_, rowIndex) => (
          <tr key={`week-${String(rowIndex)}`}>
            {days
              .slice(rowIndex * 7, rowIndex * 7 + 7)
              .map((cell, colIndex) => {
                const index = rowIndex * 7 + colIndex;
                const key = getCalendarDayKey(cell);
                const isToday =
                  cell.isCurrentMonth &&
                  cell.day === today.day &&
                  currentMonth === today.month &&
                  currentYear === today.year;
                const isPast =
                  cell.isCurrentMonth &&
                  !isToday &&
                  (currentYear < today.year ||
                    (currentYear === today.year &&
                      currentMonth < today.month) ||
                    (currentYear === today.year &&
                      currentMonth === today.month &&
                      cell.day < today.day));
                const isSelected =
                  cell.isCurrentMonth && cell.day === selectedDay;
                const hasEvents =
                  cell.isCurrentMonth &&
                  dayHasEvents(cell.day, cell.month, cell.year);
                const eventTitles = cell.isCurrentMonth
                  ? getDayEventTitles(cell.day, cell.month, cell.year)
                  : [];
                const ariaLabel = `${String(cell.year)}年${String(cell.month + 1)}月${String(cell.day)}日${
                  isToday ? "（今日）" : ""
                }${isSelected ? "（選択中）" : ""}${
                  isPast ? "（過去日）" : ""
                }${hasEvents ? ` イベント${String(eventTitles.length)}件` : ""}`;

                return (
                  <td
                    key={key}
                    ref={(node) => {
                      cellMapRef.current[key] = node;
                    }}
                    aria-label={ariaLabel}
                    aria-disabled={cell.isCurrentMonth ? undefined : "true"}
                    aria-selected={isSelected ? "true" : undefined}
                    aria-current={isToday ? "date" : undefined}
                    tabIndex={
                      cell.isCurrentMonth && key === resolvedActiveCellKey
                        ? 0
                        : cell.isCurrentMonth
                          ? -1
                          : undefined
                    }
                    onClick={() => selectCell(cell)}
                    onKeyDown={(event) => handleCellKeyDown(event, index, cell)}
                    className={cn(
                      "relative z-0 h-[5.5rem] cursor-pointer align-top border border-border p-1.5 text-left outline-none transition-colors focus-visible:z-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:h-[7rem] sm:p-2",
                      cell.isCurrentMonth
                        ? "hover:bg-surface/50"
                        : "cursor-default bg-background text-muted-foreground/30",
                      isPast &&
                        "bg-muted/40 text-muted-foreground hover:bg-muted/50",
                      "aria-[selected=true]:z-10 aria-[selected=true]:border-accent aria-[selected=true]:bg-accent/[0.14] aria-[selected=true]:ring-2 aria-[selected=true]:ring-inset aria-[selected=true]:ring-accent aria-[selected=true]:hover:bg-accent/20",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center text-sm sm:h-8 sm:w-8 sm:text-base",
                        isToday &&
                          "rounded-full border border-accent bg-background/90 font-medium text-accent",
                        isSelected && !isToday && "font-semibold text-accent",
                        !isToday &&
                          !isSelected &&
                          isPast &&
                          "text-muted-foreground",
                        !isToday &&
                          !isSelected &&
                          !isPast &&
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
                      <div className="mt-0.5 space-y-0.5 overflow-hidden">
                        {eventTitles.slice(0, 2).map((title) => (
                          <div
                            key={title}
                            className={cn(
                              "truncate rounded-sm px-1 py-0.5 text-xs leading-tight",
                              isSelected
                                ? "bg-background/90 text-foreground"
                                : isPast
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-accent/10 text-accent",
                            )}
                          >
                            {title}
                          </div>
                        ))}
                        {eventTitles.length > 2 ? (
                          <span className="text-xs text-muted-foreground">
                            +{eventTitles.length - 2}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                );
              })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
