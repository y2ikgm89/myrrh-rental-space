"use client";

import type { ReactElement, RefObject } from "react";
import type { FieldMetadata } from "@conform-to/react";
import { getInputProps } from "@conform-to/react";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { CustomerTypeToggle } from "@/public/components/ui/customer-type-toggle";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";
import { BookingSummary } from "./booking-summary";
import { StickyBottomBar } from "./sticky-bottom-bar";

// ---------------------------------------------------------------------------
// Types — conform fields SSoT
// ---------------------------------------------------------------------------

export type ReservationFormFields = Required<{
  [K in keyof PublicReservationInput]: FieldMetadata<
    PublicReservationInput[K],
    PublicReservationInput,
    string[]
  >;
}>;

interface RequiredTerm {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

interface CustomerStepProps {
  readonly fields: ReservationFormFields;
  readonly customerType: CustomerType;
  readonly turnstileSiteKey: string | null;
  readonly turnstileRef: RefObject<TurnstileInstance | null>;
  readonly requiredTerms: readonly RequiredTerm[];
  readonly agreedTermsIds: readonly string[];
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly summary: {
    readonly locationName: string;
    readonly spaceName: string;
    readonly date: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly guests: number;
    readonly price: number | null;
  };
  readonly onCustomerTypeChange: (type: CustomerType) => void;
  readonly onTurnstileVerify: (token: string) => void;
  readonly onTurnstileExpire: () => void;
  readonly onToggleTerm: (id: string) => void;
  readonly onBack: () => void;
}

export function CustomerStep({
  fields,
  customerType,
  turnstileSiteKey,
  turnstileRef,
  requiredTerms,
  agreedTermsIds,
  isPending,
  errorMessage,
  summary,
  onCustomerTypeChange,
  onTurnstileVerify,
  onTurnstileExpire,
  onToggleTerm,
  onBack,
}: CustomerStepProps): ReactElement {
  const allTermsAgreed =
    requiredTerms.length === 0 ||
    requiredTerms.every((term) => agreedTermsIds.includes(term.id));
  const isSubmitDisabled = isPending || !allTermsAgreed;

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

      <div className="mt-10">
        <CustomerTypeToggle
          id="reservation-type"
          value={customerType}
          onChange={onCustomerTypeChange}
        />
      </div>

      <div className="mt-8 border border-border p-6 sm:p-8">
        <p className="mb-8 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {customerType === CustomerType.CORPORATE
            ? "ご担当者情報"
            : "お客様情報"}
        </p>

        <div className="space-y-6">
          {customerType === CustomerType.CORPORATE ? (
            <Input
              label="会社名・団体名"
              required
              placeholder="株式会社〇〇"
              autoComplete="organization"
              {...(fields.companyName.errors?.[0] !== undefined && {
                error: fields.companyName.errors[0],
              })}
              {...getInputProps(fields.companyName, { type: "text" })}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Input
              label={
                customerType === CustomerType.CORPORATE ? "担当者 姓" : "姓"
              }
              required
              placeholder="山田"
              autoComplete="family-name"
              {...(fields.lastName.errors?.[0] !== undefined && {
                error: fields.lastName.errors[0],
              })}
              {...getInputProps(fields.lastName, { type: "text" })}
            />
            <Input
              label={
                customerType === CustomerType.CORPORATE ? "担当者 名" : "名"
              }
              required
              placeholder="太郎"
              autoComplete="given-name"
              {...(fields.firstName.errors?.[0] !== undefined && {
                error: fields.firstName.errors[0],
              })}
              {...getInputProps(fields.firstName, { type: "text" })}
            />
          </div>

          <Input
            label="メールアドレス"
            required
            placeholder="mail@example.com"
            leadingIcon="IconMail"
            autoComplete="email"
            {...(fields.email.errors?.[0] !== undefined && {
              error: fields.email.errors[0],
            })}
            {...getInputProps(fields.email, { type: "email" })}
          />

          <Input
            label="電話番号（任意）"
            placeholder="03-1234-5678"
            leadingIcon="IconPhone"
            autoComplete="tel"
            {...(fields.phoneNumber.errors?.[0] !== undefined && {
              error: fields.phoneNumber.errors[0],
            })}
            {...getInputProps(fields.phoneNumber, { type: "tel" })}
          />

          <Textarea
            label="備考（任意）"
            rows={3}
            placeholder="ご要望などございましたらお書きください"
            {...(fields.notes.errors?.[0] !== undefined && {
              error: fields.notes.errors[0],
            })}
            {...getInputProps(fields.notes, { type: "text" })}
          />
        </div>

        {requiredTerms.length > 0 ? (
          <div className="mt-8 space-y-3 border-t border-border pt-6">
            {requiredTerms.map((term) => {
              const isChecked = agreedTermsIds.includes(term.id);
              return (
                <label
                  key={term.id}
                  className="flex min-h-11 items-start gap-3 py-1"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 border-border accent-accent"
                    checked={isChecked}
                    onChange={() => onToggleTerm(term.id)}
                  />
                  <span className="text-sm text-muted-foreground">
                    <a
                      href={`/terms/${term.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline transition-colors hover:text-foreground"
                    >
                      {term.title}
                      <span className="sr-only">（新しいタブで開く）</span>
                    </a>
                    に同意します
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        <div className="mt-6">
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            action={TURNSTILE_ACTIONS.reservation}
            onVerify={onTurnstileVerify}
            onExpire={onTurnstileExpire}
          />
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-6 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-10 hidden md:flex md:items-center md:justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isPending}
        >
          戻る
        </Button>
        <Button type="submit" disabled={isSubmitDisabled}>
          {isPending ? "送信中..." : "予約を確定する"}
        </Button>
      </div>

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
          <Button type="submit" disabled={isSubmitDisabled}>
            {isPending ? "送信中..." : "予約を確定する"}
          </Button>
        </div>
      </StickyBottomBar>
    </div>
  );
}
