"use client";

import type { ReactElement } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import { TurnstileWidget } from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { CustomerTypeToggle } from "@/public/components/ui/customer-type-toggle";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";
import { BookingSummary } from "./booking-summary";
import { StickyBottomBar } from "./sticky-bottom-bar";

interface CustomerStepProps {
  readonly form: UseFormReturn<PublicReservationInput>;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly turnstileSiteKey: string | null;
  readonly requiredTerms: ReadonlyArray<{
    id: string;
    title: string;
    slug: string;
    currentVersionId: string;
  }>;
  readonly summary: {
    locationName: string;
    spaceName: string;
    date: string;
    startTime: string;
    endTime: string;
    guests: number;
    price: number | null;
  };
  readonly onBack: () => void;
}

export function CustomerStep({
  form,
  isPending,
  errorMessage,
  turnstileSiteKey,
  requiredTerms,
  summary,
  onBack,
}: CustomerStepProps): ReactElement {
  const customerType = useWatch({
    control: form.control,
    name: "customerType",
  });

  const agreedTermsIds = useWatch({
    control: form.control,
    name: "agreedTermsIds",
  });

  function handleCustomerTypeChange(type: CustomerType) {
    form.setValue("customerType", type);
    if (type === CustomerType.PERSONAL) {
      form.setValue("companyName", "");
      form.clearErrors("companyName");
    }
  }

  function handleTurnstileVerify(token: string) {
    form.setValue("turnstileToken", token);
  }

  function handleTurnstileExpire() {
    form.setValue("turnstileToken", "");
  }

  function scrollFocusedInput(e: React.FocusEvent) {
    const el = e.target;
    if (
      !(el instanceof HTMLInputElement) &&
      !(el instanceof HTMLTextAreaElement)
    )
      return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div onFocus={scrollFocusedInput}>
      {/* Booking summary */}
      <BookingSummary
        locationName={summary.locationName}
        spaceName={summary.spaceName}
        date={summary.date}
        startTime={summary.startTime}
        endTime={summary.endTime}
        guests={summary.guests}
        price={summary.price}
        onEdit={onBack}
      />

      {/* Customer type — outside the form frame */}
      <div className="mt-10">
        <CustomerTypeToggle
          id="reservation-type"
          value={customerType ?? CustomerType.PERSONAL}
          onChange={handleCustomerTypeChange}
        />
      </div>

      {/* Form fields — editorial frame */}
      <div className="mt-8 border border-border p-6 sm:p-8">
        <p className="mb-8 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {customerType === CustomerType.CORPORATE
            ? "ご担当者情報"
            : "お客様情報"}
        </p>

        <div className="space-y-6">
          {customerType === CustomerType.CORPORATE ? (
            <Input
              id="reservation-company"
              label="会社名・団体名"
              type="text"
              required
              placeholder="株式会社〇〇"
              autoComplete="organization"
              {...(form.formState.errors.companyName?.message && {
                error: form.formState.errors.companyName.message,
              })}
              {...form.register("companyName")}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Input
              id="reservation-lastname"
              label={
                customerType === CustomerType.CORPORATE ? "担当者 姓" : "姓"
              }
              type="text"
              required
              placeholder="山田"
              autoComplete="family-name"
              {...(form.formState.errors.lastName?.message && {
                error: form.formState.errors.lastName.message,
              })}
              {...form.register("lastName")}
            />
            <Input
              id="reservation-firstname"
              label={
                customerType === CustomerType.CORPORATE ? "担当者 名" : "名"
              }
              type="text"
              required
              placeholder="太郎"
              autoComplete="given-name"
              {...(form.formState.errors.firstName?.message && {
                error: form.formState.errors.firstName.message,
              })}
              {...form.register("firstName")}
            />
          </div>

          <Input
            id="reservation-email"
            label="メールアドレス"
            type="email"
            required
            placeholder="mail@example.com"
            {...(form.formState.errors.email?.message && {
              error: form.formState.errors.email.message,
            })}
            {...form.register("email")}
          />

          <Input
            id="reservation-phone"
            label="電話番号（任意）"
            type="tel"
            placeholder="03-1234-5678"
            {...(form.formState.errors.phoneNumber?.message && {
              error: form.formState.errors.phoneNumber.message,
            })}
            {...form.register("phoneNumber")}
          />

          <Textarea
            id="reservation-notes"
            label="備考（任意）"
            rows={3}
            placeholder="ご要望などございましたらお書きください"
            {...(form.formState.errors.notes?.message && {
              error: form.formState.errors.notes.message,
            })}
            {...form.register("notes")}
          />
        </div>

        {/* Terms + Turnstile */}
        <div className="mt-6 space-y-3">
          {requiredTerms.map((term) => {
            const isChecked = agreedTermsIds?.includes(term.id) ?? false;
            return (
              <label key={term.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 border-border accent-accent"
                  checked={isChecked}
                  onChange={() => {
                    const current = form.getValues("agreedTermsIds") ?? [];
                    const next = isChecked
                      ? current.filter((id) => id !== term.id)
                      : [...current, term.id];
                    form.setValue("agreedTermsIds", next, {
                      shouldValidate: true,
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  <a
                    href={`/terms/${term.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline transition-colors hover:text-foreground"
                  >
                    {term.title}
                  </a>
                  に同意します
                </span>
              </label>
            );
          })}
          {form.formState.errors.agreedTermsIds?.message ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {form.formState.errors.agreedTermsIds.message}
            </p>
          ) : null}

          <div className="mt-4">
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              action={TURNSTILE_ACTIONS.reservation}
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
            />
          </div>
        </div>
      </div>

      {/* Error message — outside frame */}
      {errorMessage ? (
        <div
          role="alert"
          className="mt-6 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Desktop navigation */}
      <div className="mt-10 hidden md:flex md:items-center md:justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isPending}
        >
          戻る
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "送信中..." : "予約を確定する"}
        </Button>
      </div>

      {/* Mobile navigation */}
      <div className="h-20 md:hidden" />
      <StickyBottomBar>
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            disabled={isPending}
            className="shrink-0"
          >
            戻る
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "送信中..." : "予約を確定する"}
          </Button>
        </div>
      </StickyBottomBar>
    </div>
  );
}
