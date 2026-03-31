"use client";

import { useRef, useState, type ReactElement } from "react";
import { useWatch } from "react-hook-form";
import { IconCircleCheck } from "@tabler/icons-react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { usePublicForm } from "@/public/hooks/use-public-form";
import {
  publicInquirySchema,
  type CustomerType,
} from "@/shared/lib/validations/inquiry";
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
        // トークンは1回限り — エラー時もリセットして再取得
        // reset() → onVerify コールバックで新トークンが自動セットされる
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

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="rounded-lg border border-accent/20 bg-surface px-8 py-12 text-center">
          <IconCircleCheck className="mx-auto h-10 w-10 text-accent" />
          <Heading level={2} className="mt-4">
            お問い合わせを受け付けました
          </Heading>
          <p className="mt-3 text-muted-foreground">
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
        <Heading level={2}>フォームからお問い合わせ</Heading>
        <p className="mt-2 text-muted-foreground">
          ご質問・ご相談がございましたら、下記フォームよりお気軽にお問い合わせください。
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <CustomerTypeToggle
            id="contact-type"
            value={customerType ?? "personal"}
            onChange={handleCustomerTypeChange}
          />

          {customerType === "corporate" ? (
            <Input
              id="contact-company"
              label="会社名・団体名"
              type="text"
              required
              placeholder="株式会社〇〇"
              autoComplete="organization"
              {...(form.formState.errors.companyName?.message !== undefined && {
                error: form.formState.errors.companyName.message,
              })}
              {...form.register("companyName")}
            />
          ) : null}

          <div className="grid gap-6 sm:grid-cols-2">
            <Input
              id="contact-lastname"
              label={customerType === "corporate" ? "担当者 姓" : "姓"}
              type="text"
              required
              placeholder="山田"
              autoComplete="family-name"
              {...(form.formState.errors.lastName?.message !== undefined && {
                error: form.formState.errors.lastName.message,
              })}
              {...form.register("lastName")}
            />
            <Input
              id="contact-firstname"
              label={customerType === "corporate" ? "担当者 名" : "名"}
              type="text"
              required
              placeholder="太郎"
              autoComplete="given-name"
              {...(form.formState.errors.firstName?.message !== undefined && {
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
            onVerify={handleTurnstileVerify}
            onExpire={handleTurnstileExpire}
          />

          {errorMessage !== null && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex items-center gap-6 pt-2">
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
