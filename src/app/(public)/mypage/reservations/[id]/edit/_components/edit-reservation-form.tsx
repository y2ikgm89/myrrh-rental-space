"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Select } from "@/public/components/design-system/select";
import { updateReservationAction } from "../../../../_shared/actions/reservation";

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
  readonly spaces: readonly SpaceOption[];
  readonly initialValues: InitialValues;
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
// Form state
// ---------------------------------------------------------------------------

type FormState = { success: true } | { error: string } | null;

async function formAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return updateReservationAction(formData);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditReservationForm({
  reservationId,
  spaces,
  initialValues,
}: EditReservationFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState(formAction, null);

  useEffect(() => {
    if (state != null && "success" in state && state.success) {
      router.push(`/mypage/reservations/${reservationId}`);
    }
  }, [state, router, reservationId]);

  const spaceOptions = spaces.map((s) => ({
    value: s.id,
    label: `${s.name}（定員${String(s.capacity)}名・¥${s.hourlyPrice.toLocaleString()}/h）`,
  }));

  const error = state != null && "error" in state ? state.error : null;

  return (
    <form action={dispatch} className="space-y-6">
      <input type="hidden" name="reservationId" value={reservationId} />
      <input type="hidden" name="numberOfGuests" value="1" />

      {error != null && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <Select
        label="スペース"
        name="spaceId"
        options={spaceOptions}
        defaultValue={initialValues.spaceId}
        required
      />

      <Input
        label="利用日"
        name="date"
        type="date"
        defaultValue={initialValues.date}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="開始時間"
          name="startTime"
          options={TIME_OPTIONS}
          defaultValue={initialValues.startTime}
          required
        />

        <Select
          label="終了時間"
          name="endTime"
          options={TIME_OPTIONS}
          defaultValue={initialValues.endTime}
          required
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
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
