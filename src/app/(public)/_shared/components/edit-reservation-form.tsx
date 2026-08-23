"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { SubmissionResult } from "@conform-to/react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Select } from "@/public/components/design-system/select";
import { formatCurrency } from "@/shared/lib/pricing/format";
import {
  HiddenControlInput,
  useFieldControl,
} from "@/shared/lib/conform/control";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import { formatJstDateString } from "@/shared/lib/date-format";
import type { z } from "zod";
import { customerReservationEditSchema } from "@/shared/lib/validations/customer-reservation";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import type { TurnstileAction } from "@/shared/lib/turnstile-actions";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { GuestStepper } from "@/app/(public)/reservation/_components/guest-stepper";

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
        numberOfGuests: String(numberOfGuests),
        version,
      },
      onValidate({ formData }) {
        return parseWithZod(formData, {
          schema: customerReservationEditSchema,
        });
      },
      // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
      // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
      onSubmit: dispatchWithoutFormReset(formAction),
      shouldValidate: "onBlur",
      shouldRevalidate: "onInput",
    },
  );

  const numberOfGuestsControl = useFieldControl(fields.numberOfGuests);

  const selectedSpaceId =
    fields.spaceId.value ?? initialValues.spaceId ?? spaces[0]?.id ?? "";
  const selectedSpace =
    spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0];
  const spaceCapacity = selectedSpace?.capacity ?? 1;
  const guestCount = Number(numberOfGuestsControl.value ?? numberOfGuests);

  // **定員超過を黙って切り詰めない。**
  //
  // ここには以前 `guestCount > spaceCapacity` なら `change(String(spaceCapacity))`
  // する effect があり、送信値も `Math.min(guestCount, spaceCapacity)` だった。
  // 利用人数が保存されていなかった頃は初期値が常に 1 だったので表面化しなかったが、
  // 実際の人数を読むようになると、20 名の予約で定員 1 名のスペースを選んだ瞬間に
  // **人数が 1 に書き換わって送信が通り、記録まで 1 名に化ける**。サーバーの定員
  // gate は「1 名なら定員 1 に収まる」と正しく判定してしまうので、client の
  // 切り詰めが gate を無効化していた。管理者が現スペースの定員を下げた後の
  // 時間だけの変更でも、同じ経路で記録が壊れる。
  //
  // 値はそのまま保持し、超過は下のメッセージと server の gate で止める。利用者が
  // 「人数を減らす」か「大きいスペースを選ぶ」かを明示的に決める。
  const exceedsCapacity = guestCount > spaceCapacity;

  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      router.push(toAppRoute(successHref));
    }
  }

  // Turnstile トークンは 1 回限り有効なので、送信結果を受けたら widget を張り直す。
  // **conform のフィールドには触れない** — トークン欄は widget が所有しており
  // (`TURNSTILE_TOKEN_FIELD_NAME` の hidden input)、ここで conform 経由の
  // change() を呼ぶと再バリデーションが走り、サーバーが返した form-level エラーを
  // client 検証結果で上書きして消してしまう（詳細は turnstile-widget.tsx）。
  //
  // 同じ lastResult に対して 1 回だけ実行する。conform の control hook を
  // 依存に持っていた頃の無限ループ (PR #1758) の再発防止も兼ねる。処理済みの
  // 結果は ref で覚える（state だと effect 内 setState になり
  // react-hooks/set-state-in-effect に触れる）。
  const turnstileResetForResultRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (lastResult?.status !== "error") return;
    if (turnstileResetForResultRef.current === lastResult) return;
    turnstileResetForResultRef.current = lastResult;
    turnstileRef.current?.reset();
  }, [lastResult]);

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
      <HiddenControlInput
        field={fields.numberOfGuests}
        control={numberOfGuestsControl}
      />
      <input type="hidden" name={fields.version.name} value={String(version)} />

      {formErrorMessage !== null && (
        <div
          id={form.errorId}
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

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          利用人数
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        </p>
        <GuestStepper
          value={guestCount}
          max={spaceCapacity}
          onChange={(count) => {
            numberOfGuestsControl.change(String(count));
          }}
        />
        {exceedsCapacity && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            利用人数がスペースの定員（{spaceCapacity}名）を超えています
          </p>
        )}
        {fields.numberOfGuests.errors?.[0] !== undefined && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {fields.numberOfGuests.errors[0]}
          </p>
        )}
      </div>

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
