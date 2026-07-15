"use client";

/**
 * 通知設定セクション
 *
 * 各種イベント通知のオン/オフ設定
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import type { FieldMetadata } from "@conform-to/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { updateNotificationSettings } from "@/admin/actions/settings";
import { notificationFormSchema } from "@/admin/actions/settings/schemas/form-schemas-email-notification";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface NotificationSectionProps {
  settings: Serialized<SettingsData>;
}

type NotificationToggleProps = {
  // switchBoolean()（z.boolean().default(false)）の z.input は boolean | undefined。
  // control は実体の "on" / "" 文字列を読むため挙動は不変。
  field: FieldMetadata<boolean | undefined>;
  title: string;
  description: string;
  disabled: boolean;
};

function NotificationToggle({
  field,
  title,
  description,
  disabled,
}: NotificationToggleProps) {
  const control = useInputControl(field);
  const isOn = control.value === "on";
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-0.5">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {title}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={field.id}
        checked={isOn}
        onCheckedChange={(checked) => control.change(checked ? "on" : "")}
        onBlur={control.blur}
        disabled={disabled}
      />
      <input type="hidden" name={field.name} value={isOn ? "on" : ""} />
    </div>
  );
}

export function NotificationSection({ settings }: NotificationSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateNotificationSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "notification-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: notificationFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      notifyNewReservation: settings.notifyNewReservation ? "on" : "",
      notifyReservationChange: settings.notifyReservationChange ? "on" : "",
      notifyReservationCancel: settings.notifyReservationCancel ? "on" : "",
      notifyNewInquiry: settings.notifyNewInquiry ? "on" : "",
      notifyEventRegistration: settings.notifyEventRegistration ? "on" : "",
      notifyEventWaitlistRegistration: settings.notifyEventWaitlistRegistration
        ? "on"
        : "",
      notifyEventCancellation: settings.notifyEventCancellation ? "on" : "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("通知設定を更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>通知トリガー設定</CardTitle>
          <CardDescription>
            どのイベントで管理者に通知メールを送信するか設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <NotificationToggle
              field={fields.notifyNewReservation}
              title="新規予約"
              description="予約が作成されたとき"
              disabled={isPending}
            />
            <NotificationToggle
              field={fields.notifyReservationChange}
              title="予約変更"
              description="予約内容が変更されたとき"
              disabled={isPending}
            />
            <NotificationToggle
              field={fields.notifyReservationCancel}
              title="予約キャンセル"
              description="予約がキャンセルされたとき"
              disabled={isPending}
            />
            <NotificationToggle
              field={fields.notifyNewInquiry}
              title="お問い合わせ"
              description="お問い合わせが送信されたとき"
              disabled={isPending}
            />
            <NotificationToggle
              field={fields.notifyEventRegistration}
              title="イベント申込"
              description="イベントに申し込まれたとき"
              disabled={isPending}
            />
            <NotificationToggle
              field={fields.notifyEventWaitlistRegistration}
              title="イベントキャンセル待ち登録"
              description="満員のイベントにキャンセル待ちで登録されたとき"
              disabled={isPending}
            />
            <NotificationToggle
              field={fields.notifyEventCancellation}
              title="イベント申込キャンセル"
              description="イベント申込がキャンセルされたとき"
              disabled={isPending}
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
              label="通知設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
