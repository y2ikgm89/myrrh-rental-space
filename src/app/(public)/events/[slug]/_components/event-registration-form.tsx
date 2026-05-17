"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
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
import { publicEventRegistrationSchema } from "@/shared/lib/validations/event-registration";
import { registerForEvent } from "@/public/actions/event-registration";

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
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [lastResult, formAction, isPending] = useActionState(
    registerForEvent,
    undefined,
  );

  const [form, fields] = useForm({
    id: "event-registration-form",
    constraint: getZodConstraint(publicEventRegistrationSchema),
    lastResult,
    defaultValue: {
      eventId,
      numberOfPeople: 1,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: publicEventRegistrationSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const turnstileTokenControl = useInputControl(fields.turnstileToken);

  // Render 中 state sync: 成功検出 (default `resetForm: true` → initialValue === null)
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setSubmitted(true);
    }
  }

  // Turnstile DOM reset は副作用のため effect に残置
  useEffect(() => {
    if (lastResult?.status === "error") {
      turnstileRef.current?.reset();
      turnstileTokenControl.change("");
    }
  }, [lastResult, turnstileTokenControl]);

  function handleTurnstileVerify(token: string) {
    turnstileTokenControl.change(token);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
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

  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;

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
        {...getFormProps(form)}
        action={formAction}
        className="space-y-6 border border-border p-6 sm:p-8"
      >
        <input type="hidden" name={fields.eventId.name} value={eventId} />
        <input
          type="hidden"
          name={fields.turnstileToken.name}
          value={turnstileTokenControl.value ?? ""}
        />

        <Input
          label="お名前"
          required
          placeholder="山田 太郎"
          autoComplete="name"
          {...(fields.name.errors?.[0] !== undefined && {
            error: fields.name.errors[0],
          })}
          {...getInputProps(fields.name, { type: "text" })}
        />

        <Input
          label="メールアドレス"
          required
          placeholder="mail@example.com"
          autoComplete="email"
          leadingIcon="IconMail"
          {...(fields.email.errors?.[0] !== undefined && {
            error: fields.email.errors[0],
          })}
          {...getInputProps(fields.email, { type: "email" })}
        />

        <Input
          label="電話番号（任意）"
          placeholder="090-1234-5678"
          autoComplete="tel"
          leadingIcon="IconPhone"
          {...(fields.phone.errors?.[0] !== undefined && {
            error: fields.phone.errors[0],
          })}
          {...getInputProps(fields.phone, { type: "tel" })}
        />

        <Input
          label="参加人数"
          required
          min={1}
          max={remainingCapacity ?? 10}
          {...(fields.numberOfPeople.errors?.[0] !== undefined && {
            error: fields.numberOfPeople.errors[0],
          })}
          {...getInputProps(fields.numberOfPeople, { type: "number" })}
        />

        <Textarea
          label="備考（任意）"
          rows={3}
          placeholder="ご質問等あればご記入ください"
          {...(fields.note.errors?.[0] !== undefined && {
            error: fields.note.errors[0],
          })}
          {...getInputProps(fields.note, { type: "text" })}
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.event_registration}
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
        />

        {formErrorMessage !== null && (
          <div
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {formErrorMessage}
          </div>
        )}

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "送信中..." : "申し込む"}
        </Button>
      </form>
    </section>
  );
}
