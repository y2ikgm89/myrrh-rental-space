"use client";

import {
  useActionState,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import { useQueryState, parseAsInteger } from "nuqs";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { asConformFieldset } from "@/shared/lib/conform/typed-input-control";
import { formatPrice } from "@/shared/lib/pricing/format";
import { Button } from "@/public/components/design-system/button";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { StepIndicator } from "@/public/components/ui/step-indicator";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
import type { BusinessHours } from "@/shared/lib/json-validators";
import {
  addMinutesToTime,
  formatDateString,
} from "@/shared/lib/reservation/time-slots-utils";
import type { BlockedDateRange } from "@/shared/domain/reservations/availability";
import type { PublicDiscountSettings } from "@/shared/domain/settings/queries/discount";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import { DiscountCombinationMode } from "@/shared/lib/validations/enums/prisma-types";
import { submitReservation } from "@/public/actions/reservation";
import {
  fetchAvailableSlots,
  fetchSpaceBlockedDates,
} from "@/public/actions/availability";
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
  readonly minReservationDuration: number;
  readonly maxReservationDuration: number;
  readonly discountSettings: PublicDiscountSettings;
  readonly prefillData?: PrefillData | undefined;
  readonly initialSpaceId?: string | undefined;
  readonly requiredTerms?: readonly RequiredTerm[] | undefined;
}

