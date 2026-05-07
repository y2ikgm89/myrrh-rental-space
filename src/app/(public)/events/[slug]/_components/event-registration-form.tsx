"use client";

import { useRef, useState, type ReactElement } from "react";
import { IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { publicEventRegistrationSchema } from "@/shared/lib/validations/event-registration";
import { registerForEvent } from "@/public/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";

interface EventRegistrationFormProps {
  readonly eventId: string;
  readonly turnstileSiteKey: string | null;
  readonly remainingCapacity: number | null;
}

export function EventRegistrationForm({
  eventId,
  turnstileSiteKey,
  remainingCapacity,
}: EventRegistrationFormProps): ReactElement {
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const { form, isPending, onSubmit } = usePublicForm(
    publicEventRegistrationSchema,
    async (data) => {
      setErrorMessage(null);
      const result = await registerForEvent(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
        turnstileRef.current?.reset();
      } else {
        setSubmitted(true);
      }
      return result;
    },
    {
      defaultValues: {
        eventId,
        numberOfPeople: 1,
      },
    },
  );

  function handleTurnstileVerify(token: string) {
    form.setValue("turnstileToken", token);
  }

  function handleTurnstileExpire() {
    form.setValue("turnstileToken", "");
  }

  if (submitted) {
    return (
      <div className="border border-accent/30 bg-surface px-8 py-12 text-center">
        <IconCircleCheck
          className="mx-auto h-10 w-10 text-accent"
          aria-hidden
        />
        <Heading level={3} className="mt-4">
          お申し込みを受け付けました
        </Heading>
        <p className="mt-3 text-muted-foreground">
          確認メールをお送りしましたのでご確認ください。
        </p>
      </div>
    );
  }

  return (
    <section aria-label="参加申込" className="space-y-4">
      <div className="space-y-1">
        <Heading level={2}>参加申込</Heading>
        {remainingCapacity !== null ? (
          <p className="text-sm text-muted-foreground">
            現在の残り枠:{" "}
            <span className="font-medium text-foreground">
              {String(remainingCapacity)} 名
            </span>
          </p>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-6 border border-border p-6 sm:p-8"
      >
        <input type="hidden" {...form.register("eventId")} />

        <Input
          id="reg-name"
          label="お名前"
          type="text"
          required
          placeholder="山田 太郎"
          autoComplete="name"
          {...(form.formState.errors.name?.message !== undefined && {
            error: form.formState.errors.name.message,
          })}
          {...form.register("name")}
        />

        <Input
          id="reg-email"
          label="メールアドレス"
          type="email"
          required
          placeholder="mail@example.com"
          autoComplete="email"
          leadingIcon="IconMail"
          {...(form.formState.errors.email?.message !== undefined && {
            error: form.formState.errors.email.message,
          })}
          {...form.register("email")}
        />

        <Input
          id="reg-phone"
          label="電話番号（任意）"
          type="tel"
          placeholder="090-1234-5678"
          autoComplete="tel"
          leadingIcon="IconPhone"
          {...(form.formState.errors.phone?.message !== undefined && {
            error: form.formState.errors.phone.message,
          })}
          {...form.register("phone")}
        />

        <Input
          id="reg-number"
          label="参加人数"
          type="number"
          required
          min={1}
          max={remainingCapacity ?? 10}
          {...(form.formState.errors.numberOfPeople?.message !== undefined && {
            error: form.formState.errors.numberOfPeople.message,
          })}
          {...form.register("numberOfPeople", { valueAsNumber: true })}
        />

        <Textarea
          id="reg-note"
          label="備考（任意）"
          rows={3}
          placeholder="ご質問等あればご記入ください"
          {...(form.formState.errors.note?.message !== undefined && {
            error: form.formState.errors.note.message,
          })}
          {...form.register("note")}
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.event_registration}
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
        />

        {errorMessage !== null && (
          <div
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "送信中..." : "申し込む"}
        </Button>
      </form>
    </section>
  );
}
