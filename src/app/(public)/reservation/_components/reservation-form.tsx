"use client";

import { formatPrice } from "@/shared/lib/pricing/format";
import { useReducer, useRef, useTransition, type ReactElement } from "react";
import Link from "next/link";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { ImageFrame } from "@/public/components/design-system/image-frame";
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
import { fetchAvailableSlots } from "@/public/actions/availability";
import { LocationSelector } from "./location-selector";
import { SpaceSelector } from "./space-selector";
import { DateTimeSection } from "./date-time-section";
import { CustomerStep } from "./customer-step";
import { StickyBottomBar } from "./sticky-bottom-bar";
import { selectionReducer, EMPTY_SLOTS } from "./use-reservation-selection";
import {
  scrollToTop,
  scrollToElement,
  scrollToSectionAfterRender,
} from "./scroll-utils";

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

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

interface PrefillData {
  readonly lastName: string;
  readonly firstName: string;
  readonly email: string;
  readonly phoneNumber: string | null;
  readonly companyName: string | null;
}

interface ReservationFormProps {
  readonly locations: readonly LocationWithSpaces[];
  readonly businessHours: BusinessHours | null;
  readonly turnstileSiteKey: string | null;
  readonly prefillData?: PrefillData | undefined;
  readonly isLoggedIn?: boolean | undefined;
}

