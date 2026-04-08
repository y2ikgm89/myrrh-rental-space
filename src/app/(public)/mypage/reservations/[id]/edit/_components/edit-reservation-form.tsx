"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Select } from "@/public/components/design-system/select";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  customerReservationEditSchema,
  type CustomerReservationEditInput,
} from "@/shared/lib/validations/customer-reservation";
import { updateReservationAction } from "../../../../_shared/actions/reservation";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";

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
}: EditReservationFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const spaceOptions = spaces.map((s) => ({
    value: s.id,
    label: `${s.name}（定員${String(s.capacity)}名・${formatCurrency(s.hourlyPrice)}/h）`,
  }));

  const { form, isPending, onSubmit } =
    usePublicForm<CustomerReservationEditInput>(
      customerReservationEditSchema,
      async (data) => {
        setErrorMessage(null);
        const result = await updateReservationAction(data);
        if (isMutationError(result)) {
          setErrorMessage(result.error);
          turnstileRef.current?.reset();
        } else {
          router.push(`/mypage/reservations/${reservationId}`);
        }
        return result;
      },
      {
        defaultValues: {
          reservationId,
          spaceId: initialValues.spaceId,
          date: initialValues.date,
          startTime: initialValues.startTime,
          endTime: initialValues.endTime,
          numberOfGuests,
        },
      },
    );

  function handleTurnstileVerify(token: string) {
    form.setValue("turnstileToken", token);
  }
  function handleTurnstileExpire() {
    form.setValue("turnstileToken", "");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {errorMessage != null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <Select
        label="スペース"
        options={spaceOptions}
        required
        {...form.register("spaceId")}
        {...(form.formState.errors.spaceId?.message && {
          error: form.formState.errors.spaceId.message,
        })}
      />

      <Input
        label="利用日"
        type="date"
        required
        {...form.register("date")}
        {...(form.formState.errors.date?.message && {
          error: form.formState.errors.date.message,
        })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="開始時間"
          options={TIME_OPTIONS}
          required
          {...form.register("startTime")}
          {...(form.formState.errors.startTime?.message && {
            error: form.formState.errors.startTime.message,
          })}
        />

        <Select
          label="終了時間"
          options={TIME_OPTIONS}
          required
          {...form.register("endTime")}
          {...(form.formState.errors.endTime?.message && {
            error: form.formState.errors.endTime.message,
          })}
        />
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "変更中..." : "予約を変更する"}
        </Button>

        <Button
          variant="secondary"
          href={`/mypage/reservations/${reservationId}`}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
