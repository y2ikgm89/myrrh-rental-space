# Events Calendar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FullCalendar を完全削除し、Editorial Magazine デザインの自作イベント一覧+カレンダービューに置き換える。

**Architecture:** SC/CC 分離。page.tsx (SC) でデータ取得 + セクション統合、EventsViewSwitcher (CC) で nuqs タブ切替、EventListView (SC) を children slot、EventCalendarView (CC) でカレンダー描画。CSS `hidden` で SC children の再マウント回避。

**Tech Stack:** Next.js 16, React 19, nuqs, Tailwind 4, Tabler Icons

---

### Task 1: nuqs パーサー追加 + format-event-date.ts 拡張

**Files:**

- Modify: `src/app/(public)/_shared/lib/search-params.ts`
- Modify: `src/app/(public)/_shared/lib/format-event-date.ts`

- [ ] **Step 1: search-params.ts にイベントビュー用パーサーを追加**

`src/app/(public)/_shared/lib/search-params.ts` 末尾に追加:

```typescript
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

// ... existing parsers ...

const EVENT_VIEWS = ["list", "calendar"] as const;

export const eventsSearchParamsParsers = {
  view: parseAsStringLiteral(EVENT_VIEWS).withDefault("list"),
};

export const eventsSearchParams = createSearchParamsCache(
  eventsSearchParamsParsers,
);
```

注意: `parseAsStringLiteral` の import を先頭の既存 import に追加する。

- [ ] **Step 2: format-event-date.ts に共通フォーマッターを追加**

`src/app/(public)/_shared/lib/format-event-date.ts` に追加:

```typescript
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

// ... existing formatEventDateTimeRange ...

const monthYearFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
});

const dayOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  day: "numeric",
});

const weekdayOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
});

const timeOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
});

export function formatMonthYear(date: Date): string {
  return monthYearFormatter.format(date);
}

export function formatDay(date: Date): string {
  return dayOnlyFormatter.format(date);
}

export function formatWeekday(date: Date): string {
  return weekdayOnlyFormatter.format(date);
}

export function formatTime(date: Date): string {
  return timeOnlyFormatter.format(date);
}

/** JST の年・月(0-indexed)・日を返す */
export function getJSTDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const s = jstDateFormatter.format(date);
  const [y, m, d] = s.split("-").map(Number);
  return { year: y ?? 0, month: (m ?? 1) - 1, day: d ?? 1 };
}

/** JST ベースの月キー (例: "2026-03") */
export function getJSTMonthKey(dateStr: string): string {
  const { year, month } = getJSTDateParts(new Date(dateStr));
  return `${String(year)}-${String(month).padStart(2, "0")}`;
}

/** ISO 文字列が指定 JST 日と同日か判定 */
export function isSameJSTDay(
  isoStr: string,
  year: number,
  month: number,
  day: number,
): boolean {
  const jst = getJSTDateParts(new Date(isoStr));
  return jst.year === year && jst.month === month && jst.day === day;
}

export function formatEventPrice(price: number): string {
  if (price === 0) return "無料";
  return `\u00A5${price.toLocaleString("ja-JP")}`;
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/app/(public)/_shared/lib/search-params.ts src/app/(public)/_shared/lib/format-event-date.ts
git commit -m "feat(events): add nuqs view parsers and shared date/price formatters"
```

---

### Task 2: EventCard 共通コンポーネント

**Files:**

- Create: `src/app/(public)/events/_components/event-card.tsx`

- [ ] **Step 1: event-card.tsx を作成**

