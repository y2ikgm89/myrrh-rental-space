"use client";

/**
 * 予約設定セクション
 *
 * 予約時間単位、最小/最大予約時間、キャンセル/変更期限の設定
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import type { Serialized } from "@/shared/lib/serialize";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { updateReservationSettings } from "@/admin/actions/settings";
import { reservationSettingsSchema } from "@/admin/actions/settings/schemas/basic";
import type { SettingsData } from "@/shared/domain/settings/types";
import {
  isSettingsFormDisabled,
  type SettingsReadOnlyProps,
} from "../shared/settings-read-only";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import {
  HiddenControlInput,
  useFieldControl,
} from "@/shared/lib/conform/control";

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

interface ReservationSectionProps extends SettingsReadOnlyProps {
  settings: Serialized<SettingsData>;
}

const DEADLINE_OPTIONS = [
  { value: "1", label: "1時間前" },
  { value: "2", label: "2時間前" },
  { value: "3", label: "3時間前" },
  { value: "6", label: "6時間前" },
  { value: "12", label: "12時間前" },
  { value: "24", label: "24時間前" },
  { value: "48", label: "48時間前" },
  { value: "72", label: "72時間前" },
  { value: "168", label: "168時間前（1週間）" },
  { value: "336", label: "336時間前（2週間）" },
  { value: "720", label: "720時間前（30日）" },
] as const;

function buildDeadlineOptions(
  currentValue: string | undefined,
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [
    ...DEADLINE_OPTIONS,
  ];
  if (
    currentValue &&
    currentValue !== "" &&
    !options.some((opt) => opt.value === currentValue)
  ) {
    options.push({
      value: currentValue,
      label: `${currentValue}時間前（現在の設定）`,
    });
    options.sort((a, b) => Number(a.value) - Number(b.value));
  }
  return options;
}

export function ReservationSection({
  settings,
  readOnly = false,
}: ReservationSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateReservationSettings,
    undefined,
  );
  const isDisabled = isSettingsFormDisabled(isPending, readOnly);
  const [form, fields] = useForm({
    id: "reservation-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: reservationSettingsSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      defaultTimeSlot: String(settings.defaultTimeSlot),
      minReservationDuration: String(settings.minReservationDuration),
      maxReservationDuration: String(settings.maxReservationDuration),
      cancellationDeadlineHours: String(settings.cancellationDeadlineHours),
      modificationDeadlineHours: String(settings.modificationDeadlineHours),
      customerCanCancelSeriesInFull: settings.customerCanCancelSeriesInFull
        ? "on"
        : "",
      maxRecurrenceInstances: String(settings.maxRecurrenceInstances),
      expectedUpdatedAt: settings.reservationUpdatedAt,
    },
  });

  const cancellationDeadline = useFieldControl(
    fields.cancellationDeadlineHours,
  );
  const modificationDeadline = useFieldControl(
    fields.modificationDeadlineHours,
  );
  const customerCanCancelSeriesInFullControl = useFieldControl(
    fields.customerCanCancelSeriesInFull,
  );
  const customerCanCancelSeriesInFullOn =
    customerCanCancelSeriesInFullControl.value === "on";

  const cancellationDeadlineOptions = buildDeadlineOptions(
    cancellationDeadline.value,
  );
  const modificationDeadlineOptions = buildDeadlineOptions(
    modificationDeadline.value,
  );

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("予約設定を保存しました");
      router.refresh();
      return;
    }
    if (lastResult?.status === "error") {
      const formLevelErrors = lastResult.error?.[""];
      const conflictMessage = formLevelErrors?.find((message) =>
        message.includes(OPTIMISTIC_CONFLICT_HINT),
      );
      if (conflictMessage) {
        toast.error(conflictMessage);
        router.refresh();
      }
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>予約設定</CardTitle>
          <CardDescription>
            予約に関する基本設定を行います。規約の必須設定は利用規約管理で行えます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset
            disabled={readOnly}
            className="space-y-4 border-0 p-0 m-0 min-w-0"
          >
            <input
              {...getInputProps(fields.expectedUpdatedAt, { type: "hidden" })}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.defaultTimeSlot.id}
                >
                  予約時間単位（分）
                </label>
                <Input
                  {...getInputProps(fields.defaultTimeSlot, { type: "number" })}
                  min={15}
                  max={240}
                  step={15}
                  disabled={isDisabled}
                />
                <p className="text-xs text-muted-foreground">15〜240分</p>
                {fields.defaultTimeSlot.errors &&
                  fields.defaultTimeSlot.errors.length > 0 && (
                    <p
                      id={fields.defaultTimeSlot.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.defaultTimeSlot.errors.join(", ")}
                    </p>
                  )}
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.minReservationDuration.id}
                >
                  最小予約時間（分）
                </label>
                <Input
                  {...getInputProps(fields.minReservationDuration, {
                    type: "number",
                  })}
                  min={15}
                  max={480}
                  step={15}
                  disabled={isDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  予約可能な最短時間
                </p>
                {fields.minReservationDuration.errors &&
                  fields.minReservationDuration.errors.length > 0 && (
                    <p
                      id={fields.minReservationDuration.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.minReservationDuration.errors.join(", ")}
                    </p>
                  )}
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.maxReservationDuration.id}
                >
                  最大予約時間（分）
                </label>
                <Input
                  {...getInputProps(fields.maxReservationDuration, {
                    type: "number",
                  })}
                  min={60}
                  max={1440}
                  step={30}
                  disabled={isDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  予約可能な最長時間（最大24時間）
                </p>
                {fields.maxReservationDuration.errors &&
                  fields.maxReservationDuration.errors.length > 0 && (
                    <p
                      id={fields.maxReservationDuration.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.maxReservationDuration.errors.join(", ")}
                    </p>
                  )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.cancellationDeadlineHours.id}
                >
                  キャンセル期限（予約開始の何時間前まで）
                </label>
                <Select
                  value={cancellationDeadline.value ?? ""}
                  onValueChange={(v) => cancellationDeadline.change(v)}
                  disabled={isDisabled}
                >
                  <SelectTrigger
                    id={fields.cancellationDeadlineHours.id}
                    className="w-full"
                    onBlur={cancellationDeadline.blur}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cancellationDeadlineOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <HiddenControlInput
                  field={fields.cancellationDeadlineHours}
                  control={cancellationDeadline}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.modificationDeadlineHours.id}
                >
                  変更期限（予約開始の何時間前まで）
                </label>
                <Select
                  value={modificationDeadline.value ?? ""}
                  onValueChange={(v) => modificationDeadline.change(v)}
                  disabled={isDisabled}
                >
                  <SelectTrigger
                    id={fields.modificationDeadlineHours.id}
                    className="w-full"
                    onBlur={modificationDeadline.blur}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modificationDeadlineOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <HiddenControlInput
                  field={fields.modificationDeadlineHours}
                  control={modificationDeadline}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor={fields.maxRecurrenceInstances.id}
              >
                定期予約の最大件数
              </label>
              <Input
                {...getInputProps(fields.maxRecurrenceInstances, {
                  type: "number",
                })}
                min={1}
                max={104}
                step={1}
                disabled={isDisabled}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                1回の定期予約作成で展開できる件数の上限です。定期予約フォームの回数検証と
                series 展開キャップに使用されます（1〜104）
              </p>
              {fields.maxRecurrenceInstances.errors &&
                fields.maxRecurrenceInstances.errors.length > 0 && (
                  <p
                    id={fields.maxRecurrenceInstances.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.maxRecurrenceInstances.errors.join(", ")}
                  </p>
                )}
            </div>

            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <label
                  htmlFor={fields.customerCanCancelSeriesInFull.id}
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  顧客が定期予約全体をキャンセルできる
                </label>
                <p className="text-xs text-muted-foreground">
                  ON: 顧客はマイページから「定期予約すべてキャンセル」ボタンで
                  series 全体を まとめてキャンセルできます。OFF:
                  個別の予約は各自キャンセルできますが、series
                  全体のキャンセルは 管理者への問い合わせのみ受け付けます。
                </p>
                {fields.customerCanCancelSeriesInFull.errors && (
                  <p
                    id={fields.customerCanCancelSeriesInFull.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.customerCanCancelSeriesInFull.errors.join(", ")}
                  </p>
                )}
              </div>
              <Switch
                id={fields.customerCanCancelSeriesInFull.id}
                checked={customerCanCancelSeriesInFullOn}
                onCheckedChange={(checked) =>
                  customerCanCancelSeriesInFullControl.change(
                    checked ? "on" : "",
                  )
                }
                onBlur={customerCanCancelSeriesInFullControl.blur}
                disabled={isDisabled}
                aria-describedby={
                  fields.customerCanCancelSeriesInFull.errors
                    ? fields.customerCanCancelSeriesInFull.errorId
                    : undefined
                }
              />
              <HiddenControlInput
                field={fields.customerCanCancelSeriesInFull}
                control={customerCanCancelSeriesInFullControl}
              />
            </div>

            {formErrors && formErrors.length > 0 && (
              <div
                id={form.errorId}
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {formErrors.join(", ")}
              </div>
            )}

            {!readOnly ? (
              <div className="flex justify-end pt-2">
                <SubmitButton
                  isPending={isPending}
                  label="予約設定を保存"
                  pendingLabel="保存中..."
                />
              </div>
            ) : null}
          </fieldset>
        </CardContent>
      </Card>
    </form>
  );
}
