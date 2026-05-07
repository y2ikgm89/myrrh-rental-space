"use client";

import { useRef, useState, type ReactElement } from "react";
import { useWatch } from "react-hook-form";
import { IconCircleCheck } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import {
  createMutationError,
  isMutationError,
} from "@/shared/lib/mutation-result";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { submitInquiry } from "@/public/actions/inquiry";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import { CustomerTypeToggle } from "@/public/components/ui/customer-type-toggle";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";

export type PublicInquiryFormMode = "live" | "preview" | "disabled";

export interface RequiredInquiryTerm {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

type PublicInquiryFormCardProps = {
  readonly mode?: PublicInquiryFormMode;
  readonly turnstileSiteKey?: string | null;
  readonly defaultSubject?: string;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly className?: string;
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

export function PublicInquiryFormCard({
  mode = "live",
  turnstileSiteKey = null,
  defaultSubject,
  title,
  description,
  className,
  submitLabel = "送信する",
  requiredTerms = [],
}: PublicInquiryFormCardProps): ReactElement {
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const isInteractive = mode === "live";

  const { form, isPending, onSubmit } = usePublicForm(
    publicInquirySchema,
    async (data) => {
      if (!isInteractive) {
        return createMutationError(
          "この画面からはお問い合わせを送信できません",
        );
      }

      setErrorMessage(null);
      const result = await submitInquiry(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
        turnstileRef.current?.reset();
      } else {
        setSubmitted(true);
      }
      return result;
    },
    defaultSubject ? { defaultValues: { subject: defaultSubject } } : undefined,
  );

  const customerType = useWatch({
    control: form.control,
    name: "customerType",
  });

  const agreedTermsIds = useWatch({
    control: form.control,
    name: "agreedTermsIds",
  });

  const allTermsAgreed =
    requiredTerms.length === 0 ||
    requiredTerms.every((term) => agreedTermsIds?.includes(term.id));
  const isSubmitDisabled = !isInteractive || isPending || !allTermsAgreed;

  function handleCustomerTypeChange(type: CustomerType) {
    if (!isInteractive) {
      return;
    }

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

  if (submitted) {
    return (
      <div
        className={cn("border border-border px-8 py-16 text-center", className)}
        role="status"
        aria-live="polite"
      >
        <IconCircleCheck
          className="mx-auto h-10 w-10 text-accent"
          aria-hidden="true"
        />
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-accent">
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
          value={customerType ?? CustomerType.PERSONAL}
          onChange={handleCustomerTypeChange}
          disabled={!isInteractive}
        />

        <form onSubmit={onSubmit} className="mt-8">
          <div className="border border-border p-6 sm:p-8">
            <p className="mb-8 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {customerType === CustomerType.CORPORATE
                ? "ご担当者情報"
                : "お客様情報"}
            </p>

            <div className="space-y-6">
              {customerType === CustomerType.CORPORATE ? (
                <Input
                  id="contact-company"
                  label="会社名・団体名"
                  type="text"
                  required
                  disabled={!isInteractive || isPending}
                  placeholder="株式会社〇〇"
                  autoComplete="organization"
                  {...(form.formState.errors.companyName?.message !==
                    undefined && {
                    error: form.formState.errors.companyName.message,
                  })}
                  {...form.register("companyName")}
                />
              ) : null}

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Input
                  id="contact-lastname"
                  label={
                    customerType === CustomerType.CORPORATE ? "担当者 姓" : "姓"
                  }
                  type="text"
                  required
                  disabled={!isInteractive || isPending}
                  placeholder="山田"
                  autoComplete="family-name"
                  {...(form.formState.errors.lastName?.message !==
                    undefined && {
                    error: form.formState.errors.lastName.message,
                  })}
                  {...form.register("lastName")}
                />
                <Input
                  id="contact-firstname"
                  label={
                    customerType === CustomerType.CORPORATE ? "担当者 名" : "名"
                  }
                  type="text"
                  required
                  disabled={!isInteractive || isPending}
                  placeholder="太郎"
                  autoComplete="given-name"
                  {...(form.formState.errors.firstName?.message !==
                    undefined && {
                    error: form.formState.errors.firstName.message,
                  })}
                  {...form.register("firstName")}
                />
              </div>

              <Input
                id="contact-email"
                label="メールアドレス"
                type="email"
                required
                disabled={!isInteractive || isPending}
                placeholder="mail@example.com"
                autoComplete="email"
                leadingIcon="IconMail"
                {...(form.formState.errors.email?.message !== undefined && {
                  error: form.formState.errors.email.message,
                })}
                {...form.register("email")}
              />

              <Input
                id="contact-subject"
                label="件名"
                type="text"
                required
                disabled={!isInteractive || isPending}
                placeholder="お問い合わせの件名"
                {...(form.formState.errors.subject?.message !== undefined && {
                  error: form.formState.errors.subject.message,
                })}
                {...form.register("subject")}
              />

              <Textarea
                id="contact-message"
                label="お問い合わせ内容"
                rows={8}
                required
                disabled={!isInteractive || isPending}
                placeholder="お問い合わせ内容をご記入ください"
                {...(form.formState.errors.message?.message !== undefined && {
                  error: form.formState.errors.message.message,
                })}
                {...form.register("message")}
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
              <div className="mt-8 space-y-3 border-t border-border pt-6">
                {requiredTerms.map((term) => {
                  const isChecked = agreedTermsIds?.includes(term.id) ?? false;
                  return (
                    <label key={term.id} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 border-border accent-accent"
                        disabled={!isInteractive || isPending}
                        checked={isChecked}
                        onChange={() => {
                          if (!isInteractive) return;
                          const current =
                            form.getValues("agreedTermsIds") ?? [];
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
                          className="text-accent underline transition-colors hover:text-foreground"
                        >
                          {term.title}
                        </a>
                        に同意します
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>

          {errorMessage !== null ? (
            <div
              className="mt-6 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
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