export function ReservationForm({
  locations,
  businessHours,
  turnstileSiteKey,
  prefillData,
  isLoggedIn = false,
}: ReservationFormProps): ReactElement {
  const auto = resolveAutoIds(locations);
  const skipStep1 = auto.locationId != null && auto.spaceId != null;

  const [state, dispatch] = useReducer(selectionReducer, {
    locationId: auto.locationId,
    spaceId: auto.spaceId,
    date: undefined,
    startTime: null,
    duration: null,
    guests: 1,
    slots: EMPTY_SLOTS,
    step: skipStep1 ? 2 : 1,
    submitted: false,
    errorMessage: null,
  });

  const [isFetchingSlots, startSlotTransition] = useTransition();
  const spaceSectionRef = useRef<HTMLElement>(null);

  // --- Derived ---
  const currentLocation = locations.find((l) => l.id === state.locationId);
  const currentSpaces = currentLocation?.spaces ?? [];
  const currentSpace = currentSpaces.find((s) => s.id === state.spaceId);

  const endTime =
    state.startTime && state.duration
      ? addMinutesToTime(state.startTime, state.duration)
      : null;
  const price =
    currentSpace && state.duration
      ? (currentSpace.hourlyPrice * state.duration) / 60
      : null;

  const isStep1Complete = state.locationId != null && state.spaceId != null;
  const isStep2Complete =
    state.date != null &&
    state.startTime != null &&
    state.duration != null &&
    endTime != null;

  const visibleSteps = skipStep1 ? STEPS_WITHOUT_SPACE : ALL_STEPS;
  const displayStep = skipStep1 ? state.step - 1 : state.step;

  // --- Form ---
  const { form, isPending, onSubmit } = usePublicForm(
    publicReservationSchema,
    async (data: PublicReservationInput) => {
      const result = await submitReservation(data);
      if (isMutationError(result)) {
        dispatch({ type: "setError", message: result.error });
        return result;
      }
      dispatch({ type: "setSubmitted" });
      return result;
    },
    {
      defaultValues: {
        locationId: auto.locationId ?? "",
        spaceId: auto.spaceId ?? "",
        numberOfGuests: 1,
        lastName: prefillData?.lastName ?? "",
        firstName: prefillData?.firstName ?? "",
        email: prefillData?.email ?? "",
        phoneNumber: prefillData?.phoneNumber ?? "",
      },
    },
  );

  // --- Sync reducer state → RHF (one-way) ---
  function syncFormField(
    field: keyof PublicReservationInput,
    value: string | number,
  ) {
    form.setValue(field, value);
  }

  // --- Handlers ---
  function handleLocationSelect(id: string) {
    const loc = locations.find((l) => l.id === id);
    const autoSpace =
      loc?.spaces.length === 1 ? (loc.spaces[0]?.id ?? null) : null;
    dispatch({ type: "selectLocation", id, autoSpaceId: autoSpace });
    syncFormField("locationId", id);
    syncFormField("spaceId", autoSpace ?? "");
    syncFormField("date", "");
    syncFormField("startTime", "");
    syncFormField("endTime", "");
    // Scroll to space section if multiple spaces revealed
    if (!autoSpace) {
      setTimeout(() => scrollToElement(spaceSectionRef.current), 100);
    }
  }

  function handleSpaceSelect(id: string) {
    dispatch({ type: "selectSpace", id });
    syncFormField("spaceId", id);
    syncFormField("date", "");
    syncFormField("startTime", "");
    syncFormField("endTime", "");
  }

  function handleDateChange(date: Date | undefined) {
    dispatch({ type: "selectDate", date });
    syncFormField("startTime", "");
    syncFormField("endTime", "");
    if (date) {
      syncFormField("date", formatDateString(date));
      scrollToSectionAfterRender("reservation-time-slots");
      // Fetch slots via startTransition (React 19 pattern — no useEffect)
      if (state.spaceId) {
        const spaceId = state.spaceId;
        const dateStr = formatDateString(date);
        startSlotTransition(async () => {
          const result = await fetchAvailableSlots(spaceId, dateStr);
          dispatch({ type: "setSlots", slots: result });
        });
      }
    } else {
      syncFormField("date", "");
    }
  }

  function handleStartTimeChange(time: string | null) {
    dispatch({ type: "selectStartTime", time });
    syncFormField("startTime", time ?? "");
    syncFormField("endTime", "");
    if (time) {
      scrollToSectionAfterRender("reservation-duration");
    }
  }

  function handleDurationChange(minutes: number | null) {
    dispatch({ type: "selectDuration", minutes });
    if (minutes && state.startTime) {
      syncFormField("endTime", addMinutesToTime(state.startTime, minutes));
      scrollToSectionAfterRender("reservation-guests");
    } else {
      syncFormField("endTime", "");
    }
  }

  function handleGuestsChange(count: number) {
    dispatch({ type: "setGuests", count });
    syncFormField("numberOfGuests", count);
  }

  // --- Navigation ---
  function goToStep(target: 1 | 2 | 3) {
    dispatch({ type: "goToStep", step: target });
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
      <div className="mb-10">
        <StepIndicator currentStep={displayStep} steps={visibleSteps} />
      </div>
    );
  }

  function renderStepNavigation(config: {
    onBack?: (() => void) | undefined;
    onNext?: (() => void) | undefined;
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
          {config.onNext ? (
            <Button type="button" variant="primary" onClick={config.onNext}>
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
                <span className="text-lg font-light text-accent">
                  {formatPrice(config.price)}
                </span>
              ) : null}
              {config.onNext ? (
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

  if (state.submitted) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Confirmed
        </p>
        <Heading level={2}>ご予約を受け付けました</Heading>
        <p className="mt-6 max-w-[40ch] mx-auto leading-relaxed text-muted-foreground">
          確認メールをお送りしましたのでご確認ください。
        </p>
        {!isLoggedIn ? (
          <p className="mt-8 text-sm text-muted-foreground">
            次回から入力を省略するにはアカウント連携がおすすめです。{" "}
            <Link
              href="/login"
              className="text-accent underline transition-colors hover:text-foreground"
            >
              アカウント連携はこちら
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  // --- Step 3: Customer info ---
  if (state.step === 3) {
    return (
      <form onSubmit={onSubmit} className="space-y-10">
        {renderStepIndicator()}
        <CustomerStep
          form={form}
          isPending={isPending}
          errorMessage={state.errorMessage}
          turnstileSiteKey={turnstileSiteKey}
          summary={{
            locationName: currentLocation?.name ?? "",
            spaceName: currentSpace?.name ?? "",
            date: state.date ? formatDateString(state.date) : "",
            startTime: state.startTime ?? "",
            endTime: endTime ?? "",
            guests: state.guests,
            price,
          }}
          onBack={() => goToStep(2)}
        />
      </form>
    );
  }

  // --- Step 2: Date & Time ---
  if (state.step === 2 && state.spaceId) {
    return (
      <div className="space-y-10">
        {renderStepIndicator()}
        <DateTimeSection
          businessHours={businessHours}
          slots={state.slots}
          isFetchingSlots={isFetchingSlots}
          spaceCapacity={currentSpace?.capacity ?? 1}
          selectedDate={state.date}
          selectedStartTime={state.startTime}
          selectedDuration={state.duration}
          numberOfGuests={state.guests}
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
    <div className="space-y-10">
      {renderStepIndicator()}

      {/* Location section */}
      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          場所を選択
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          ご利用になる場所をお選びください
        </p>
        {locations.length > 1 ? (
          <LocationSelector
            locations={locations}
            selectedId={state.locationId}
            onSelect={handleLocationSelect}
          />
        ) : currentLocation ? (
          <div className="flex items-center gap-4 border border-accent bg-accent/5 p-4">
            <ImageFrame
              src={currentLocation.imageUrl}
              alt={currentLocation.name}
              width={160}
              height={90}
              aspect="video"
              sizes="160px"
              rounded={false}
              className="w-40 shrink-0"
            />
            <div>
              <span className="font-heading text-base font-light tracking-tight">
                {currentLocation.name}
              </span>
              <span className="mt-1 block truncate text-sm text-muted-foreground">
                {currentLocation.address}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Space section */}
      {state.locationId != null && currentSpaces.length > 1 ? (
        <section ref={spaceSectionRef} className="animate-section-enter">
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            スペースを選択
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            ご利用になるスペースをお選びください
          </p>
          <SpaceSelector
            spaces={currentSpaces}
            selectedId={state.spaceId}
            onSelect={handleSpaceSelect}
          />
        </section>
      ) : null}

      {renderStepNavigation({
        onNext: isStep1Complete ? advanceToStep2 : undefined,
      })}
    </div>
  );
}
