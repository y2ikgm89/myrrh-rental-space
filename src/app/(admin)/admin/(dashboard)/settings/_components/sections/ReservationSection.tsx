"use client";

/**
 * 予約設定セクション
 *
 * 予約時間単位、最小/最大予約時間、キャンセル/変更期限の設定
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
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

interface ReservationSectionProps {
  settings: Serialized<SettingsData>;
}

const DEADLINE_OPTIONS = [
  { value: "1", label: "1時間前" },
  { value: "3", label: "3時間前" },
  { value: "6", label: "6時間前" },
  { value: "12", label: "12時間前" },
  { value: "24", label: "24時間前" },
  { value: "48", label: "48時間前" },
  { value: "72", label: "72時間前" },
];

export function ReservationSection({ settings }: ReservationSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateReservationSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "reservation-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: reservationSettingsSchema });
    },
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
    },
  });

  const cancellationDeadline = useInputControl(
    fields.cancellationDeadlineHours,
  );
  const modificationDeadline = useInputControl(
    fields.modificationDeadlineHours,
  );
  const customerCanCancelSeriesInFullControl = useInputControl(
    fields.customerCanCancelSeriesInFull,
  );
  const customerCanCancelSeriesInFullOn =
    customerCanCancelSeriesInFullControl.value === "on";

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("予約設定を保存しました");
      router.refresh();
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
                disabled={isPending}
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
                disabled={isPending}
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
                disabled={isPending}
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
                disabled={isPending}
              >
                <SelectTrigger
                  id={fields.cancellationDeadlineHours.id}
                  className="w-full"
                  onBlur={cancellationDeadline.blur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                name={fields.cancellationDeadlineHours.name}
                value={cancellationDeadline.value ?? ""}
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
                disabled={isPending}
              >
                <SelectTrigger
                  id={fields.modificationDeadlineHours.id}
                  className="w-full"
                  onBlur={modificationDeadline.blur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                name={fields.modificationDeadlineHours.name}
                value={modificationDeadline.value ?? ""}
              />
            </div>
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
                個別の予約は各自キャンセルできますが、series 全体のキャンセルは
                管理者への問い合わせのみ受け付けます。
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
                customerCanCancelSeriesInFullControl.change(checked ? "on" : "")
              }
              onBlur={customerCanCancelSeriesInFullControl.blur}
              disabled={isPending}
            />
            <input
              type="hidden"
              name={fields.customerCanCancelSeriesInFull.name}
              value={customerCanCancelSeriesInFullControl.value ?? ""}
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

          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="予約設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
