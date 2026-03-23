"use client";

/**
 * ReservationForm — 2-step adaptive reservation form
 *
 * Step 1: Space + date/time selection (2-column desktop, stacked mobile)
 * Step 2: Customer information + booking summary + submit
 */

import { useState, useTransition, useRef, type ReactElement } from "react";
import { useWatch } from "react-hook-form";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
import { submitReservation } from "@/public/actions/reservation";
import { fetchAvailableSlots } from "@/public/actions/availability";
import { isMutationError } from "@/shared/lib/mutation-result";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
import { SpaceSelector, type SpaceOption } from "./space-selector";
import { CalendarPicker } from "./calendar-picker";
import { TimeSlotGrid } from "./time-slot-grid";
import { DurationPills } from "./duration-pills";
import { GuestStepper } from "./guest-stepper";
import { BookingSummary } from "./booking-summary";
import { StickyBottomBar } from "./sticky-bottom-bar";
import { CustomerStep } from "./customer-step";

function formatDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

export function ReservationForm({
  spaces,
  businessHours,
}: {
  readonly spaces: readonly SpaceOption[];
  readonly businessHours: BusinessHours | null;
}): ReactElement {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isFetchingSlots, startFetchTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(
    null,
  );
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const timeGridRef = useRef<HTMLDivElement>(null);

  const { form, isPending, onSubmit } = usePublicForm(
    publicReservationSchema,
    async (data) => {
      setErrorMessage(null);
      const result = await submitReservation(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setSubmitted(true);
      }
      return result;
    },
    {
      defaultValues: {
        spaceId: spaces.length === 1 ? (spaces[0]?.id ?? "") : "",
        numberOfGuests: 1,
      },
    },
  );

  const [spaceId, numberOfGuests] = useWatch({
    control: form.control,
    name: ["spaceId", "numberOfGuests"],
  });
  const selectedSpace = spaces.find((s) => s.id === spaceId);

  // Derived: endTime from startTime + duration
  const endTime =
    selectedStartTime !== null && selectedDuration !== null
      ? addMinutesToTime(selectedStartTime, selectedDuration)
      : null;

  // Derived: max duration from consecutive available slots
  const maxDuration = (() => {
    if (selectedStartTime === null) return 0;
    const startIndex = slots.findIndex((s) => s.time === selectedStartTime);
    if (startIndex === -1) return 0;
    let consecutive = 0;
    for (let i = startIndex; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot || !slot.available) break;
      consecutive++;
    }
    return consecutive * 30;
  })();

  // Derived: price
  const price =
    selectedSpace && selectedDuration !== null
      ? Math.floor(selectedSpace.hourlyPrice * (selectedDuration / 60))
      : null;

  // Derived: isStep1Complete
  const isStep1Complete =
    spaceId !== "" &&
    spaceId !== undefined &&
    selectedDate !== undefined &&
    selectedStartTime !== null &&
    selectedDuration !== null &&
    endTime !== null &&
    (numberOfGuests ?? 0) >= 1;

  const fetchSlots = (fetchSpaceId: string, date: Date) => {
    const dateStr = formatDateToISO(date);
    startFetchTransition(async () => {
      const result = await fetchAvailableSlots(fetchSpaceId, dateStr);
      setSlots(result);
    });
  };

  const handleSpaceSelect = (id: string) => {
    form.setValue("spaceId", id);
    form.setValue("numberOfGuests", 1);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    if (selectedDate) {
      fetchSlots(id, selectedDate);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    if (date) {
      form.setValue("date", formatDateToISO(date));
      const currentSpaceId = form.getValues("spaceId");
      if (currentSpaceId) {
        fetchSlots(currentSpaceId, date);
      }
      // Scroll to time grid on mobile only
      if (window.matchMedia("(max-width: 767px)").matches) {
        requestAnimationFrame(() => {
          timeGridRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    }
  };

  const handleStartTimeSelect = (time: string) => {
    setSelectedStartTime(time);
    setSelectedDuration(null);
    form.setValue("startTime", time);
  };

  const handleDurationSelect = (minutes: number) => {
    if (selectedStartTime === null) return;
    setSelectedDuration(minutes);
    const computedEndTime = addMinutesToTime(selectedStartTime, minutes);
    form.setValue("endTime", computedEndTime);
  };

  const handleGuestChange = (value: number) => {
    form.setValue("numberOfGuests", value);
  };

  const goToStep2 = async () => {
    const isValid = await form.trigger([
      "spaceId",
      "date",
      "startTime",
      "endTime",
      "numberOfGuests",
    ]);
    if (!isValid) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBackToStep1 = () => {
    setStep(1);
  };

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="rounded-lg border border-accent/20 bg-surface p-8 text-center">
          <h2 className="font-heading text-xl tracking-tight">
            ご予約を受け付けました
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            予約内容を確認の上、担当者よりご連絡いたします。
            <br />
            確定後に確認メールをお送りします。
          </p>
        </div>
      </ScrollReveal>
    );
  }

  if (step === 2) {
    return (
      <form onSubmit={onSubmit}>
        <CustomerStep
          form={form}
          isPending={isPending}
          errorMessage={errorMessage}
          summary={{
            spaceName: selectedSpace?.name ?? "",
            date: selectedDate ? formatDateToISO(selectedDate) : "",
            startTime: selectedStartTime ?? "",
            endTime: endTime ?? "",
            guests: numberOfGuests ?? 1,
            price,
          }}
          onBack={goBackToStep1}
        />
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {/* Space selector */}
      {spaces.length > 1 ? (
        <div className="mb-8">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            スペースを選択
          </h3>
          <SpaceSelector
            spaces={spaces}
            selectedId={spaceId ?? ""}
            onSelect={handleSpaceSelect}
          />
        </div>
      ) : null}

      {/* 2-column grid: calendar + selections */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Left column: Calendar */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            日付を選択
          </h3>
          <div className="rounded-lg border border-border bg-card p-3">
            <CalendarPicker
              selectedDate={selectedDate}
              onSelect={handleDateSelect}
              businessHours={businessHours}
            />
          </div>
        </div>

        {/* Right column: Time + Duration + Guests */}
        <div ref={timeGridRef}>
          {/* Time slots — shown after date selection */}
          {selectedDate ? (
            <div>
              <h3 className="mb-3 text-sm font-medium text-foreground">
                開始時間を選択
              </h3>
              <TimeSlotGrid
                slots={slots}
                selectedTime={selectedStartTime}
                onSelect={handleStartTimeSelect}
                isLoading={isFetchingSlots}
              />
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                カレンダーから日付を選択してください
              </p>
            </div>
          )}

          {/* Duration pills — shown after start time */}
          {selectedStartTime !== null ? (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-medium text-foreground">
                利用時間を選択
              </h3>
              <DurationPills
                selectedMinutes={selectedDuration}
                onSelect={handleDurationSelect}
                maxMinutes={maxDuration}
              />
            </div>
          ) : null}

          {/* Guest stepper — shown after duration selection */}
          {selectedDuration !== null && selectedSpace ? (
            <div className="mt-6">
              <GuestStepper
                value={numberOfGuests ?? 1}
                onChange={handleGuestChange}
                max={selectedSpace.capacity}
              />
            </div>
          ) : null}

          {/* Desktop: Summary + CTA (hidden on mobile) */}
          {isStep1Complete ? (
            <div className="mt-6 hidden md:block">
              <BookingSummary
                spaceName={selectedSpace?.name ?? ""}
                date={selectedDate ? formatDateToISO(selectedDate) : ""}
                startTime={selectedStartTime ?? ""}
                endTime={endTime ?? ""}
                guests={numberOfGuests ?? 1}
                price={price}
              />
              <div className="mt-4">
                <Button
                  type="button"
                  onClick={() => {
                    void goToStep2();
                  }}
                >
                  お客様情報の入力へ
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile: Sticky bottom bar */}
      {isStep1Complete ? (
        <>
          <div className="h-20 md:hidden" />
          <StickyBottomBar>
            <div className="flex items-center justify-between">
              <div>
                {price !== null ? (
                  <p className="font-heading text-lg text-accent">
                    &yen;{price.toLocaleString()}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {selectedStartTime} → {endTime}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  void goToStep2();
                }}
              >
                次へ
              </Button>
            </div>
          </StickyBottomBar>
        </>
      ) : null}
    </form>
  );
}
