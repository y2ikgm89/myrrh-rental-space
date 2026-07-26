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
import { Select } from "@/public/components/design-system/select";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { formatJstDateString } from "@/shared/lib/date-format";
import type { z } from "zod";
import { customerReservationEditSchema } from "@/shared/lib/validations/customer-reservation";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import type { TurnstileAction } from "@/shared/lib/turnstile-actions";
import { toAppRoute } from "@/shared/lib/typed-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpaceOption {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly hourlyPrice: number;
}

interface InitialValues {
  readonly spaceId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}

interface EditReservationFormProps {
  readonly reservationId: string;
  readonly numberOfGuests: number;
  readonly spaces: readonly SpaceOption[];
  readonly initialValues: InitialValues;
  readonly turnstileSiteKey: string | null;
  readonly version: number;
  readonly action: (
    prev: SubmissionResult | undefined,
    formData: FormData,
  ) => Promise<SubmissionResult>;
  readonly cancelHref: string;
  readonly successHref: string;
  readonly turnstileAction: TurnstileAction;
}

// ---------------------------------------------------------------------------
// Time options (09:00 - 22:00, 30 min intervals)
// ---------------------------------------------------------------------------

function generateTimeOptions(): readonly { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let hour = 9; hour <= 22; hour++) {
    for (const min of [0, 30]) {
      if (hour === 22 && min === 30) continue;
      const value = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      options.push({ value, label: value });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditReservationForm({
  reservationId,
  numberOfGuests,
  spaces,
  initialValues,
  turnstileSiteKey,
  version,
  action,
  cancelHref,
  successHref,
  turnstileAction,
}: EditReservationFormProps): ReactElement {
  const router = useRouter();
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [minDate] = useState(() => formatJstDateString(new Date()));

  const spaceOptions = spaces.map((s) => ({
    value: s.id,
    label: `${s.name}（定員${String(s.capacity)}名・${formatCurrency(s.hourlyPrice)}/h）`,
  }));

  const [lastResult, formAction, isPending] = useActionState(action, undefined);

  const [form, fields] = useForm<z.input<typeof customerReservationEditSchema>>(
    {
      id: "edit-reservation-form",
      lastResult,
      constraint: getZodConstraint(customerReservationEditSchema),
      defaultValue: {
        reservationId,
        spaceId: initialValues.spaceId,
        date: initialValues.date,
        startTime: initialValues.startTime,
        endTime: initialValues.endTime,
        numberOfGuests,
        version,
      },
      onValidate({ formData }) {
        return parseWithZod(formData, {
          schema: customerReservationEditSchema,
        });
      },
      shouldValidate: "onBlur",
      shouldRevalidate: "onInput",
    },
  );

  const turnstileTokenControl = useInputControl(fields.turnstileToken);

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

  function handleTurnstileVerify(token: string) {
    turnstileTokenControl.change(token);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
  }

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
        name={fields.reservationId.name}
        value={reservationId}
      />
      <input
        type="hidden"
        name={fields.numberOfGuests.name}
        value={String(numberOfGuests)}
      />
      <input
        type="hidden"
        name={fields.turnstileToken.name}
        value={turnstileTokenControl.value ?? ""}
      />
      <input type="hidden" name={fields.version.name} value={String(version)} />

      {formErrorMessage !== null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {formErrorMessage}
        </div>
      )}

      <Select
        label="スペース"
        options={spaceOptions}
        required
        {...(fields.spaceId.errors?.[0] !== undefined && {
          error: fields.spaceId.errors[0],
        })}
        {...getInputProps(fields.spaceId, { type: "text" })}
      />

      <Input
        label="利用日"
        required
        {...(fields.date.errors?.[0] !== undefined && {
          error: fields.date.errors[0],
        })}
        {...getInputProps(fields.date, { type: "date" })}
        min={minDate}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="開始時間"
          options={TIME_OPTIONS}
          required
          {...(fields.startTime.errors?.[0] !== undefined && {
            error: fields.startTime.errors[0],
          })}
          {...getInputProps(fields.startTime, { type: "text" })}
        />

        <Select
          label="終了時間"
          options={TIME_OPTIONS}
          required
          {...(fields.endTime.errors?.[0] !== undefined && {
            error: fields.endTime.errors[0],
          })}
          {...getInputProps(fields.endTime, { type: "text" })}
        />
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={turnstileAction}
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button
          variant="secondary"
          href={toAppRoute(cancelHref)}
          className="w-full sm:w-auto"
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "変更中..." : "予約を変更する"}
        </Button>
      </div>
    </form>
  );
}