export function ReservationForm({
  locations,
  businessHours,
  turnstileSiteKey,
  minReservationDuration,
  maxReservationDuration,
  discountSettings,
  prefillData,
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
    slotsError: false,
    errorMessage: null,
  });

  // ステップは URL クエリ (?step=) を SSoT にする。ブラウザの戻る/進むがそのまま
  // 前/次ステップ移動になり、誤って戻ってもフロー全体を離脱しない（reducer の
  // 選択内容は SPA 遷移中マウントされたまま保持）。shallow 既定で server 再フェッチ無し。
  const [urlStep, setUrlStep] = useQueryState(
    "step",
    parseAsInteger.withDefault(preSelected ? 2 : 1).withOptions({
      history: "push",
    }),
  );

  const [agreedTermsIds, setAgreedTermsIds] = useState<readonly string[]>([]);
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const [isFetchingSlots, startSlotTransition] = useTransition();
  const [blockedRanges, setBlockedRanges] = useState<
    readonly BlockedDateRange[]
  >([]);
  const [, startBlockedTransition] = useTransition();
  const spaceSectionRef = useRef<HTMLElement>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // スペースの臨時休業（BlockedDate）範囲を取得してカレンダー grey-out に使う
  const loadBlockedRanges = (spaceId: string): void => {
    startBlockedTransition(async () => {
      const ranges = await fetchSpaceBlockedDates(spaceId);
      setBlockedRanges(ranges);
    });
  };

  // 初期選択済みスペース（?spaceId= / 単一拠点）の blocked 範囲を mount 時に取得
  const onMountLoadBlocked = useEffectEvent(() => {
    if (auto.spaceId) {
      loadBlockedRanges(auto.spaceId);
    }
  });
  useEffect(() => {
    onMountLoadBlocked();
  }, []);

  const [lastResult, formAction, isPending] = useActionState(
    submitReservation,
    undefined,
  );

  // Server-only validation (bundle 削減): `onValidate` / `constraint` を渡さない
  // と Conform は提交時にサーバへ送信し、`lastResult` 経由でフィールドエラーを反映する
  // (公式: validation.md 「Optional: Client validation. Fallback to server validation if not provided」)。
  const [form, fields] = useForm({
    id: "reservation-form",
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

  // 料金プレビューはサーバー側 createPublicReservationCommand と同じ
  // calculateReservationPrice を SSoT として共有する。クーポンは公開フォームに
  // 入力 UI が無いため null（mypage 経路で適用）。combinationMode はクーポン非対応
  // のため計算結果に影響しないが API 整合のため best デフォルトを渡す。
  const priceCalc =
    currentSpace && state.duration
      ? calculateReservationPrice({
          hourlyPrice: currentSpace.hourlyPrice,
          hours: state.duration / 60,
          durationRules: discountSettings.durationDiscountRules,
          durationDiscountEnabled: discountSettings.durationDiscountEnabled,
          spaceDiscount:
            currentSpace.discountType !== "none" &&
            currentSpace.discountValue != null &&
            currentSpace.discountValue > 0
              ? {
                  discountType: currentSpace.discountType,
                  discountValue: currentSpace.discountValue,
                  durationDiscountOverride:
                    currentSpace.durationDiscountOverride,
                }
              : null,
          coupon: null,
          combinationMode: DiscountCombinationMode.best,
          showWarning: false,
        })
      : null;
  const basePrice = priceCalc?.basePrice ?? null;
  const price = priceCalc?.totalPrice ?? null;

  const isStep1Complete = state.locationId != null && state.spaceId != null;
  const isStep2Complete =
    state.date != null &&
    state.startTime != null &&
    state.duration != null &&
    endTime != null;

  // URL の step を「現在到達可能な最大ステップ」でクランプする。
  // リロードで reducer がリセットされても ?step=3 のまま step3 を描画せず、
  // 前提未充足なら手前に戻す。hideStep1 のときは最小ステップが 2。
  const minStep = hideStep1 ? 2 : 1;
  const maxStep = isStep2Complete ? 3 : isStep1Complete ? 2 : minStep;
  const step = Math.min(Math.max(urlStep, minStep), maxStep) as 1 | 2 | 3;

  const visibleSteps = hideStep1 ? STEPS_WITHOUT_SPACE : ALL_STEPS;
  const displayStep = hideStep1 ? step - 1 : step;

  // --- Render 中 state sync: エラー検出（成功時はサーバーが完了ページへ redirect）---
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult?.status === "error") {
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
    if (autoSpace) {
      loadBlockedRanges(autoSpace);
    } else {
      setTimeout(() => scrollToElement(spaceSectionRef.current), 100);
    }
  }

  function handleSpaceSelect(id: string) {
    dispatch({ type: "selectSpace", id });
    loadBlockedRanges(id);
  }

  // 時間枠の取得（成功=setSlots / 失敗=setSlotsError）。日付選択と再試行で共有。
  function loadSlots(spaceId: string, date: Date) {
    const dateStr = formatDateString(date);
    startSlotTransition(async () => {
      const result = await fetchAvailableSlots(spaceId, dateStr);
      if (result.ok) {
        dispatch({ type: "setSlots", slots: result.slots });
      } else {
        dispatch({ type: "setSlotsError" });
      }
    });
  }

  function handleDateChange(date: Date | undefined) {
    dispatch({ type: "selectDate", date });
    if (date) {
      scrollToSectionAfterRender("reservation-time-slots");
      if (state.spaceId) {
        loadSlots(state.spaceId, date);
      }
    }
  }

  function handleRetrySlots() {
    if (state.spaceId && state.date) {
      loadSlots(state.spaceId, state.date);
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
    void setUrlStep(target);
    dispatch({ type: "clearError" });
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

  // --- Step 3: Customer info (form 送信ステップ) ---
  if (step === 3) {
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
            originalPrice: basePrice,
            spaceDiscountAmount: priceCalc?.spaceDiscount ?? 0,
            durationDiscountAmount: priceCalc?.durationDiscount ?? 0,
            appliedDurationRate:
              priceCalc?.appliedDurationRule?.discountRate ?? null,
            showOriginalPrice: discountSettings.showOriginalPrice,
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
  if (step === 2 && state.spaceId) {
    return (
      <div className="space-y-10">
        {renderStepIndicator()}
        <DateTimeSection
          businessHours={businessHours}
          blockedRanges={blockedRanges}
          slots={state.slots}
          slotsError={state.slotsError}
          isFetchingSlots={isFetchingSlots}
          onRetrySlots={handleRetrySlots}
          spaceCapacity={currentSpace?.capacity ?? 1}
          minDuration={minReservationDuration}
          maxDuration={maxReservationDuration}
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
        <p className="mb-1 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
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
          <p className="mb-1 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
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
