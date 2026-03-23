"use client";

import { useState, useTransition, useEffect, type ReactElement } from "react";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { fetchAvailableSlots } from "@/public/actions/availability";
import { CalendarPicker } from "./calendar-picker";
import { TimeSlotGrid } from "./time-slot-grid";
import { DurationPills } from "./duration-pills";
import { GuestStepper } from "./guest-stepper";

const EMPTY_SLOTS: TimeSlot[] = [];

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

function formatDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

interface DateTimeSectionProps {
  readonly spaceId: string;
  readonly spaceCapacity: number;
  readonly businessHours: BusinessHours | null;
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
  spaceId,
  spaceCapacity,
  businessHours,
  selectedDate,
  selectedStartTime,
  selectedDuration,
  numberOfGuests,
  onDateChange,
  onStartTimeChange,
  onDurationChange,
  onGuestsChange,
}: DateTimeSectionProps): ReactElement {
  const [fetchedSlots, setFetchedSlots] = useState<TimeSlot[]>([]);
  const [isFetchingSlots, startFetchTransition] = useTransition();

  const slots = selectedDate && spaceId ? fetchedSlots : EMPTY_SLOTS;
  const maxDuration = selectedStartTime
    ? calcMaxDuration(slots, selectedStartTime)
    : 0;

  useEffect(() => {
    if (!selectedDate || !spaceId) return;
    startFetchTransition(async () => {
      const result = await fetchAvailableSlots(
        spaceId,
        formatDateString(selectedDate),
      );
      setFetchedSlots(result);
    });
  }, [selectedDate, spaceId]);

  return (
    <div className="space-y-6">
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