```typescript
import Link from "next/link";
import { IconCalendar, IconMapPin, IconArrowRight } from "@tabler/icons-react";
import { Heading } from "@/public/components/design-system/heading";
import { Badge } from "@/public/components/design-system/badge";
import {
  formatDay,
  formatWeekday,
  formatTime,
  formatEventPrice,
} from "@/public/lib/format-event-date";

export interface EventCardData {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly price: number | null;
  readonly registrationOpen: boolean;
  readonly spaceName: string | null;
}

interface EventCardListProps {
  readonly variant: "list";
  readonly event: EventCardData;
}

interface EventCardCompactProps {
  readonly variant: "compact";
  readonly event: EventCardData;
}

type EventCardProps = EventCardListProps | EventCardCompactProps;

function EventBadges({ event }: { readonly event: EventCardData }) {
  return (
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
  );
}

function EventMeta({
  event,
  iconSize,
}: {
  readonly event: EventCardData;
  readonly iconSize: string;
}) {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <IconCalendar className={`${iconSize} shrink-0`} aria-hidden="true" />
        {formatTime(start)} – {formatTime(end)}
      </span>
      {event.location ? (
        <span className="inline-flex items-center gap-1.5">
          <IconMapPin className={`${iconSize} shrink-0`} aria-hidden="true" />
          {event.location}
        </span>
      ) : null}
    </div>
  );
}

export function EventCard({ variant, event }: EventCardProps) {
  if (variant === "compact") {
    return (
      <Link
        href={`/events/${event.slug}`}
        className="group block px-4 py-4 transition-colors hover:bg-surface/50"
      >
        <EventBadges event={event} />
        <h3 className="mt-1.5 text-sm font-medium text-foreground">
          {event.title}
        </h3>
        {event.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {event.description}
          </p>
        ) : null}
        <div className="mt-2">
          <EventMeta event={event} iconSize="h-3 w-3" />
        </div>
      </Link>
    );
  }

  // variant === "list"
  const start = new Date(event.startTime);
  const day = formatDay(start);
  const weekday = formatWeekday(start);

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group grid grid-cols-[4.5rem_1fr] gap-6 border-b border-border py-6 transition-colors last:border-b-0 md:grid-cols-[5.5rem_1fr_auto] md:gap-8 md:py-8"
    >
      {/* Date block */}
      <div className="flex flex-col items-center pt-1">
        <span className="font-heading text-[2.5rem] font-light leading-none text-foreground md:text-[3rem]">
          {day}
        </span>
        <span className="mt-1 text-xs tracking-[0.18em] text-muted-foreground">
          {weekday}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0">
        <EventBadges event={event} />
        <Heading
          level={3}
          className="mt-2 !text-base transition-colors group-hover:text-foreground md:!text-lg"
        >
          {event.title}
        </Heading>
        {event.description ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {event.description}
          </p>
        ) : null}
        <div className="mt-3">
          <EventMeta event={event} iconSize="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Arrow — desktop only */}
      <div className="hidden items-center md:flex">
        <IconArrowRight
          className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/(public)/events/_components/event-card.tsx
git commit -m "feat(events): add EventCard shared component with list/compact variants"
```

---

### Task 3: EventListView (Server Component)

**Files:**

- Create: `src/app/(public)/events/_components/event-list-view.tsx`

- [ ] **Step 1: event-list-view.tsx を作成**

Server Component（`"use client"` なし）。月ごとにグループ化して表示。

```typescript
import { formatMonthYear, getJSTMonthKey } from "@/public/lib/format-event-date";
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
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/(public)/events/_components/event-list-view.tsx
git commit -m "feat(events): add EventListView server component with month grouping"
```

---

### Task 4: MonthPicker コンポーネント

**Files:**

- Create: `src/app/(public)/events/_components/month-picker.tsx`

- [ ] **Step 1: month-picker.tsx を作成**

レビュー指摘修正済み版: useEffect 統合、requestAnimationFrame 排除。

