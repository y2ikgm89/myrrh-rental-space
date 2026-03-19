"use client";

import { useState, type ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Button, Input, Textarea } from "@/public/components/design-system";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";
import { submitInquiry } from "@/public/actions/inquiry";
import { isMutationError } from "@/shared/lib/mutation-result";

export function ContactForm(): ReactElement {
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { form, isPending, onSubmit } = usePublicForm(
    publicInquirySchema,
    async (data) => {
      setErrorMessage(null);
      const result = await submitInquiry(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setSubmitted(true);
      }
      return result;
    },
  );

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="rounded-lg border border-accent/20 bg-surface p-8 text-center">
          <h2 className="font-heading text-xl tracking-tight">
            お問い合わせを受け付けました
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            確認メールをお送りしましたのでご確認ください。
            <br />
            担当者より改めてご連絡いたします。
          </p>
        </div>
      </ScrollReveal>
    );
  }

  return (
    <ScrollReveal>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            id="contact-name"
            label="お名前"
            type="text"
            placeholder="山田 太郎"
            {...(form.formState.errors.name?.message !== undefined && {
              error: form.formState.errors.name.message,
            })}
            {...form.register("name")}
          />
          <Input
            id="contact-email"
            label="メールアドレス"
            type="email"
            placeholder="mail@example.com"
            {...(form.formState.errors.email?.message !== undefined && {
              error: form.formState.errors.email.message,
            })}
            {...form.register("email")}
          />
        </div>

        <Input
          id="contact-subject"
          label="件名"
          type="text"
          placeholder="お問い合わせの件名"
          {...(form.formState.errors.subject?.message !== undefined && {
            error: form.formState.errors.subject.message,
          })}
          {...form.register("subject")}
        />

        <Textarea
          id="contact-message"
          label="お問い合わせ内容"
          rows={5}
          placeholder="お問い合わせ内容をご記入ください"
          {...(form.formState.errors.message?.message !== undefined && {
            error: form.formState.errors.message.message,
          })}
          {...form.register("message")}
        />

        {errorMessage !== null && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "送信中..." : "送信する"}
          </Button>
        </div>
      </form>
    </ScrollReveal>
  );
}
