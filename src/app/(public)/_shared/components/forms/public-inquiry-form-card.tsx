"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { IconCircleCheck } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { isValidCustomerType } from "@/shared/lib/validations/enums/guards";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import type { InquiryDefaults } from "@/shared/lib/inquiry/defaults";
import { submitInquiry } from "@/public/actions/inquiry";
import type { z } from "zod";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import { CustomerTypeToggle } from "@/public/components/ui/customer-type-toggle";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TermsConsentChecklist } from "./TermsConsentChecklist";

export type PublicInquiryFormMode = "live" | "preview" | "disabled";

export interface RequiredInquiryTerm {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

type PublicInquiryFormCardProps = {
  readonly mode?: PublicInquiryFormMode;
  readonly turnstileSiteKey?: string | null;
  /**
   * フォーム初期値。マイページログイン中の顧客情報 (姓名 / 法人区分 /
   * メール / 会社名) を Server Component から流し込む。
   * セクション設定の「件名プリセット」も `subject` 経由で渡す。
   * 認証なし or Customer 未紐づけ時は `{}`（フィールドは全空表示）。
   */
  readonly defaults?: InquiryDefaults;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly className?: string;
  readonly formId?: string;
  readonly submitLabel?: string;
  readonly requiredTerms?: readonly RequiredInquiryTerm[];
};

function getModeNote(mode: PublicInquiryFormMode): string {
  if (mode === "preview") {
    return "プレビューでは送信できません。公開ページで実際の問い合わせ導線が有効になります。";
  }

  if (mode === "disabled") {
    return "Builder canvas では見た目のみ確認できます。公開ページで実際の問い合わせ導線が有効になります。";
  }

  return "通常1営業日以内にご返信いたします";
}

function getSubmitLabel(
  mode: PublicInquiryFormMode,
  isPending: boolean,
  submitLabel: string,
): string {
  if (mode !== "live") {
    return submitLabel;
  }

  return isPending ? "送信中..." : submitLabel;
}

const OFFLINE_ERROR_MESSAGE =
  "ネットワーク接続がありません。接続を確認してから再度送信してください。";

export function PublicInquiryFormCard({
  mode = "live",
  turnstileSiteKey = null,
  defaults,
  title,
  description,
  className,
  formId = "public-inquiry-form",
  submitLabel = "送信する",
  requiredTerms = [],
}: PublicInquiryFormCardProps): ReactElement {
  const [submitted, setSubmitted] = useState(false);
  const [agreedTermsIds, setAgreedTermsIds] = useState<readonly string[]>([]);
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const [clientError, setClientError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const isInteractive = mode === "live";
  const hasPrefilledIdentity =
    defaults !== undefined &&
    (defaults.email !== undefined ||
      defaults.lastName !== undefined ||
      defaults.firstName !== undefined);

  const [lastResult, formAction, isPending] = useActionState(
    submitInquiry,
    undefined,
  );

  const initialCustomerType: CustomerType =
    defaults?.customerType ?? CustomerType.PERSONAL;

  const [form, fields] = useForm<z.input<typeof publicInquirySchema>>({
    id: formId,
    lastResult,
    constraint: getZodConstraint(publicInquirySchema),
    defaultValue: {
      customerType: initialCustomerType,
      ...(defaults?.companyName !== undefined && {
        companyName: defaults.companyName,
      }),
      ...(defaults?.lastName !== undefined && { lastName: defaults.lastName }),
      ...(defaults?.firstName !== undefined && {
        firstName: defaults.firstName,
      }),
      ...(defaults?.email !== undefined && { email: defaults.email }),
      ...(defaults?.subject !== undefined && { subject: defaults.subject }),
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: publicInquirySchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });
  const formProps = getFormProps(form);

  const customerTypeControl = useInputControl(fields.customerType);
  const turnstileTokenControl = useInputControl(fields.turnstileToken);

  const customerTypeValue = customerTypeControl.value;
  const customerType: CustomerType = isValidCustomerType(customerTypeValue)
    ? customerTypeValue
    : initialCustomerType;

  // Render 中 state sync (React 公式: Adjusting State Directly During Render)
  // executeConformMutation の `submission.reply({ resetForm: true })` は
  // `{ initialValue: null }` のみ返し status は未設定 (conform v1.19 公式仕様)
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setSubmitted(true);
      setAgreedTermsIds([]);
    }
  }

  // Turnstile widget の DOM 側 reset は副作用 — effect に残す
  useEffect(() => {
    if (lastResult?.status === "error") {
      turnstileRef.current?.reset();
      turnstileTokenControl.change("");
    }
  }, [lastResult, turnstileTokenControl]);

  function handleCustomerTypeChange(type: CustomerType) {
    if (!isInteractive) return;
    customerTypeControl.change(type);
  }

  function handleTurnstileVerify(token: string) {
    turnstileTokenControl.change(token);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
  }

  function toggleTermAgreement(id: string) {
    if (!isInteractive) return;
    setAgreedTermsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    formProps.onSubmit(event);
    if (event.defaultPrevented) return;

    if (!navigator.onLine) {
      event.preventDefault();
      setClientError(OFFLINE_ERROR_MESSAGE);
      return;
    }

    setClientError(null);
  }

  const allTermsAgreed =
    requiredTerms.length === 0 ||
    requiredTerms.every((term) => agreedTermsIds.includes(term.id));
  const isSubmitDisabled = !isInteractive || isPending || !allTermsAgreed;
  const formErrorMessage =
    clientError ??
    (form.errors !== undefined && form.errors.length > 0
      ? form.errors[0]
      : null);

  if (submitted) {
    return (
      <div
        className={cn(
          "border border-border px-8 py-12 text-center md:py-16",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <IconCircleCheck
          className="mx-auto h-10 w-10 text-accent"
          aria-hidden="true"
        />
        <p className="mt-6 text-xs font-medium uppercase tracking-eyebrow text-accent">
          Sent
        </p>
        <p className="mt-4 font-heading text-h3 font-light">
          お問い合わせを受け付けました
        </p>
        <p className="mx-auto mt-4 max-w-[var(--prose-narrow)] leading-relaxed text-muted-foreground">
          確認メールをお送りしましたのでご確認ください。
          <br />
          通常1営業日以内に担当者よりご連絡いたします。
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button variant="editorial" size="sm" href="/spaces">
            スペースを見る
          </Button>
          <Button variant="editorial" size="sm" href="/">
            ホームに戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-8", className)}>
      {title || description ? (
        <div className="space-y-3">
          {title ? (
            <h3 className="font-heading text-2xl font-light tracking-tight text-foreground">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="max-w-[var(--prose-narrow)] text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <CustomerTypeToggle
          id="public-inquiry-type"
          value={customerType}
          onChange={handleCustomerTypeChange}
          disabled={!isInteractive}
        />

        <form
          {...formProps}
          action={isInteractive ? formAction : undefined}
          onSubmit={handleSubmit}
          className="mt-8"
        >
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

          <div className="border border-border p-6 sm:p-8">
            <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
                {customerType === CustomerType.CORPORATE
                  ? "ご担当者情報"
                  : "お客様情報"}
              </p>
              {hasPrefilledIdentity ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="inquiry-prefilled-note"
                >
                  マイページの登録情報を反映しています
                </p>
              ) : null}
            </div>

            <div className="space-y-6">
              {customerType === CustomerType.CORPORATE ? (
                <Input
                  label="会社名・団体名"
                  required
                  disabled={!isInteractive || isPending}
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
                  disabled={!isInteractive || isPending}
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
                  disabled={!isInteractive || isPending}
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
                disabled={!isInteractive || isPending}
                placeholder="mail@example.com"
                autoComplete="email"
                leadingIcon="IconMail"
                {...(fields.email.errors?.[0] !== undefined && {
                  error: fields.email.errors[0],
                })}
                {...getInputProps(fields.email, { type: "email" })}
              />

              <Input
                label="件名"
                required
                disabled={!isInteractive || isPending}
                placeholder="お問い合わせの件名"
                {...(fields.subject.errors?.[0] !== undefined && {
                  error: fields.subject.errors[0],
                })}
                {...getInputProps(fields.subject, { type: "text" })}
              />

              <Textarea
                label="お問い合わせ内容"
                rows={8}
                required
                disabled={!isInteractive || isPending}
                placeholder="お問い合わせ内容をご記入ください"
                {...(fields.message.errors?.[0] !== undefined && {
                  error: fields.message.errors[0],
                })}
                {...getInputProps(fields.message, { type: "text" })}
              />

              {isInteractive ? (
                <TurnstileWidget
                  ref={turnstileRef}
                  siteKey={turnstileSiteKey}
                  action={TURNSTILE_ACTIONS.inquiry}
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                />
              ) : null}
            </div>

            {requiredTerms.length > 0 ? (
              <div className="mt-8 border-t border-border pt-6">
                <TermsConsentChecklist
                  terms={requiredTerms}
                  agreedIds={agreedTermsIds}
                  onToggle={toggleTermAgreement}
                  disabled={!isInteractive || isPending}
                  heading="ご利用規約への同意"
                  variant="flat"
                />
              </div>
            ) : null}
          </div>

          {formErrorMessage !== null ? (
            <div
              className="mt-6 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              role="alert"
            >
              {formErrorMessage}
            </div>
          ) : null}

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Button type="submit" disabled={isSubmitDisabled}>
              {getSubmitLabel(mode, isPending, submitLabel)}
            </Button>
            <p
              className={cn(
                "text-xs",
                isInteractive
                  ? "text-muted-foreground"
                  : "text-muted-foreground/80",
              )}
            >
              {getModeNote(mode)}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
