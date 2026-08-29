"use client";

import type { ReactElement, RefObject } from "react";
import Link from "next/link";
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
import { TermsConsentChecklist } from "@/public/components/forms/TermsConsentChecklist";
import { BookingSummary } from "./booking-summary";
import type { ReservationConfirmPricePreview } from "./format-reservation-confirm-total";
import { RefundPolicyNotice } from "@/public/components/ui/refund-policy-notice";
import { StickyBottomBar } from "@/public/components/ui/sticky-bottom-bar";

// ---------------------------------------------------------------------------
// Types — conform fields SSoT
// ---------------------------------------------------------------------------

export type ReservationFormFields = Required<{
  [K in keyof PublicReservationInput]: FieldMetadata<
    PublicReservationInput[K],
    PublicReservationInput
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
  readonly isLoggedIn: boolean;
  readonly errorMessage: string | null;
  /**
   * conform の `form.errorId`（監査 A-42）。
   *
   * `getFormProps` はエラー時に `aria-describedby` を必ず出すので、その id を持つ
   * 要素が無いと参照先の無い `aria-describedby` になる。form-level エラーの
   * 描画はこの子コンポーネント側なので、id を受け渡す。
   */
  readonly formErrorId: string;
  readonly summary: {
    readonly locationName: string;
    readonly spaceName: string;
    readonly date: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly guests: number;
    readonly price: number | null;
    readonly confirmPricing?: ReservationConfirmPricePreview | null;
    /** 料金プレビューの取得に失敗したか（監査 F-39）。 */
    readonly priceUnavailable?: boolean;
    readonly originalPrice: number | null;
    readonly spaceDiscountAmount: number;
    readonly durationDiscountAmount: number;
    readonly appliedDurationRate: number | null;
    readonly showOriginalPrice: boolean;
  };
  readonly onCustomerTypeChange: (type: CustomerType) => void;
  readonly onToggleTerm: (id: string) => void;
  readonly onBack: () => void;
  readonly refundPolicyLines?: readonly string[] | undefined;
}

export function CustomerStep({
  fields,
  customerType,
  turnstileSiteKey,
  turnstileRef,
  requiredTerms,
  agreedTermsIds,
  isPending,
  isLoggedIn,
  errorMessage,
  formErrorId,
  summary,
  onCustomerTypeChange,
  onToggleTerm,
  onBack,
  refundPolicyLines,
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
      {!isLoggedIn && (
        <p className="mb-6 text-sm text-muted-foreground">
          ご登録済みの方は
          <Link
            href="/login?redirect=/reservation"
            className="underline underline-offset-4 hover:text-foreground"
          >
            ログイン
          </Link>
          すると入力が省略されます。
        </p>
      )}
      <BookingSummary
        locationName={summary.locationName}
        spaceName={summary.spaceName}
        date={summary.date}
        startTime={summary.startTime}
        endTime={summary.endTime}
        guests={summary.guests}
        price={summary.price}
        {...(summary.confirmPricing !== undefined
          ? { confirmPricing: summary.confirmPricing }
          : {})}
        {...(summary.priceUnavailable !== undefined
          ? { priceUnavailable: summary.priceUnavailable }
          : {})}
        originalPrice={summary.originalPrice}
        spaceDiscountAmount={summary.spaceDiscountAmount}
        durationDiscountAmount={summary.durationDiscountAmount}
        appliedDurationRate={summary.appliedDurationRate}
        showOriginalPrice={summary.showOriginalPrice}
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

          <Input
            label="クーポンコード（任意）"
            placeholder="例: WELCOME10"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="coupon-code-hint"
            {...(fields.couponCode.errors?.[0] !== undefined && {
              error: fields.couponCode.errors[0],
            })}
            {...getInputProps(fields.couponCode, { type: "text" })}
          />
          <p
            id="coupon-code-hint"
            className="-mt-2 text-xs text-muted-foreground"
          >
            クーポンをお持ちの方は入力してください（大文字・数字）
          </p>

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

        <RefundPolicyNotice
          lines={refundPolicyLines}
          className="mt-8 border-t border-border pt-6"
        />

        {requiredTerms.length > 0 ? (
          <div className="mt-8 border-t border-border pt-6">
            <TermsConsentChecklist
              terms={requiredTerms}
              agreedIds={agreedTermsIds}
              onToggle={onToggleTerm}
              disabled={isPending}
              heading="ご利用規約への同意"
              variant="flat"
            />
          </div>
        ) : null}

        <div className="mt-6">
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            action={TURNSTILE_ACTIONS.reservation}
          />
        </div>
      </div>

      {errorMessage ? (
        <div
          id={formErrorId}
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
      <StickyBottomBar hiddenFrom="md">
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
