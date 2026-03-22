"use client";

import type { ReactElement } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";
import { BookingSummary } from "./booking-summary";
import { StickyBottomBar } from "./sticky-bottom-bar";

interface CustomerStepProps {
  readonly form: UseFormReturn<PublicReservationInput>;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly summary: {
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
  summary,
  onBack,
}: CustomerStepProps): ReactElement {
  return (
    <div>
      {/* Booking summary card */}
      <div className="mb-8">
        <BookingSummary
          spaceName={summary.spaceName}
          date={summary.date}
          startTime={summary.startTime}
          endTime={summary.endTime}
          guests={summary.guests}
          price={summary.price}
          onEdit={onBack}
        />
      </div>

      <h2 className="mb-6 font-heading text-xl tracking-tight md:text-2xl">
        お客様情報
      </h2>

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          id="reservation-lastname"
          label="姓"
          type="text"
          placeholder="山田"
          {...(form.formState.errors.lastName?.message && {
            error: form.formState.errors.lastName.message,
          })}
          {...form.register("lastName")}
        />
        <Input
          id="reservation-firstname"
          label="名"
          type="text"
          placeholder="太郎"
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
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
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

      {/* Error message */}
      {errorMessage ? (
        <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {/* Desktop: inline buttons */}
      <div className="mt-8 hidden flex-col gap-3 sm:flex-row sm:gap-4 md:flex">
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
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            disabled={isPending}
            className="flex-1"
          >
            戻る
          </Button>
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? "送信中..." : "予約を確定する"}
          </Button>
        </div>
      </StickyBottomBar>
    </div>
  );
}