```typescript
"use client";

import { useRef, useState, useEffect } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
] as const;

interface MonthPickerProps {
  readonly year: number;
  readonly month: number;
  readonly onSelect: (year: number, month: number) => void;
}

export function MonthPicker({ year, month, onSelect }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const [yearInput, setYearInput] = useState("");
  const [isEditingYear, setIsEditingYear] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync picker year when parent changes
  useEffect(() => {
    setPickerYear(year);
  }, [year]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingYear) {
      inputRef.current?.select();
    }
  }, [isEditingYear]);

  // Close on outside click + Escape (single useEffect)
  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setIsEditingYear(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setIsEditingYear(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleMonthSelect(m: number) {
    onSelect(pickerYear, m);
    setOpen(false);
    setIsEditingYear(false);
  }

  function startYearEdit() {
    setYearInput(String(pickerYear));
    setIsEditingYear(true);
  }

  function commitYearInput() {
    const parsed = Number.parseInt(yearInput, 10);
    if (!Number.isNaN(parsed) && parsed >= 1900 && parsed <= 2100) {
      setPickerYear(parsed);
    }
    setIsEditingYear(false);
  }

  const monthYearLabel = `${String(year)}年${String(month + 1)}月`;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setPickerYear(year);
          setIsEditingYear(false);
        }}
        className="group text-xl font-light tracking-wide text-foreground transition-colors hover:text-accent md:text-2xl"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {monthYearLabel}
        <span className="ml-1.5 inline-block text-muted-foreground transition-transform group-hover:translate-y-0.5">
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="年月選択"
          className="absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 border border-border bg-background p-4 shadow-sm"
        >
          {/* Year row */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPickerYear((y) => y - 1)}
              className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label="前の年"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>

            {isEditingYear ? (
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={yearInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  if (v.length <= 4) setYearInput(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitYearInput();
                  if (e.key === "Escape") setIsEditingYear(false);
                }}
                onBlur={commitYearInput}
                className="w-20 border-b border-accent bg-transparent text-center text-lg font-light text-foreground outline-none"
                aria-label="年を入力"
              />
            ) : (
              <button
                type="button"
                onClick={startYearEdit}
                className="text-lg font-light text-foreground transition-colors hover:text-accent"
                aria-label="年を直接入力"
                title="クリックで年を入力"
              >
                {pickerYear}年
              </button>
            )}

            <button
              type="button"
              onClick={() => setPickerYear((y) => y + 1)}
              className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label="次の年"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month grid */}
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {MONTH_LABELS.map((label, i) => {
              const isCurrent = pickerYear === year && i === month;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleMonthSelect(i)}
                  className={cn(
                    "py-2 text-sm transition-colors",
                    isCurrent
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground hover:bg-surface",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/(public)/events/_components/month-picker.tsx
git commit -m "feat(events): add MonthPicker with year keyboard input"
```

---

### Task 5: EventCalendarView (Client Component)

**Files:**

- Create: `src/app/(public)/events/_components/event-calendar-view.tsx`

- [ ] **Step 1: event-calendar-view.tsx を作成**

レビュー指摘全修正版: 一意キー、disabled 冗長ガード削除、JST 日付関数使用。

```typescript
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

  // Previous month fill
  for (let i = startOffset - 1; i >= 0; i--) {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    days.push({ day: daysInPrevMonth - i, month: prevMonth, year: prevYear, isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, month, year, isCurrentMonth: true });
  }

  // Next month fill
  const totalCells = Math.ceil(days.length / 7) * 7;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  for (let d = 1; days.length < totalCells; d++) {
    days.push({ day: d, month: nextMonth, year: nextYear, isCurrentMonth: false });
  }

  return days;
}

// --- Side panel ---

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
            <p className="text-sm text-muted-foreground">イベントはありません</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dayEvents.map((event) => {
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
        )}
      </div>
    </div>
  );
}

// --- Main component ---

interface EventCalendarViewProps {
  readonly events: readonly EventCardData[];
}

export function EventCalendarView({ events }: EventCalendarViewProps) {
  const today = getJSTDateParts(new Date());
  const [currentYear, setCurrentYear] = useState(today.year);
  const [currentMonth, setCurrentMonth] = useState(today.month);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            aria-label="前の月"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            aria-label="次の月"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>

        <MonthPicker year={currentYear} month={currentMonth} onSelect={jumpToMonth} />

        <button
          type="button"
          onClick={goToday}
          className="border border-border px-3 py-1.5 text-xs tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          今日
        </button>
      </div>

      {/* 2-column: calendar + side panel */}
      <div className="mt-6 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-t border-l border-border">
            {WEEKDAY_LABELS.map((label, idx) => (
              <div
                key={label}
                className={cn(
                  "border-b border-r border-border bg-surface py-3 text-center text-sm font-medium tracking-[0.18em]",
                  idx === 0 ? "text-destructive" : idx === 6 ? "text-info" : "text-foreground/70",
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
              const hasEvents = cell.isCurrentMonth && dayHasEvents(cell.day, cell.month, cell.year);
              const eventTitles = cell.isCurrentMonth
                ? getDayEventTitles(cell.day, cell.month, cell.year)
                : [];

              return (
                <button
                  key={`${String(cell.year)}-${String(cell.month)}-${String(cell.day)}`}
                  type="button"
                  disabled={!cell.isCurrentMonth}
                  onClick={() => setSelectedDay(cell.day)}
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
                      isToday && "rounded-full bg-accent font-medium text-accent-foreground",
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
                          className="truncate rounded-sm bg-accent/10 px-1 py-0.5 text-[10px] leading-tight text-accent sm:text-[11px]"
                        >
                          {title}
                        </div>
                      ))}
                      {eventTitles.length > 2 ? (
                        <span className="text-[10px] text-muted-foreground">
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

        {/* Side panel */}
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
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/(public)/events/_components/event-calendar-view.tsx
git commit -m "feat(events): add self-built EventCalendarView with side panel"
```

