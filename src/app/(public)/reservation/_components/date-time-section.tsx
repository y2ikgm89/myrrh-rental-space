"use client";

import {
  useState,
  useTransition,
  useEffect,
  useRef,
  type ReactElement,
} from "react";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { fetchAvailableSlots } from "@/public/actions/availability";
import { CalendarPicker } from "./calendar-picker";
import { TimeSlotGrid } from "./time-slot-grid";
import { DurationPills } from "./duration-pills";
import { GuestStepper } from "./guest-stepper";

const EMPTY_SLOTS: TimeSlot[] = [];

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
  const sectionRef = useRef<HTMLDivElement>(null);

  // Slots are empty when no date or space is selected
  const slots = selectedDate && spaceId ? fetchedSlots : EMPTY_SLOTS;

  // Fetch slots when date changes
  useEffect(() => {
    if (!selectedDate || !spaceId) return;
    const dateStr = [
      selectedDate.getFullYear(),
      String(selectedDate.getMonth() + 1).padStart(2, "0"),
      String(selectedDate.getDate()).padStart(2, "0"),
    ].join("-");

    startFetchTransition(async () => {
      const result = await fetchAvailableSlots(spaceId, dateStr);
      setFetchedSlots(result);
    });
  }, [selectedDate, spaceId]);

  // Calculate max consecutive duration from selected start time
  const maxDuration = (() => {
    if (!selectedStartTime) return 0;
    const startIdx = slots.findIndex((s) => s.time === selectedStartTime);
    if (startIdx === -1) return 0;
    let count = 0;
    for (let i = startIdx; i < slots.length; i++) {
      if (!slots[i]?.available) break;
      count++;
    }
    return count * 30;
  })();

  return (
    <div ref={sectionRef} className="space-y-6">
      {/* Row 1: Calendar (left) + Time slots (right) */}
      <div className="grid gap-6 md:grid-cols-2">
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

      {/* Row 2: Duration pills (full width) */}
      {selectedStartTime ? (
        <div>
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

      {/* Row 3: Guest stepper (shown after duration selected) */}
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
