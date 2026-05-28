"use client";

import { useState, type ReactElement } from "react";
import { DayPicker } from "@daypicker/react";
import { ja } from "@daypicker/react/locale";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { BlockedDateRange } from "@/shared/domain/reservations/availability";
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
}

export function CalendarPicker({
  selectedDate,
  onSelect,
  businessHours,
  blockedRanges = [],
}: CalendarPickerProps): ReactElement {
  const [minDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const isBlockedDay = (date: Date): boolean => {
    if (blockedRanges.length === 0) return false;
    const dateStr = formatDateString(date);
    return blockedRanges.some(
      (range) => dateStr >= range.startDate && dateStr <= range.endDate,
    );
  };

  const isDisabledDay = (date: Date): boolean => {
    if (date < minDate) return true;
    if (isBlockedDay(date)) return true;
    if (!businessHours) return false;
    // 毎月の繰り返し定休（第N曜日）
    if (isMonthlyClosureDate(date, businessHours.monthlyClosures)) return true;
    const weekday = getWeekdayKey(date);
    const daySettings = businessHours[weekday];
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
        classNames={{
          today: "rdp-today font-bold",
          selected: "rdp-selected",
          disabled: "rdp-disabled",
        }}
      />
    </div>
  );
}
