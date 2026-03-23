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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_STEPS = [
  { number: 1, label: "スペース選択" },
  { number: 2, label: "日時選択" },
  { number: 3, label: "情報入力" },
] as const;

const STEPS_WITHOUT_SPACE = ALL_STEPS.filter((s) => s.number !== 1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scrollToTop() {
  const behavior =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth";
  window.scrollTo({ top: 0, behavior });
}

function resolveAutoIds(locations: readonly LocationWithSpaces[]) {
  const locationId = locations.length === 1 ? (locations[0]?.id ?? null) : null;
  const location = locationId
    ? locations.find((l) => l.id === locationId)
    : undefined;
  const spaceId =
    location?.spaces.length === 1 ? (location.spaces[0]?.id ?? null) : null;
  return { locationId, spaceId };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReservationFormProps {
  readonly locations: readonly LocationWithSpaces[];
  readonly businessHours: BusinessHours | null;
}

export function ReservationForm({
  locations,
  businessHours,
}: ReservationFormProps): ReactElement {
  // --- Auto-skip ---
  const auto = resolveAutoIds(locations);
  const skipStep1 = auto.locationId != null && auto.spaceId != null;

  // --- Selection state (Single Source of Truth) ---
  const [selectedLocationId, setSelectedLocationId] = useState(auto.locationId);
  const [selectedSpaceId, setSelectedSpaceId] = useState(auto.spaceId);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(
    null,
  );
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [step, setStep] = useState<1 | 2 | 3>(skipStep1 ? 2 : 1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Derived ---
  const currentLocation = locations.find((l) => l.id === selectedLocationId);
  const currentSpaces = currentLocation?.spaces ?? [];
  const currentSpace = currentSpaces.find((s) => s.id === selectedSpaceId);

  const endTime =
    selectedStartTime && selectedDuration
      ? addMinutesToTime(selectedStartTime, selectedDuration)
      : null;
  const price =
    currentSpace && selectedDuration
      ? (currentSpace.hourlyPrice * selectedDuration) / 60
      : null;

  const isStep1Complete = selectedLocationId != null && selectedSpaceId != null;
  const isStep2Complete =
    selectedDate != null &&
    selectedStartTime != null &&
    selectedDuration != null &&
    endTime != null;

  const visibleSteps = skipStep1 ? STEPS_WITHOUT_SPACE : ALL_STEPS;
  const displayStep = skipStep1 ? step - 1 : step;

  // --- Form ---
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
        locationId: auto.locationId ?? "",
        spaceId: auto.spaceId ?? "",
        numberOfGuests: 1,
      },
    },
  );

  // --- Reset helpers ---
  function resetDateTimeFields() {
    setSelectedDate(undefined);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("date", "");
    form.setValue("startTime", "");
    form.setValue("endTime", "");
  }

  // --- Cascade handlers ---
  function handleLocationSelect(id: string) {
    setSelectedLocationId(id);
    setSelectedSpaceId(null);
    form.setValue("locationId", id);
    form.setValue("spaceId", "");
    resetDateTimeFields();

    const loc = locations.find((l) => l.id === id);
    if (loc?.spaces.length === 1 && loc.spaces[0]) {
      setSelectedSpaceId(loc.spaces[0].id);
      form.setValue("spaceId", loc.spaces[0].id);
    }
  }

  function handleSpaceSelect(id: string) {
    setSelectedSpaceId(id);
    form.setValue("spaceId", id);
    resetDateTimeFields();
  }

  function handleDateChange(date: Date | undefined) {
    setSelectedDate(date);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("startTime", "");
    form.setValue("endTime", "");
    if (date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      form.setValue("date", `${y}-${m}-${d}`);
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
      form.setValue("endTime", addMinutesToTime(selectedStartTime, minutes));
    } else {
      form.setValue("endTime", "");
    }
  }

  function handleGuestsChange(count: number) {
    setNumberOfGuests(count);
    form.setValue("numberOfGuests", count);
  }

  // --- Navigation ---
  function goToStep(target: 1 | 2 | 3) {
    setStep(target);
    setErrorMessage(null);
    scrollToTop();
  }

  async function advanceToStep2() {
    const valid = await form.trigger(["locationId", "spaceId"]);
    if (valid && isStep1Complete) goToStep(2);
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
    if (valid && isStep2Complete) goToStep(3);
  }

  // --- Render helpers ---
  function renderStepIndicator() {
    return (
      <div className="mb-8">
        <StepIndicator currentStep={displayStep} steps={visibleSteps} />
      </div>
    );
  }

  function renderStepNavigation(config: {
    onBack?: (() => void) | undefined;
    onNext?: (() => void) | undefined;
    nextDisabled?: boolean | undefined;
    price?: number | null | undefined;
  }) {
    return (
      <>
        {/* Desktop */}
        <div className="mt-10 hidden md:flex md:items-center md:justify-between">
          {config.onBack ? (
            <Button type="button" variant="secondary" onClick={config.onBack}>
              戻る
            </Button>
          ) : (
            <div />
          )}
          {config.onNext && !config.nextDisabled ? (
            <Button type="button" onClick={config.onNext}>
              次へ
            </Button>
          ) : null}
        </div>

        {/* Mobile */}
        <div className="h-20 md:hidden" />
        <StickyBottomBar>
          <div className="flex items-center justify-between gap-4">
            {config.onBack ? (
              <Button
                type="button"
                variant="secondary"
                onClick={config.onBack}
                className="shrink-0"
              >
                戻る
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              {config.price != null ? (
                <span className="font-heading text-lg text-accent">
                  &yen;{config.price.toLocaleString()}
                </span>
              ) : null}
              {config.onNext && !config.nextDisabled ? (
                <Button type="button" onClick={config.onNext}>
                  次へ
                </Button>
              ) : null}
            </div>
          </div>
        </StickyBottomBar>
      </>
    );
  }

  // =========================================================================
  // Render
  // =========================================================================

  if (locations.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        現在予約可能なスペースがありません
      </p>
    );
  }

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

  // --- Step 3: Customer info ---
  if (step === 3) {
    return (
      <form onSubmit={onSubmit}>
        {renderStepIndicator()}
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
        {renderStepIndicator()}
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
        {renderStepNavigation({
          onBack: skipStep1 ? undefined : () => goToStep(1),
          onNext: isStep2Complete ? advanceToStep3 : undefined,
          price,
        })}
      </div>
    );
  }

  // --- Step 1: Location + Space ---
  return (
    <div className="space-y-8">
      {renderStepIndicator()}

      {locations.length > 1 ? (
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

      {selectedLocationId != null && currentSpaces.length > 1 ? (
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
