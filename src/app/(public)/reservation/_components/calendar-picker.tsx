"use client";

import { useState, type ReactElement } from "react";
import { DayPicker } from "react-day-picker";
import { ja } from "react-day-picker/locale";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { getWeekdayKey } from "@/shared/lib/reservation/time-slots-utils";

interface CalendarPickerProps {
  readonly selectedDate: Date | undefined;
  readonly onSelect: (date: Date | undefined) => void;
  readonly businessHours: BusinessHours | null;
}

export function CalendarPicker({
  selectedDate,
  onSelect,
  businessHours,
}: CalendarPickerProps): ReactElement {
  const [minDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const isDisabledDay = (date: Date): boolean => {
    if (date < minDate) return true;
    if (!businessHours) return false;
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
