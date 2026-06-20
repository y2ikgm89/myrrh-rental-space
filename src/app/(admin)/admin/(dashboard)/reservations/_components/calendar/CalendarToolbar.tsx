"use client";

import {
  IconChevronLeft,
  IconChevronRight,
  IconCalendar,
  IconCalendarMonth,
  IconCalendarWeek,
  IconCalendarTime,
  IconBuildingStore,
} from "@tabler/icons-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { formatDateLabel } from "@/admin/lib/calendar";
import type { CalendarView } from "@/admin/lib/calendar";
import {
  getReservationStatusFilterOrAll,
  RESERVATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { cn } from "@/shared/lib/cn";
import type { CalendarState } from "./hooks/use-calendar-state";

interface CalendarToolbarProps {
  state: CalendarState;
}

const VIEW_OPTIONS: ReadonlyArray<{
  value: CalendarView;
  label: string;
  Icon: typeof IconCalendarMonth;
}> = [
  { value: "month", label: "月", Icon: IconCalendarMonth },
  { value: "week", label: "週", Icon: IconCalendarWeek },
  { value: "day", label: "日", Icon: IconCalendarTime },
  { value: "resource", label: "スペース別", Icon: IconBuildingStore },
];

export function CalendarToolbar({ state }: CalendarToolbarProps) {
  const {
    view,
    currentDate,
    isAlreadyToday,
    spaces,
    spaceId,
    status,
    setView,
    goNext,
    goPrevious,
    goToday,
    setSpaceFilter,
    setStatusFilter,
  } = state;

  const dateLabel = formatDateLabel(currentDate, view);
  // resource ビュー時は spaceId フィルターは無効（全スペースを列として表示するため）
  const spaceFilterDisabled = view === "resource";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-xs xl:flex-nowrap xl:gap-4">
      {/* 左: ビュー切替（セグメンテッドコントロール） */}
      <div
        role="group"
        aria-label="表示モード"
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted p-1 sm:gap-0.5"
      >
        {VIEW_OPTIONS.map(({ value, label, Icon }) => {
          const isActive = view === value;
          return (
            <button
              key={value}
              type="button"
              // ARIA 1.2: トグルボタンは active/inactive いずれの状態でも aria-pressed を
              // 明示する。JSX で boolean false を渡すと属性自体が DOM から消えてしまい
              // SR が「トグル状態にあること」を認識できないため、必ず string 化する。
              aria-pressed={isActive ? "true" : "false"}
              onClick={() => setView(value)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isActive
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* 中央: 日付ナビゲーション */}
      <div className="flex items-center gap-2 xl:flex-1 xl:justify-center">
        <Button
          variant="outline"
          size="icon"
          onClick={goPrevious}
          aria-label="前へ"
        >
          <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goToday}
          disabled={isAlreadyToday}
          title={isAlreadyToday ? "既に今日を表示しています" : undefined}
        >
          <IconCalendar className="mr-1.5 h-4 w-4" aria-hidden="true" />
          今日
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={goNext}
          aria-label="次へ"
        >
          <IconChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span
          aria-live="polite"
          className="ml-1 min-w-[10rem] text-center text-base font-semibold text-foreground tabular-nums"
        >
          {dateLabel}
        </span>
      </div>

      {/* 右: フィルター */}
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={spaceId ?? "all"}
          onValueChange={(v) => setSpaceFilter(v === "all" ? null : v)}
          disabled={spaceFilterDisabled}
        >
          <SelectTrigger
            className="w-40"
            aria-label="スペースで絞り込み"
            title={
              spaceFilterDisabled
                ? "スペース別ビューでは全スペースが表示されます"
                : undefined
            }
          >
            <SelectValue placeholder="スペース" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全スペース</SelectItem>
            {spaces.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) =>
            setStatusFilter(getReservationStatusFilterOrAll(v))
          }
        >
          <SelectTrigger className="w-32" aria-label="ステータスで絞り込み">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value={ReservationStatus.PENDING}>
              {RESERVATION_STATUS_LABELS[ReservationStatus.PENDING]}
            </SelectItem>
            <SelectItem value={ReservationStatus.CONFIRMED}>
              {RESERVATION_STATUS_LABELS[ReservationStatus.CONFIRMED]}
            </SelectItem>
            <SelectItem value={ReservationStatus.COMPLETED}>
              {RESERVATION_STATUS_LABELS[ReservationStatus.COMPLETED]}
            </SelectItem>
            <SelectItem value={ReservationStatus.NO_SHOW}>
              {RESERVATION_STATUS_LABELS[ReservationStatus.NO_SHOW]}
            </SelectItem>
            <SelectItem value={ReservationStatus.CANCELLED}>
              {RESERVATION_STATUS_LABELS[ReservationStatus.CANCELLED]}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
