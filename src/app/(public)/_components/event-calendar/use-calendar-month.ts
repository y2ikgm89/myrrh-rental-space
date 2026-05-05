"use client";

import { useState } from "react";
import { useQueryStates } from "nuqs";
import { getJSTDateParts } from "@/public/lib/format-event-date";
import { eventsSearchParamsParsers } from "@/public/lib/search-params";

export interface CalendarMonthState {
  readonly today: { year: number; month: number; day: number };
  readonly year: number;
  /** 0-indexed */
  readonly month: number;
  readonly nowMs: number;
  prev: () => void;
  next: () => void;
  goToday: () => void;
  jump: (year: number, month: number) => void;
}

/**
 * Calendar / 一覧ビュー共通の月状態管理フック。
 * y/m を URL と双方向同期（shallow: true で RSC 再レンダー不要）。
 */
export function useCalendarMonth(): CalendarMonthState {
  const [today] = useState(() => getJSTDateParts(new Date()));
  const [nowMs] = useState(() => Date.now());

  const [{ y: urlYear, m: urlMonth }, setParams] = useQueryStates(
    eventsSearchParamsParsers,
    { history: "push", shallow: true },
  );

  const year = urlYear ?? today.year;
  const month = urlMonth != null ? urlMonth - 1 : today.month;

  function apply(targetYear: number, targetMonth: number) {
    const isToday = targetYear === today.year && targetMonth === today.month;
    void setParams({
      y: isToday ? null : targetYear,
      m: isToday ? null : targetMonth + 1,
    });
  }

  function prev() {
    const ty = month === 0 ? year - 1 : year;
    const tm = month === 0 ? 11 : month - 1;
    apply(ty, tm);
  }

  function next() {
    const ty = month === 11 ? year + 1 : year;
    const tm = month === 11 ? 0 : month + 1;
    apply(ty, tm);
  }

  function goToday() {
    void setParams({ y: null, m: null });
  }

  function jump(targetYear: number, targetMonth: number) {
    apply(targetYear, targetMonth);
  }

  return { today, year, month, nowMs, prev, next, goToday, jump };
}
