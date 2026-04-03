"use client";

import type { ReactElement } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import { TurnstileWidget } from "@/public/components/ui/turnstile-widget";
import { CustomerTypeToggle } from "@/public/components/ui/customer-type-toggle";
import type { CustomerType } from "@/shared/lib/validations/inquiry";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";
import { BookingSummary } from "./booking-summary";
import { StickyBottomBar } from "./sticky-bottom-bar";

interface CustomerStepProps {
  readonly form: UseFormReturn<PublicReservationInput>;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly turnstileSiteKey: string | null;
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
  summary,
  onBack,
}: CustomerStepProps): ReactElement {
  const customerType = useWatch({
    control: form.control,
    name: "customerType",
  });

  function handleCustomerTypeChange(type: CustomerType) {
    form.setValue("customerType", type);
    if (type === "personal") {
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
    // Let the browser paint the focus ring, then scroll with header offset
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div onFocus={scrollFocusedInput}>
      {/* Booking summary card */}
      <div className="mb-10">
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
      </div>

      <Heading level={2} className="mb-6">
        お客様情報
      </Heading>

      <div className="mb-5">
        <CustomerTypeToggle
          id="reservation-type"
          value={customerType ?? "personal"}
          onChange={handleCustomerTypeChange}
        />
      </div>

      {customerType === "corporate" ? (
        <div className="mb-5">
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
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          id="reservation-lastname"
          label={customerType === "corporate" ? "担当者 姓" : "姓"}
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
          label={customerType === "corporate" ? "担当者 名" : "名"}
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

      <div className="mt-5">
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
      </div>

      <div className="mt-5">
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
      </div>

      <div className="mt-5">
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

      {/* Terms checkbox */}
      <div className="mt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 border-border accent-primary"
            {...form.register("agreeToTerms")}
          />
          <span className="text-sm text-muted-foreground">
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              利用規約
            </a>
            に同意します
          </span>
        </label>
        {form.formState.errors.agreeToTerms?.message ? (
          <p className="mt-1 text-sm text-destructive">
            {form.formState.errors.agreeToTerms.message}
          </p>
        ) : null}
      </div>

      {/* Turnstile bot protection */}
      <div className="mt-6">
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
        />
      </div>

      {/* Error message */}
      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Desktop: buttons matching step 2 layout (back=left, submit=right) */}
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

      {/* Mobile: Sticky bottom bar */}
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