---

### Task 6: EventsViewSwitcher (Client Component)

**Files:**

- Create: `src/app/(public)/events/_components/events-view-switcher.tsx`

- [ ] **Step 1: events-view-switcher.tsx を作成**

nuqs で URL 同期。SC children を CSS `hidden` で切替（再マウント回避）。完全な a11y（id + aria-labelledby）。

```typescript
"use client";

import type { ReactNode } from "react";
import { useQueryStates } from "nuqs";
import { cn } from "@/shared/lib/cn";
import { eventsSearchParamsParsers } from "@/public/lib/search-params";

const VIEW_TABS = [
  { value: "list", label: "一覧" },
  { value: "calendar", label: "カレンダー" },
] as const;

type ViewType = (typeof VIEW_TABS)[number]["value"];

interface EventsViewSwitcherProps {
  readonly activeView: ViewType;
  readonly listView: ReactNode;
  readonly calendarView: ReactNode;
}

export function EventsViewSwitcher({
  activeView,
  listView,
  calendarView,
}: EventsViewSwitcherProps) {
  const [, setParams] = useQueryStates(eventsSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  function handleViewChange(view: ViewType) {
    void setParams({ view: view === "list" ? null : view });
  }

  return (
    <div>
      <nav aria-label="表示切替" className="mb-10 md:mb-14">
        <ul className="flex gap-1 border-b border-border" role="tablist">
          {VIEW_TABS.map((tab) => {
            const isActive = activeView === tab.value;
            return (
              <li key={tab.value} role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={`events-tab-${tab.value}`}
                  aria-selected={isActive}
                  aria-controls={`events-panel-${tab.value}`}
                  onClick={() => handleViewChange(tab.value)}
                  className={cn(
                    "px-5 py-3 text-sm tracking-[0.18em] transition-colors",
                    isActive
                      ? "border-b-2 border-accent text-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        id="events-panel-list"
        role="tabpanel"
        aria-labelledby="events-tab-list"
        className={activeView !== "list" ? "hidden" : undefined}
      >
        {listView}
      </div>
      <div
        id="events-panel-calendar"
        role="tabpanel"
        aria-labelledby="events-tab-calendar"
        className={activeView !== "calendar" ? "hidden" : undefined}
      >
        {calendarView}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/(public)/events/_components/events-view-switcher.tsx
git commit -m "feat(events): add EventsViewSwitcher with nuqs URL sync and a11y"
```

---

### Task 7: page.tsx リライト + loading.tsx 更新

**Files:**

- Rewrite: `src/app/(public)/events/page.tsx`
- Rewrite: `src/app/(public)/events/loading.tsx`

- [ ] **Step 1: page.tsx を完全リライト**

