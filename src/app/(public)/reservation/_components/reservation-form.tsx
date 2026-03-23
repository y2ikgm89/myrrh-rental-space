"use client";

import { useState, useRef, type ReactElement } from "react";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
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
import { BookingSummary } from "./booking-summary";
import { CustomerStep } from "./customer-step";
import { StickyBottomBar } from "./sticky-bottom-bar";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollToRef(ref: React.RefObject<HTMLDivElement | null>) {
  ref.current?.scrollIntoView({
    behavior: prefersReducedMotion() ? "instant" : "smooth",
    block: "start",
  });
}

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
  const [step, setStep] = useState<1 | 2>(1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Derived values ---
  const currentLocation = locations.find((l) => l.id === selectedLocationId);
  const currentSpaces = currentLocation?.spaces ?? [];
  const currentSpace = currentSpaces.find((s) => s.id === selectedSpaceId);

  const showLocationSelector = locations.length > 1;
  const showSpaceSelector =
    selectedLocationId != null && currentSpaces.length > 1;
  const showDateTimeSection = selectedSpaceId != null;

  const endTime =
    selectedStartTime && selectedDuration
      ? addMinutesToTime(selectedStartTime, selectedDuration)
      : null;
  const price =
    currentSpace && selectedDuration
      ? (currentSpace.hourlyPrice * selectedDuration) / 60
      : null;

  // --- Section refs for scroll ---
  const spaceRef = useRef<HTMLDivElement>(null);
  const dateTimeRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

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

  // --- Cascade reset handlers (plain functions — React Compiler handles memoization) ---
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
      setTimeout(() => scrollToRef(dateTimeRef), 100);
    } else {
      setTimeout(() => scrollToRef(spaceRef), 100);
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

    setTimeout(() => scrollToRef(dateTimeRef), 100);
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
  const isStep1Complete =
    selectedLocationId != null &&
    selectedSpaceId != null &&
    selectedDate != null &&
    selectedStartTime != null &&
    selectedDuration != null &&
    endTime != null;

  async function goToStep2() {
    const valid = await form.trigger([
      "locationId",
      "spaceId",
      "date",
      "startTime",
      "endTime",
      "numberOfGuests",
    ]);
    if (valid) {
      setStep(2);
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? "instant" : "smooth",
      });
    }
  }

  function goToStep1() {
    setStep(1);
    setErrorMessage(null);
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

  // --- Step 2: Customer info ---
  if (step === 2) {
    return (
      <form onSubmit={onSubmit}>
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
          onBack={goToStep1}
        />
      </form>
    );
  }

  // --- Step 1: Progressive disclosure ---
  return (
    <form onSubmit={onSubmit} className="space-y-8">
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

      {/* Space selection */}
      {showSpaceSelector ? (
        <section ref={spaceRef} className="animate-section-enter">
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

      {/* Date & Time selection */}
      {showDateTimeSection && selectedSpaceId ? (
        <section ref={dateTimeRef} className="animate-section-enter">
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
        </section>
      ) : null}

      {/* Summary + Next button */}
      {isStep1Complete && currentLocation && currentSpace ? (
        <>
          {/* Desktop summary */}
          <section
            ref={summaryRef}
            className="hidden animate-section-enter md:block"
          >
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <BookingSummary
                  locationName={currentLocation.name}
                  spaceName={currentSpace.name}
                  date={form.getValues("date")}
                  startTime={selectedStartTime ?? ""}
                  endTime={endTime ?? ""}
                  guests={numberOfGuests}
                  price={price}
                />
              </div>
              <Button type="button" onClick={goToStep2}>
                次へ
              </Button>
            </div>
          </section>

          {/* Mobile sticky bar */}
          <div className="h-20 md:hidden" />
          <StickyBottomBar>
            <div className="flex items-center gap-3">
              {price !== null ? (
                <span className="font-heading text-lg text-accent">
                  &yen;{price.toLocaleString()}
                </span>
              ) : null}
              <Button type="button" onClick={goToStep2} className="ml-auto">
                次へ
              </Button>
            </div>
          </StickyBottomBar>
        </>
      ) : null}
    </form>
  );
}
