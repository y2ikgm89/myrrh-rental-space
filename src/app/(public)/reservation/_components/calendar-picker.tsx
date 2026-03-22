"use client";

import { useState, type ReactElement } from "react";
import { DayPicker } from "react-day-picker";
import { ja } from "react-day-picker/locale";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { getWeekdayKey } from "@/shared/lib/reservation/time-slots";

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
    <DayPicker
      mode="single"
      locale={ja}
      selected={selectedDate}
      onSelect={onSelect}
      disabled={isDisabledDay}
      showOutsideDays={false}
      classNames={{
        root: "w-full",
        months: "w-full",
        month: "w-full",
        month_caption: "flex justify-center items-center py-2 relative",
        caption_label: "font-heading text-base font-medium tracking-tight",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between px-1 py-2",
        button_previous:
          "min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-surface transition-colors text-muted-foreground hover:text-foreground",
        button_next:
          "min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-surface transition-colors text-muted-foreground hover:text-foreground",
        weekdays: "grid grid-cols-7 mb-1",
        weekday: "text-center text-xs font-medium text-muted-foreground py-2",
        weeks: "w-full",
        week: "grid grid-cols-7",
        day: "relative text-center",
        day_button:
          "min-h-11 md:min-h-10 w-full rounded-lg text-sm font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        selected: "!bg-accent !text-accent-foreground hover:!bg-accent/90",
        disabled: "text-muted-foreground/40 pointer-events-none",
        today: "font-bold text-accent",
        outside: "text-muted-foreground/30",
      }}
    />
  );
}
