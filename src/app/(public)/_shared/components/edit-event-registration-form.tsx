"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { SubmissionResult } from "@conform-to/react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import { DetailRow } from "@/public/components/detail-row";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import type { TurnstileAction } from "@/shared/lib/turnstile-actions";
import { formatEventDateTimeRange } from "@/public/lib/format-event-date";
import { formatPrice } from "@/shared/lib/pricing/format";
import { eventRegistrationEditSchema } from "@/shared/lib/validations/event-registration";
import { toAppRoute } from "@/shared/lib/typed-routes";
import type { z } from "zod";

interface EditEventRegistrationFormProps {
  readonly registrationId: string;
  readonly eventTitle: string;
  readonly ticketName: string;
  readonly ticketUnitPrice: number;
  readonly slotStartAt: string;
  readonly slotEndAt: string;
  readonly quantityEditable: boolean;
  readonly initialValues: {
    readonly name: string;
    readonly email: string;
    readonly phone: string;
    readonly note: string;
    readonly quantity: number;
  };
  readonly turnstileSiteKey: string | null;
  readonly action: (
    prev: SubmissionResult | undefined,
    formData: FormData,
  ) => Promise<SubmissionResult>;
  readonly cancelHref: string;
  readonly successHref: string;
  readonly turnstileAction: TurnstileAction;
}

export function EditEventRegistrationForm({
  registrationId,
  eventTitle,
  ticketName,
  ticketUnitPrice,
  slotStartAt,
  slotEndAt,
  quantityEditable,
  initialValues,
  turnstileSiteKey,
  action,
  cancelHref,
  successHref,
  turnstileAction,
}: EditEventRegistrationFormProps): ReactElement {
  const router = useRouter();
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [lastResult, formAction, isPending] = useActionState(action, undefined);

  const [form, fields] = useForm<z.input<typeof eventRegistrationEditSchema>>({
    id: "edit-event-registration-form",
    lastResult,
    constraint: getZodConstraint(eventRegistrationEditSchema),
    defaultValue: {
      registrationId,
      name: initialValues.name,
      email: initialValues.email,
      phone: initialValues.phone || undefined,
      note: initialValues.note || undefined,
      quantity: initialValues.quantity,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: eventRegistrationEditSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const turnstileTokenControl = useInputControl(fields.turnstileToken);
  const quantityControl = useInputControl(fields.quantity);
  const quantity = Number(quantityControl.value ?? initialValues.quantity);

  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      router.push(toAppRoute(successHref));
    }
  }

  useEffect(() => {
    if (lastResult?.status === "error") {
      turnstileRef.current?.reset();
      turnstileTokenControl.change("");
    }
  }, [lastResult, turnstileTokenControl]);

  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;

  return (
    <form
      {...getFormProps(form)}
      action={formAction}
      aria-busy={isPending}
      className="space-y-6"
    >
      <input
        type="hidden"
        name={fields.registrationId.name}
        value={registrationId}
      />
      <input
        type="hidden"
        name={fields.turnstileToken.name}
        value={turnstileTokenControl.value ?? ""}
      />
      {!quantityEditable && (
        <input
          type="hidden"
          name={fields.quantity.name}
          value={String(initialValues.quantity)}
        />
      )}

      {formErrorMessage !== null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {formErrorMessage}
        </div>
      )}

      <div className="border border-border p-4 sm:p-6">
        <p className="text-sm font-medium text-foreground">{eventTitle}</p>
        <dl className="mt-4">
          <DetailRow label="日時">
            {formatEventDateTimeRange(slotStartAt, slotEndAt)}
          </DetailRow>
          <DetailRow label="チケット">{ticketName}</DetailRow>
          <DetailRow label="合計金額（参考）">
            {formatPrice(ticketUnitPrice * quantity)}
          </DetailRow>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          日時・チケット種別の変更は、一度キャンセルしてから再度お申込みください。
        </p>
      </div>

      <Input
        label="お名前"
        required
        autoComplete="name"
        {...(fields.name.errors?.[0] !== undefined && {
          error: fields.name.errors[0],
        })}
        {...getInputProps(fields.name, { type: "text" })}
      />

      <Input
        label="メールアドレス"
        required
        autoComplete="email"
        {...(fields.email.errors?.[0] !== undefined && {
          error: fields.email.errors[0],
        })}
        {...getInputProps(fields.email, { type: "email" })}
      />

      <Input
        label="電話番号"
        autoComplete="tel"
        {...(fields.phone.errors?.[0] !== undefined && {
          error: fields.phone.errors[0],
        })}
        {...getInputProps(fields.phone, { type: "tel" })}
      />

      {quantityEditable ? (
        <Input
          label="参加人数"
          required
          min={1}
          max={10}
          {...(fields.quantity.errors?.[0] !== undefined && {
            error: fields.quantity.errors[0],
          })}
          {...getInputProps(fields.quantity, { type: "number" })}
        />
      ) : (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">参加人数</p>
          <p className="text-sm text-muted-foreground">
            {initialValues.quantity}名（繰り上げ当選中は人数を変更できません）
          </p>
        </div>
      )}

      <Textarea
        label="備考"
        rows={3}
        {...(fields.note.errors?.[0] !== undefined && {
          error: fields.note.errors[0],
        })}
        {...getInputProps(fields.note, { type: "text" })}
      />

      {turnstileSiteKey && (
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={turnstileAction}
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : "変更を保存する"}
        </Button>
        <Button variant="secondary" href={toAppRoute(cancelHref)}>
          キャンセル
        </Button>
      </div>
    </form>
  );

  function handleTurnstileVerify(token: string) {
    turnstileTokenControl.change(token);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
  }
}
