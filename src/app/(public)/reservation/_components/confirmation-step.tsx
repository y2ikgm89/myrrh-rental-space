"use client";

import type { ReactElement } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/public/components/design-system";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";

type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string | null;
};

function calculatePrice(
  spaces: readonly SpaceOption[],
  spaceId: string | undefined,
  startTime: string | undefined,
  endTime: string | undefined,
): number | null {
  if (!spaceId || !startTime || !endTime) return null;
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return null;
  const start = Number(startTime.replace(":", ""));
  const end = Number(endTime.replace(":", ""));
  if (end <= start) return null;
  const startHours = Math.floor(start / 100) + (start % 100) / 60;
  const endHours = Math.floor(end / 100) + (end % 100) / 60;
  const hours = endHours - startHours;
  return Math.floor(space.hourlyPrice * hours);
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "未選択";
  try {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  } catch {
    return dateStr;
  }
}

export function ConfirmationStep({
  form,
  spaces,
  isPending,
  errorMessage,
  onBack,
}: {
  readonly form: UseFormReturn<PublicReservationInput>;
  readonly spaces: readonly SpaceOption[];
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly onBack: () => void;
}): ReactElement {
  const [
    spaceId,
    date,
    startTime,
    endTime,
    lastName,
    firstName,
    numberOfGuests,
  ] = useWatch({
    control: form.control,
    name: [
      "spaceId",
      "date",
      "startTime",
      "endTime",
      "lastName",
      "firstName",
      "numberOfGuests",
    ],
  });

  const selectedSpace = spaces.find((s) => s.id === spaceId);
  const price = calculatePrice(spaces, spaceId, startTime, endTime);

  return (
    <div>
      <div className="rounded-lg border border-accent/20 bg-card p-5 md:p-8">
        <h3 className="font-heading text-xl tracking-tight">予約内容の確認</h3>

        <div className="mt-6 space-y-4">
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">スペース</span>
            <span className="text-sm font-medium">
              {selectedSpace?.name ?? "未選択"}
            </span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">ご利用日</span>
            <span className="text-sm font-medium">{formatDate(date)}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">時間帯</span>
            <span className="text-sm font-medium">
              {startTime ?? "?"} - {endTime ?? "?"}
            </span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">利用人数</span>
            <span className="text-sm font-medium">{numberOfGuests ?? 0}名</span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">お名前</span>
            <span className="text-sm font-medium">
              {lastName ?? ""} {firstName ?? ""}
            </span>
          </div>
          {price !== null && (
            <div className="flex justify-between pt-2">
              <span className="font-heading text-base">概算金額</span>
              <span className="font-heading text-xl text-accent">
                &yen;{price.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
            {...form.register("agreeToTerms")}
          />
          <span className="text-sm text-muted-foreground">
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              利用規約
            </a>
            に同意します
          </span>
        </label>
        {form.formState.errors.agreeToTerms?.message && (
          <p className="mt-1 text-sm text-destructive">
            {form.formState.errors.agreeToTerms.message}
          </p>
        )}
      </div>

      {errorMessage && (
        <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isPending}
        >
          戻る
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "送信中..." : "予約を確定する"}
        </Button>
      </div>
    </div>
  );
}
