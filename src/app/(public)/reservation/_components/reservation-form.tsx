"use client";

import {
  useActionState,
  useEffect,
  useReducer,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import Link from "next/link";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { asConformFieldset } from "@/shared/lib/conform/typed-input-control";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { formatPrice } from "@/shared/lib/pricing/format";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { StepIndicator } from "@/public/components/ui/step-indicator";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { addMinutesToTime } from "@/shared/lib/reservation/time-slots-utils";
import { submitReservation } from "@/public/actions/reservation";
import { fetchAvailableSlots } from "@/public/actions/availability";
import type { TurnstileInstance } from "@/shared/components/turnstile-widget";
import { LocationSelector } from "./location-selector";
import { SpaceSelector } from "./space-selector";
import { DateTimeSection } from "./date-time-section";
import { CustomerStep, type ReservationFormFields } from "./customer-step";
import { StickyBottomBar } from "./sticky-bottom-bar";
import { selectionReducer, EMPTY_SLOTS } from "./use-reservation-selection";
import {
  scrollToTop,
  scrollToElement,
  scrollToSectionAfterRender,
} from "@/public/lib/scroll";

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

function isCustomerType(value: unknown): value is CustomerType {
  return value === CustomerType.PERSONAL || value === CustomerType.CORPORATE;
}

function resolveAutoIds(
  locations: readonly LocationWithSpaces[],
  initialSpaceId: string | undefined,
) {
  if (initialSpaceId) {
    for (const loc of locations) {
      const space = loc.spaces.find((s) => s.id === initialSpaceId);
      if (space) {
        return { locationId: loc.id, spaceId: space.id };
      }
    }
  }

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

interface RequiredTerm {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

interface ReservationFormProps {
  readonly locations: readonly LocationWithSpaces[];
  readonly businessHours: BusinessHours | null;
  readonly turnstileSiteKey: string | null;
  readonly prefillData?: PrefillData | undefined;
  readonly isLoggedIn?: boolean | undefined;
  readonly initialSpaceId?: string | undefined;
  readonly requiredTerms?: readonly RequiredTerm[] | undefined;
}

export function ReservationForm({
  locations,
  businessHours,
  turnstileSiteKey,
  prefillData,
  isLoggedIn = false,
  initialSpaceId,
  requiredTerms = [],
}: ReservationFormProps): ReactElement {
  const auto = resolveAutoIds(locations, initialSpaceId);
  const preSelected = auto.locationId != null && auto.spaceId != null;
  const hideStep1 = preSelected && !initialSpaceId;

  const [state, dispatch] = useReducer(selectionReducer, {
    locationId: auto.locationId,
    spaceId: auto.spaceId,
    date: undefined,
    startTime: null,
    duration: null,
    guests: 1,
    slots: EMPTY_SLOTS,
    step: preSelected ? 2 : 1,
    submitted: false,
    errorMessage: null,
  });

  const [agreedTermsIds, setAgreedTermsIds] = useState<readonly string[]>([]);
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const [isFetchingSlots, startSlotTransition] = useTransition();
  const spaceSectionRef = useRef<HTMLElement>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [lastResult, formAction, isPending] = useActionState(
    submitReservation,
    undefined,
  );

  const [form, fields] = useForm({
    id: "reservation-form",
    constraint: getZodConstraint(publicReservationSchema),
    lastResult,
    defaultValue: {
      locationId: auto.locationId ?? "",
      spaceId: auto.spaceId ?? "",
      numberOfGuests: 1,
      customerType: CustomerType.PERSONAL,
      companyName: "",
      lastName: prefillData?.lastName ?? "",
      firstName: prefillData?.firstName ?? "",
      email: prefillData?.email ?? "",
      phoneNumber: prefillData?.phoneNumber ?? "",
      notes: "",
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: publicReservationSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const customerTypeControl = useInputControl(fields.customerType);
  const turnstileTokenControl = useInputControl(fields.turnstileToken);

  const customerType: CustomerType = isCustomerType(customerTypeControl.value)
    ? customerTypeControl.value
    : CustomerType.PERSONAL;

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

  const visibleSteps = hideStep1 ? STEPS_WITHOUT_SPACE : ALL_STEPS;
  const displayStep = hideStep1 ? state.step - 1 : state.step;

  // --- Render 中 state sync: 成功 / エラー検出 ---
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      dispatch({ type: "setSubmitted" });
    } else if (lastResult?.status === "error") {
      const formErrors = lastResult.error?.[""];
      if (formErrors !== undefined && formErrors !== null && formErrors[0]) {
        dispatch({ type: "setError", message: formErrors[0] });
      }
    }
  }

  // --- Turnstile DOM reset on error ---
  useEffect(() => {
    if (lastResult?.status === "error") {
      turnstileRef.current?.reset();
      turnstileTokenControl.change("");
    }
  }, [lastResult, turnstileTokenControl]);

  // --- Handlers ---
  function handleLocationSelect(id: string) {
    const loc = locations.find((l) => l.id === id);
    const autoSpace =
      loc?.spaces.length === 1 ? (loc.spaces[0]?.id ?? null) : null;
    dispatch({ type: "selectLocation", id, autoSpaceId: autoSpace });
    if (!autoSpace) {
      setTimeout(() => scrollToElement(spaceSectionRef.current), 100);
    }
  }

  function handleSpaceSelect(id: string) {
    dispatch({ type: "selectSpace", id });
  }

  function handleDateChange(date: Date | undefined) {
    dispatch({ type: "selectDate", date });
    if (date) {
      scrollToSectionAfterRender("reservation-time-slots");
      if (state.spaceId) {
        const spaceId = state.spaceId;
        const dateStr = formatDateString(date);
        startSlotTransition(async () => {
          const result = await fetchAvailableSlots(spaceId, dateStr);
          dispatch({ type: "setSlots", slots: result });
        });
      }
    }
  }

  function handleStartTimeChange(time: string | null) {
    dispatch({ type: "selectStartTime", time });
    if (time) {
      scrollToSectionAfterRender("reservation-duration");
    }
  }

  function handleDurationChange(minutes: number | null) {
    dispatch({ type: "selectDuration", minutes });
    if (minutes && state.startTime) {
      scrollToSectionAfterRender("reservation-guests");
    }
  }

  function handleGuestsChange(count: number) {
    dispatch({ type: "setGuests", count });
  }

  function handleCustomerTypeChange(type: CustomerType) {
    customerTypeControl.change(type);
  }

  function handleTurnstileVerify(token: string) {
    turnstileTokenControl.change(token);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
  }

  function toggleTermAgreement(id: string) {
    setAgreedTermsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // --- Navigation ---
  function goToStep(target: 1 | 2 | 3) {
    dispatch({ type: "goToStep", step: target });
    scrollToTop();
  }

  function advanceToStep2() {
    if (isStep1Complete) goToStep(2);
  }

  function advanceToStep3() {
    if (isStep2Complete) goToStep(3);
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
        <p className="mt-6 max-w-[var(--prose-narrow)] mx-auto leading-relaxed text-muted-foreground">
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

  // --- Step 3: Customer info (form 送信ステップ) ---
  if (state.step === 3) {
    return (
      <form {...getFormProps(form)} action={formAction} className="space-y-10">
        {/* Hidden inputs for reducer state-driven values (set via dispatch in earlier steps) */}
        <input
          type="hidden"
          name={fields.locationId.name}
          value={state.locationId ?? ""}
        />
        <input
          type="hidden"
          name={fields.spaceId.name}
          value={state.spaceId ?? ""}
        />
        <input
          type="hidden"
          name={fields.date.name}
          value={state.date ? formatDateString(state.date) : ""}
        />
        <input
          type="hidden"
          name={fields.startTime.name}
          value={state.startTime ?? ""}
        />
        <input type="hidden" name={fields.endTime.name} value={endTime ?? ""} />
        <input
          type="hidden"
          name={fields.numberOfGuests.name}
          value={String(state.guests)}
        />
        <input
          type="hidden"
          name={fields.customerType.name}
          value={customerType}
        />
        <input
          type="hidden"
          name={fields.turnstileToken.name}
          value={turnstileTokenControl.value ?? ""}
        />
        {agreedTermsIds.map((id) => (
          <input
            key={id}
            type="hidden"
            name={fields.agreedTermsIds.name}
            value={id}
          />
        ))}

        {renderStepIndicator()}
        <CustomerStep
          fields={asConformFieldset<ReservationFormFields>(fields)}
          customerType={customerType}
          turnstileSiteKey={turnstileSiteKey}
          turnstileRef={turnstileRef}
          requiredTerms={requiredTerms}
          agreedTermsIds={agreedTermsIds}
          isPending={isPending}
          errorMessage={state.errorMessage}
          summary={{
            locationName: currentLocation?.name ?? "",
            spaceName: currentSpace?.name ?? "",
            date: state.date ? formatDateString(state.date) : "",
            startTime: state.startTime ?? "",
            endTime: endTime ?? "",
            guests: state.guests,
            price,
          }}
          onCustomerTypeChange={handleCustomerTypeChange}
          onTurnstileVerify={handleTurnstileVerify}
          onTurnstileExpire={handleTurnstileExpire}
          onToggleTerm={toggleTermAgreement}
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
          onBack: hideStep1 ? undefined : () => goToStep(1),
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
