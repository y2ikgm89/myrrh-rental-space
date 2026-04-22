"use client";

import { useRef, useState, type ReactElement } from "react";
import { useWatch } from "react-hook-form";
import { IconCircleCheck } from "@tabler/icons-react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { submitInquiry } from "@/public/actions/inquiry";
import { isMutationError } from "@/shared/lib/mutation-result";
import { CustomerTypeToggle } from "@/public/components/ui/customer-type-toggle";

interface ContactFormProps {
  readonly turnstileSiteKey: string | null;
  readonly defaultSubject: string | undefined;
}

export function ContactForm({
  turnstileSiteKey,
  defaultSubject,
}: ContactFormProps): ReactElement {
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const { form, isPending, onSubmit } = usePublicForm(
    publicInquirySchema,
    async (data) => {
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

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="border border-border px-8 py-16 text-center">
          <IconCircleCheck className="mx-auto h-10 w-10 text-accent" />
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
        </div>
      </ScrollReveal>
    );
  }

  return (
    <ScrollReveal>
      <div>
        {/* Customer type — outside frame */}
        <div>
          <CustomerTypeToggle
            id="contact-type"
            value={customerType ?? CustomerType.PERSONAL}
            onChange={handleCustomerTypeChange}
          />
        </div>

        {/* Form fields — editorial frame */}
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
                placeholder="mail@example.com"
                autoComplete="email"
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
                placeholder="お問い合わせ内容をご記入ください"
                {...(form.formState.errors.message?.message !== undefined && {
                  error: form.formState.errors.message.message,
                })}
                {...form.register("message")}
              />

              <TurnstileWidget
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                action={TURNSTILE_ACTIONS.inquiry}
                onVerify={handleTurnstileVerify}
                onExpire={handleTurnstileExpire}
              />
            </div>
          </div>

          {/* Error — outside frame */}
          {errorMessage !== null && (
            <div
              className="mt-6 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {/* Submit — outside frame */}
          <div className="mt-10 flex items-center gap-6">
            <Button type="submit" disabled={isPending}>
              {isPending ? "送信中..." : "送信する"}
            </Button>
            <p className="text-xs text-muted-foreground">
              通常1営業日以内にご返信いたします
            </p>
          </div>
        </form>
      </div>
    </ScrollReveal>
  );
}
