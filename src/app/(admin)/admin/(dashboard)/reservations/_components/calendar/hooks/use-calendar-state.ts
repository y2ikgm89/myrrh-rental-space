"use client";

import { useQueryStates } from "nuqs";
import { adminCalendarSearchParamsParsers } from "@/shared/lib/nuqs";
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
import { getReservationStatusFilterOrAll } from "@/shared/lib/validations/enums/helpers";
import { toDateString } from "@/shared/lib/serialize";
import type { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

interface UseCalendarStateOptions {
  events: CalendarEvent[];
  spaces: SpaceOption[];
}

export function useCalendarState({ events, spaces }: UseCalendarStateOptions) {
  // history: push は意図的。日付ナビ（goNext/goPrevious）とビュー切替は時系列・
  // 表示の探索ナビゲーションで、戻る＝前の期間が自然（nuqs 公式の navigation-like 該当）。
  // 同一 useQueryStates に同居する spaceId/status も push を共有する。
  // 純粋なフィルタ専用画面の replace 統一とは別カテゴリ。
  const [params, setParams] = useQueryStates(adminCalendarSearchParamsParsers, {
    history: "push",
    shallow: false,
    scroll: false,
  });

  // URL State から読み取り
  const view = getValidCalendarView(params.view, "week");
  const spaceId = params.spaceId || undefined;
  const status = getReservationStatusFilterOrAll(params.status);

  // 日付計算
  // eslint-disable-next-line @eslint-react/purity -- Client-side hook: new Date() is safe here
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
