"use client";

import { useQueryStates, parseAsString } from "nuqs";
import type {
  CalendarView,
  CalendarEvent,
  SpaceOption,
} from "@/admin/lib/calendar";
import {
  getCalendarDateRange,
  navigateNext,
  navigatePrevious,
  getEventsForDay,
  getValidCalendarView,
} from "@/admin/lib/calendar";
import { getReservationStatusFilterOrAll } from "@/shared/lib/validations/enums";
import { toDateString } from "@/shared/lib/serialize";
import type { ReservationStatus } from "@/shared/db/enums";

interface UseCalendarStateOptions {
  events: CalendarEvent[];
  spaces: SpaceOption[];
}

export function useCalendarState({ events, spaces }: UseCalendarStateOptions) {
  const [params, setParams] = useQueryStates(
    {
      view: parseAsString.withDefault(""),
      date: parseAsString.withDefault(""),
      spaceId: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false, scroll: false },
  );

  // URL State から読み取り
  const view = getValidCalendarView(params.view, "week");
  const spaceId = params.spaceId || undefined;
  const status = getReservationStatusFilterOrAll(params.status);

  // 日付計算
  const currentDate = params.date ? new Date(params.date) : new Date();

  // 日付範囲計算
  const dateRange = getCalendarDateRange(currentDate, view);

  // フィルタリング済みイベント
  const filteredEvents = events.filter((event) => {
    if (spaceId && event.spaceId !== spaceId) return false;
    if (status !== "ALL" && event.status !== status) return false;
    return true;
  });

  // ビュー切り替え
  const setView = (newView: CalendarView) => {
    void setParams({ view: newView });
  };

  // 日付ナビゲーション
  const goNext = () => {
    const nextDate = navigateNext(currentDate, view);
    void setParams({ date: toDateString(nextDate) });
  };

  const goPrevious = () => {
    const prevDate = navigatePrevious(currentDate, view);
    void setParams({ date: toDateString(prevDate) });
  };

  const goToday = () => {
    void setParams({ date: null });
  };

  const goToDate = (date: Date) => {
    void setParams({ date: toDateString(date) });
  };

  // フィルター変更
  const setSpaceFilter = (id: string | null) => {
    void setParams({ spaceId: id });
  };

  const setStatusFilter = (newStatus: ReservationStatus | "ALL" | null) => {
    void setParams({ status: newStatus === "ALL" ? null : newStatus });
  };

  // 日別イベント取得
  const getEventsForDayFn = (day: Date) => getEventsForDay(filteredEvents, day);

  return {
    // State
    view,
    currentDate,
    dateRange,
    spaceId,
    status,
    spaces,
    events: filteredEvents,

    // Actions
    setView,
    goNext,
    goPrevious,
    goToday,
    goToDate,
    setSpaceFilter,
    setStatusFilter,
    getEventsForDay: getEventsForDayFn,
  };
}

export type CalendarState = ReturnType<typeof useCalendarState>;
