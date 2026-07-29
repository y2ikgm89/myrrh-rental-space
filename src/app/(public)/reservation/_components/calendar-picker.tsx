"use client";

import { useState, type ReactElement } from "react";
import { DayPicker } from "@daypicker/react";
import { ja } from "@daypicker/react/locale";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { BlockedDateRange } from "@/shared/domain/reservations/availability";
import { DEFAULT_BUSINESS_HOURS_WEEK } from "@/shared/lib/business-hours";
import {
  getWeekdayKey,
  formatDateString,
  isMonthlyClosureDate,
} from "@/shared/lib/reservation/time-slots-utils";

interface CalendarPickerProps {
  readonly selectedDate: Date | undefined;
  readonly onSelect: (date: Date | undefined) => void;
  readonly businessHours: BusinessHours | null;
  readonly blockedRanges?: readonly BlockedDateRange[];
  /** E2E 固定時刻（SSR/CSR 整合）。ISO 8601。 */
  readonly initialNowIso?: string;
}

/**
 * 予約フォーム用 DayPicker。過去日・定休・臨時休業の grey-out は
 * スロット生成と同じ JST / DEFAULT_BUSINESS_HOURS_WEEK フォールバックを使う。
 */
export function CalendarPicker({
  selectedDate,
  onSelect,
  businessHours,
  blockedRanges = [],
  initialNowIso,
}: CalendarPickerProps): ReactElement {
  const [todayJst] = useState(() => {
    if (initialNowIso !== undefined) {
      return formatDateString(new Date(initialNowIso));
    }
    return formatDateString(new Date());
  });
  const effectiveHours = businessHours ?? DEFAULT_BUSINESS_HOURS_WEEK;

  const isBlockedDay = (date: Date): boolean => {
    if (blockedRanges.length === 0) return false;
    const dateStr = formatDateString(date);
    return blockedRanges.some(
      (range) => dateStr >= range.startDate && dateStr <= range.endDate,
    );
  };

  const isDisabledDay = (date: Date): boolean => {
    const dateStr = formatDateString(date);
    if (dateStr < todayJst) return true;
    if (isBlockedDay(date)) return true;
    if (isMonthlyClosureDate(dateStr, effectiveHours.monthlyClosures)) {
      return true;
    }
    const weekday = getWeekdayKey(date);
    const daySettings = effectiveHours[weekday];
    return !daySettings.isOpen || daySettings.slots.length === 0;
  };

  return (
    <div className="rdp-theme">
      <DayPicker
        mode="single"
        locale={ja}
        selected={selectedDate}
        onSelect={onSelect}
        disabled={isDisabledDay}
        showOutsideDays={false}
      />
    </div>
  );
}
