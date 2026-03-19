"use client";

import type { ReactElement } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Input, Select } from "@/public/components/design-system";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";

type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string | null;
};

/** Generate time options from 9:00 to 22:00 in 30-min increments */
function generateTimeOptions() {
  const options: { value: string; label: string }[] = [];
  for (let h = 9; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      options.push({ value, label: value });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

export function DateTimeStep({
  form,
  spaces,
  onNext,
}: {
  readonly form: UseFormReturn<PublicReservationInput>;
  readonly spaces: readonly SpaceOption[];
  readonly onNext: () => void;
}): ReactElement {
  const spaceId = useWatch({ control: form.control, name: "spaceId" });
  const selectedSpace = spaces.find((s) => s.id === spaceId);

  const spaceOptions = spaces.map((s) => ({
    value: s.id,
    label: `${s.name}（定員${s.capacity}名・¥${s.hourlyPrice.toLocaleString()}/時間）`,
  }));

  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      <h2 className="mb-6 font-heading text-xl tracking-tight md:text-2xl">
        スペース・日時を選択
      </h2>

      <Select
        id="reservation-space"
        label="スペース"
        options={[{ value: "", label: "選択してください" }, ...spaceOptions]}
        {...(form.formState.errors.spaceId?.message && {
          error: form.formState.errors.spaceId.message,
        })}
        {...form.register("spaceId")}
      />

      {selectedSpace && (
        <p className="mt-2 text-sm text-muted-foreground">
          定員 {selectedSpace.capacity}名 / &yen;
          {selectedSpace.hourlyPrice.toLocaleString()}/時間
        </p>
      )}

      <div className="mt-5">
        <Input
          id="reservation-date"
          label="ご利用日"
          type="date"
          min={today}
          {...(form.formState.errors.date?.message && {
            error: form.formState.errors.date.message,
          })}
          {...form.register("date")}
        />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Select
          id="reservation-start-time"
          label="開始時間"
          options={[{ value: "", label: "選択" }, ...TIME_OPTIONS]}
          {...(form.formState.errors.startTime?.message && {
            error: form.formState.errors.startTime.message,
          })}
          {...form.register("startTime")}
        />
        <Select
          id="reservation-end-time"
          label="終了時間"
          options={[{ value: "", label: "選択" }, ...TIME_OPTIONS]}
          {...(form.formState.errors.endTime?.message && {
            error: form.formState.errors.endTime.message,
          })}
          {...form.register("endTime")}
        />
      </div>

      <div className="mt-5">
        <Input
          id="reservation-guests"
          label="利用人数"
          type="number"
          min={1}
          max={selectedSpace?.capacity ?? 500}
          {...(form.formState.errors.numberOfGuests?.message && {
            error: form.formState.errors.numberOfGuests.message,
          })}
          {...form.register("numberOfGuests", { valueAsNumber: true })}
        />
      </div>

      <div className="mt-8">
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          次のステップへ
        </button>
      </div>
    </div>
  );
}