```typescript
/**
 * /events — イベント一覧 (Editorial Magazine)
 *
 * 一覧ビュー + カレンダービューの切替。FullCalendar 不使用。
 * DB セクションシステム統合（hero + trailing sections）。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { getPublishedEvents } from "@/shared/domain/events/public-queries";
import { Container } from "@/public/components/design-system/container";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { eventsSearchParams } from "@/public/lib/search-params";
import { EventsViewSwitcher } from "./_components/events-view-switcher";
import { EventListView } from "./_components/event-list-view";
import { EventCalendarView } from "./_components/event-calendar-view";
import type { EventCardData } from "./_components/event-card";

interface EventsPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("events");
}

export default async function EventsPage({
  searchParams,
}: EventsPageProps): Promise<ReactElement> {
  await connection();

  const { view } = await eventsSearchParams.parse(searchParams);

  const [sections, rawEvents] = await Promise.all([
    getPageSectionsWithFallback("events"),
    getPublishedEvents(),
  ]);

  const events: EventCardData[] = rawEvents.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description,
    location: e.location,
    startTime: e.startTime,
    endTime: e.endTime,
    price: e.price,
    registrationOpen: e.registrationOpen,
    spaceName: e.space?.name ?? null,
  }));

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "event-calendar",
  );

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
      cta={<SiteCTA />}
    >
      <section className="pt-10 pb-[var(--spacing-section)] md:pt-14">
        <Container>
          <EventsViewSwitcher
            activeView={view}
            listView={<EventListView events={events} />}
            calendarView={<EventCalendarView events={events} />}
          />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
```

- [ ] **Step 2: loading.tsx を更新**

旧 `CalendarSkeleton` import を削除し、汎用スケルトンに置き換え:

```typescript
import { Container } from "@/public/components/design-system/container";

export default function EventsLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-6 py-10 md:py-14">
          {/* Tab skeleton */}
          <div className="flex gap-4 border-b border-border pb-3">
            <div className="h-5 w-12 animate-pulse bg-surface" />
            <div className="h-5 w-24 animate-pulse bg-surface" />
          </div>
          {/* Card skeletons */}
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-6">
              <div className="h-16 w-16 animate-pulse bg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 animate-pulse bg-surface" />
                <div className="h-5 w-3/4 animate-pulse bg-surface" />
                <div className="h-3 w-1/2 animate-pulse bg-surface" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/app/(public)/events/page.tsx src/app/(public)/events/loading.tsx
git commit -m "feat(events): rewrite page with editorial list+calendar views"
```

---

### Task 8: 旧ファイル削除 + FullCalendar パッケージ削除

**Files:**

- Delete: `src/app/(public)/_shared/components/event-calendar/event-calendar.tsx`
- Delete: `src/app/(public)/_shared/components/event-calendar/event-modal.tsx`
- Delete: `src/app/(public)/_shared/components/event-calendar/calendar-skeleton.tsx`
- Delete: `src/app/(public)/events-design-demo/` (全体)
- Modify: `package.json` (FullCalendar 6 パッケージ削除)

- [ ] **Step 1: 旧 event-calendar コンポーネント 3 ファイルを削除**

```bash
git rm src/app/(public)/_shared/components/event-calendar/event-calendar.tsx
git rm src/app/(public)/_shared/components/event-calendar/event-modal.tsx
git rm src/app/(public)/_shared/components/event-calendar/calendar-skeleton.tsx
```

- [ ] **Step 2: デモページを削除**

```bash
git rm -r src/app/(public)/events-design-demo/
```

- [ ] **Step 3: FullCalendar パッケージを削除**

```bash
bun remove @fullcalendar/core @fullcalendar/daygrid @fullcalendar/interaction @fullcalendar/list @fullcalendar/react @fullcalendar/timegrid
```

- [ ] **Step 4: 残存参照チェック**

```bash
grep -r "fullcalendar\|FullCalendar\|event-calendar" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: `section-renderer.tsx` のみ（`SectionType.EVENT_CALENDAR` case — null 返却で維持）。他にヒットがあれば修正する。

- [ ] **Step 5: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "refactor(events): remove FullCalendar and demo page

BREAKING CHANGE: FullCalendar 6 packages removed, replaced with self-built calendar"
```
