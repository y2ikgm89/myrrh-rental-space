"use client";

import type { ReactElement } from "react";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import type { BlockedDateRange } from "@/shared/domain/reservations/availability";
import { CalendarPicker } from "./calendar-picker";
import { ClosureNotice } from "./closure-notice";
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
  readonly blockedRanges: readonly BlockedDateRange[];
  readonly slots: readonly TimeSlot[];
  readonly slotsError: boolean;
  readonly isFetchingSlots: boolean;
  readonly onRetrySlots: () => void;
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
  blockedRanges,
  slots,
  slotsError,
  isFetchingSlots,
  onRetrySlots,
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
    <div role="group" aria-label="日時選択" className="space-y-10">
      {/* Calendar */}
      <section id="reservation-calendar">
        <p className="mb-4 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          日付を選択
        </p>
        <ClosureNotice ranges={blockedRanges} />
        <CalendarPicker
          selectedDate={selectedDate}
          onSelect={onDateChange}
          businessHours={businessHours}
          blockedRanges={blockedRanges}
        />
      </section>

      {/* Time slots */}
      {selectedDate ? (
        <section id="reservation-time-slots">
          <p className="mb-4 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            時間帯を選択
          </p>
          <TimeSlotGrid
            slots={slots}
            selectedTime={selectedStartTime}
            onSelect={onStartTimeChange}
            isLoading={isFetchingSlots}
            hasError={slotsError}
            onRetry={onRetrySlots}
          />
        </section>
      ) : null}

      {/* Row 2: Duration pills */}
      {selectedStartTime ? (
        <section id="reservation-duration">
          <p className="mb-4 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            利用時間
          </p>
          <DurationPills
            selectedMinutes={selectedDuration}
            maxMinutes={maxDuration}
            onSelect={onDurationChange}
          />
        </section>
      ) : null}

      {/* Row 3: Guest count */}
      {selectedDuration ? (
        <section id="reservation-guests">
          <p className="mb-4 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            利用人数
          </p>
          <GuestStepper
            value={numberOfGuests}
            max={spaceCapacity}
            onChange={onGuestsChange}
          />
        </section>
      ) : null}
    </div>
  );
}
