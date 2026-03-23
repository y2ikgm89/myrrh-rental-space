"use client";

import { useState, type ReactElement } from "react";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { StepIndicator } from "@/public/components/ui/step-indicator";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  publicReservationSchema,
  type PublicReservationInput,
} from "@/shared/lib/validations/public-reservation";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { addMinutesToTime } from "@/shared/lib/reservation/time-slots-utils";
import { submitReservation } from "@/public/actions/reservation";
import { LocationSelector } from "./location-selector";
import { SpaceSelector } from "./space-selector";
import { DateTimeSection } from "./date-time-section";
import { CustomerStep } from "./customer-step";
import { StickyBottomBar } from "./sticky-bottom-bar";

function scrollToTop() {
  const behavior =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth";
  window.scrollTo({ top: 0, behavior });
}

const RESERVATION_STEPS = [
  { number: 1, label: "スペース選択" },
  { number: 2, label: "日時選択" },
  { number: 3, label: "情報入力" },
] as const;

interface ReservationFormProps {
  readonly locations: readonly LocationWithSpaces[];
  readonly businessHours: BusinessHours | null;
}

export function ReservationForm({
  locations,
  businessHours,
}: ReservationFormProps): ReactElement {
  // --- Auto-skip logic ---
  const autoLocationId =
    locations.length === 1 ? (locations[0]?.id ?? null) : null;
  const autoLocation = autoLocationId
    ? locations.find((l) => l.id === autoLocationId)
    : null;
  const autoSpaceId =
    autoLocation?.spaces.length === 1
      ? (autoLocation.spaces[0]?.id ?? null)
      : null;

  // Skip step 1 entirely when both location and space are auto-selected
  const skipStep1 = autoLocationId != null && autoSpaceId != null;

  // --- Selection state (Single Source of Truth) ---
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    autoLocationId,
  );
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    autoSpaceId,
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(
    null,
  );
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [step, setStep] = useState<1 | 2 | 3>(skipStep1 ? 2 : 1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Derived values ---
  const currentLocation = locations.find((l) => l.id === selectedLocationId);
  const currentSpaces = currentLocation?.spaces ?? [];
  const currentSpace = currentSpaces.find((s) => s.id === selectedSpaceId);

  const showLocationSelector = locations.length > 1;
  const showSpaceSelector =
    selectedLocationId != null && currentSpaces.length > 1;

  const endTime =
    selectedStartTime && selectedDuration
      ? addMinutesToTime(selectedStartTime, selectedDuration)
      : null;
  const price =
    currentSpace && selectedDuration
      ? (currentSpace.hourlyPrice * selectedDuration) / 60
      : null;

  // --- Visible steps (skip step 1 when auto-selected) ---
  const visibleSteps = skipStep1
    ? RESERVATION_STEPS.filter((s) => s.number !== 1)
    : RESERVATION_STEPS;
  // Map display step for indicator: when step1 skipped, step 2 shows as position 1
  const displayStep = skipStep1 ? step - 1 : step;

  // --- react-hook-form (3-arg signature: schema, action, options) ---
  const { form, isPending, onSubmit } = usePublicForm(
    publicReservationSchema,
    async (data: PublicReservationInput) => {
      const result = await submitReservation(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
        return result;
      }
      setSubmitted(true);
      return result;
    },
    {
      defaultValues: {
        locationId: autoLocationId ?? "",
        spaceId: autoSpaceId ?? "",
        numberOfGuests: 1,
      },
    },
  );

  // --- Cascade reset handlers ---
  function handleLocationSelect(id: string) {
    setSelectedLocationId(id);
    form.setValue("locationId", id);

    // Reset downstream
    setSelectedSpaceId(null);
    setSelectedDate(undefined);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("spaceId", "");
    form.setValue("date", "");
    form.setValue("startTime", "");
    form.setValue("endTime", "");

    // Auto-select space if only one
    const loc = locations.find((l) => l.id === id);
    if (loc?.spaces.length === 1 && loc.spaces[0]) {
      setSelectedSpaceId(loc.spaces[0].id);
      form.setValue("spaceId", loc.spaces[0].id);
    }
  }

  function handleSpaceSelect(id: string) {
    setSelectedSpaceId(id);
    form.setValue("spaceId", id);

    // Reset downstream
    setSelectedDate(undefined);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("date", "");
    form.setValue("startTime", "");
    form.setValue("endTime", "");
  }

  function handleDateChange(date: Date | undefined) {
    setSelectedDate(date);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("startTime", "");
    form.setValue("endTime", "");
    if (date) {
      const dateStr = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      form.setValue("date", dateStr);
    } else {
      form.setValue("date", "");
    }
  }

  function handleStartTimeChange(time: string | null) {
    setSelectedStartTime(time);
    setSelectedDuration(null);
    form.setValue("startTime", time ?? "");
    form.setValue("endTime", "");
  }

  function handleDurationChange(minutes: number | null) {
    setSelectedDuration(minutes);
    if (minutes && selectedStartTime) {
      const end = addMinutesToTime(selectedStartTime, minutes);
      form.setValue("endTime", end);
    } else {
      form.setValue("endTime", "");
    }
  }

  function handleGuestsChange(count: number) {
    setNumberOfGuests(count);
    form.setValue("numberOfGuests", count);
  }

  // --- Step transition ---
  const isStep1Complete = selectedLocationId != null && selectedSpaceId != null;

  const isStep2Complete =
    selectedDate != null &&
    selectedStartTime != null &&
    selectedDuration != null &&
    endTime != null;

  function goToStep(target: 1 | 2 | 3) {
    setStep(target);
    setErrorMessage(null);
    scrollToTop();
  }

  async function advanceToStep2() {
    const valid = await form.trigger(["locationId", "spaceId"]);
    if (valid && isStep1Complete) {
      goToStep(2);
    }
  }

  async function advanceToStep3() {
    const valid = await form.trigger([
      "locationId",
      "spaceId",
      "date",
      "startTime",
      "endTime",
      "numberOfGuests",
    ]);
    if (valid && isStep2Complete) {
      goToStep(3);
    }
  }

  // --- Empty state ---
  if (locations.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        現在予約可能なスペースがありません
      </p>
    );
  }

  // --- Success state ---
  if (submitted) {
    return (
      <div className="py-12 text-center">
        <Heading level={2}>ご予約を受け付けました</Heading>
        <p className="mt-4 text-muted-foreground">
          確認メールをお送りしましたのでご確認ください。
        </p>
      </div>
    );
  }

  // --- Step indicator (always visible) ---
  const stepIndicator = (
    <div className="mb-8">
      <StepIndicator currentStep={displayStep} steps={visibleSteps} />
    </div>
  );

  // --- Step 3: Customer info ---
  if (step === 3) {
    return (
      <form onSubmit={onSubmit}>
        {stepIndicator}
        <CustomerStep
          form={form}
          isPending={isPending}
          errorMessage={errorMessage}
          summary={{
            locationName: currentLocation?.name ?? "",
            spaceName: currentSpace?.name ?? "",
            date: form.getValues("date"),
            startTime: form.getValues("startTime"),
            endTime: form.getValues("endTime"),
            guests: numberOfGuests,
            price,
          }}
          onBack={() => goToStep(2)}
        />
      </form>
    );
  }

  // --- Step 2: Date & Time ---
  if (step === 2 && selectedSpaceId) {
    return (
      <div>
        {stepIndicator}

        <DateTimeSection
          spaceId={selectedSpaceId}
          spaceCapacity={currentSpace?.capacity ?? 1}
          businessHours={businessHours}
          selectedDate={selectedDate}
          selectedStartTime={selectedStartTime}
          selectedDuration={selectedDuration}
          numberOfGuests={numberOfGuests}
          onDateChange={handleDateChange}
          onStartTimeChange={handleStartTimeChange}
          onDurationChange={handleDurationChange}
          onGuestsChange={handleGuestsChange}
        />

        {/* Desktop: Navigation buttons */}
        <div className="mt-10 hidden md:flex md:items-center md:justify-between">
          {!skipStep1 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => goToStep(1)}
            >
              戻る
            </Button>
          ) : (
            <div />
          )}
          {isStep2Complete ? (
            <Button type="button" onClick={advanceToStep3}>
              次へ
            </Button>
          ) : null}
        </div>

        {/* Mobile: Sticky bottom bar with back + next */}
        <div className="h-20 md:hidden" />
        <StickyBottomBar>
          <div className="flex items-center justify-between gap-4">
            {!skipStep1 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => goToStep(1)}
                className="shrink-0"
              >
                戻る
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              {price !== null ? (
                <span className="font-heading text-lg text-accent">
                  &yen;{price.toLocaleString()}
                </span>
              ) : null}
              {isStep2Complete ? (
                <Button type="button" onClick={advanceToStep3}>
                  次へ
                </Button>
              ) : null}
            </div>
          </div>
        </StickyBottomBar>
      </div>
    );
  }

  // --- Step 1: Location + Space selection ---
  return (
    <div className="space-y-8">
      {stepIndicator}

      {/* Location selection */}
      {showLocationSelector ? (
        <section>
          <Heading level={3} className="mb-4">
            場所を選択
          </Heading>
          <LocationSelector
            locations={locations}
            selectedId={selectedLocationId}
            onSelect={handleLocationSelect}
          />
        </section>
      ) : null}

      {/* Space selection (shown after location is selected) */}
      {showSpaceSelector ? (
        <section className="animate-section-enter">
          <Heading level={3} className="mb-4">
            スペースを選択
          </Heading>
          <SpaceSelector
            spaces={currentSpaces}
            selectedId={selectedSpaceId}
            onSelect={handleSpaceSelect}
          />
        </section>
      ) : null}

      {/* Next button */}
      {isStep1Complete ? (
        <div className="flex justify-end">
          <Button type="button" onClick={advanceToStep2}>
            次へ
          </Button>
        </div>
      ) : null}
    </div>
  );
}
