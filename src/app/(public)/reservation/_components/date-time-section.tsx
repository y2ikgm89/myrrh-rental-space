"use client";

import type { ReactElement } from "react";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { CalendarPicker } from "./calendar-picker";
import { TimeSlotGrid } from "./time-slot-grid";
import { DurationPills } from "./duration-pills";
import { GuestStepper } from "./guest-stepper";

function calcMaxDuration(
  slots: readonly TimeSlot[],
  startTime: string,
): number {
  const startIdx = slots.findIndex((s) => s.time === startTime);
  if (startIdx === -1) return 0;
  let consecutive = 0;
  for (let i = startIdx; i < slots.length; i++) {
    if (!slots[i]?.available) break;
    consecutive++;
  }
  return consecutive * 30;
}

interface DateTimeSectionProps {
  readonly businessHours: BusinessHours | null;
  readonly slots: readonly TimeSlot[];
  readonly isFetchingSlots: boolean;
  readonly spaceCapacity: number;
  readonly selectedDate: Date | undefined;
  readonly selectedStartTime: string | null;
  readonly selectedDuration: number | null;
  readonly numberOfGuests: number;
  readonly onDateChange: (date: Date | undefined) => void;
  readonly onStartTimeChange: (time: string | null) => void;
  readonly onDurationChange: (minutes: number | null) => void;
  readonly onGuestsChange: (count: number) => void;
}

export function DateTimeSection({
  businessHours,
  slots,
  isFetchingSlots,
  spaceCapacity,
  selectedDate,
  selectedStartTime,
  selectedDuration,
  numberOfGuests,
  onDateChange,
  onStartTimeChange,
  onDurationChange,
  onGuestsChange,
}: DateTimeSectionProps): ReactElement {
  const maxDuration = selectedStartTime
    ? calcMaxDuration(slots, selectedStartTime)
    : 0;

  return (
    <div role="group" aria-label="日時選択" className="space-y-6">
      {/* Row 1: Calendar + Time slots */}
      <div className="grid gap-6 rounded-xl bg-surface p-4 md:grid-cols-2 md:p-6">
        <div>
          <h3 className="mb-3 font-heading text-base tracking-tight">
            日付を選択
          </h3>
          <CalendarPicker
            selectedDate={selectedDate}
            onSelect={onDateChange}
            businessHours={businessHours}
          />
        </div>
        <div>
          {selectedDate ? (
            <>
              <h3 className="mb-3 font-heading text-base tracking-tight">
                時間帯を選択
              </h3>
              <TimeSlotGrid
                slots={slots}
                selectedTime={selectedStartTime}
                onSelect={onStartTimeChange}
                isLoading={isFetchingSlots}
              />
            </>
          ) : (
            <p className="mt-10 text-sm text-muted-foreground">
              カレンダーから日付を選択してください
            </p>
          )}
        </div>
      </div>

      {/* Row 2: Duration pills */}
      {selectedStartTime ? (
        <div className="rounded-xl bg-surface p-4 md:p-6">
          <h3 className="mb-3 font-heading text-base tracking-tight">
            利用時間
          </h3>
          <DurationPills
            selectedMinutes={selectedDuration}
            maxMinutes={maxDuration}
            onSelect={onDurationChange}
          />
        </div>
      ) : null}

      {/* Row 3: Guest count */}
      {selectedDuration ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface/50 px-4 py-3">
          <span className="text-sm font-medium text-foreground">利用人数</span>
          <GuestStepper
            value={numberOfGuests}
            max={spaceCapacity}
            onChange={onGuestsChange}
          />
        </div>
      ) : null}
    </div>
  );
}
