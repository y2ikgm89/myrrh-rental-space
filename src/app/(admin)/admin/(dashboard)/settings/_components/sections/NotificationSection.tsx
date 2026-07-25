"use client";

/**
 * 通知設定セクション
 *
 * 各種イベント通知のオン/オフ設定
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
import type { SettingsData } from "@/shared/domain/settings/types";
import type { Serialized } from "@/shared/lib/serialize";
import {
  isSettingsFormDisabled,
  type SettingsReadOnlyProps,
} from "../shared/settings-read-only";

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

interface NotificationSectionProps extends SettingsReadOnlyProps {
  settings: Serialized<SettingsData>;
  reservationEnabled?: boolean;
  contactEnabled?: boolean;
  eventsEnabled?: boolean;
}

type NotificationToggleProps = {
  // switchBoolean()（z.boolean().default(false)）の z.input は boolean | undefined。
  // control は実体の "on" / "" 文字列を読むため挙動は不変。
  field: FieldMetadata<boolean | undefined>;
  title: string;
  description: string;
  disabled: boolean;
  featureDisabledHint?: string | undefined;
};

function NotificationToggle({
  field,
  title,
  description,
  disabled,
  featureDisabledHint,
}: NotificationToggleProps) {
  const control = useInputControl(field);
  const isOn = control.value === "on";
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-0.5">
        <label className="text-sm font-medium" htmlFor={field.id}>
          {title}
        </label>
        <p className="text-xs text-muted-foreground">
          {featureDisabledHint ?? description}
        </p>
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

export function NotificationSection({
  settings,
  readOnly = false,
  reservationEnabled = true,
  contactEnabled = true,
  eventsEnabled = true,
}: NotificationSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateNotificationSettings,
    undefined,
  );
  const isDisabled = isSettingsFormDisabled(isPending, readOnly);
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
      notifyInquiryCustomerReply: settings.notifyInquiryCustomerReply
        ? "on"
        : "",
      notifyEventRegistration: settings.notifyEventRegistration ? "on" : "",
      notifyEventWaitlistRegistration: settings.notifyEventWaitlistRegistration
        ? "on"
        : "",
      notifyEventCancellation: settings.notifyEventCancellation ? "on" : "",
      expectedUpdatedAt: settings.notificationUpdatedAt,
    },
  });

  const notifyNewReservation = useInputControl(fields.notifyNewReservation);
  const notifyReservationChange = useInputControl(
    fields.notifyReservationChange,
  );
  const notifyReservationCancel = useInputControl(
    fields.notifyReservationCancel,
  );
  const notifyNewInquiry = useInputControl(fields.notifyNewInquiry);
  const notifyInquiryCustomerReply = useInputControl(
    fields.notifyInquiryCustomerReply,
  );
  const notifyEventRegistration = useInputControl(
    fields.notifyEventRegistration,
  );
  const notifyEventWaitlistRegistration = useInputControl(
    fields.notifyEventWaitlistRegistration,
  );
  const notifyEventCancellation = useInputControl(
    fields.notifyEventCancellation,
  );

  const allAdminNotifyOff = [
    notifyNewReservation,
    notifyReservationChange,
    notifyReservationCancel,
    notifyNewInquiry,
    notifyInquiryCustomerReply,
    notifyEventRegistration,
    notifyEventWaitlistRegistration,
    notifyEventCancellation,
  ].every((control) => control.value !== "on");

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("通知設定を更新しました");
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
  const reservationFeatureHint =
    "予約機能モジュールが OFF のため、この通知は送信されません。";
  const contactFeatureHint =
    "お問い合わせ機能モジュールが OFF のため、この通知は送信されません。";
  const eventsFeatureHint =
    "イベント機能モジュールが OFF のため、この通知は送信されません。";

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>通知トリガー設定</CardTitle>
          <CardDescription>
            どのイベントで管理者に通知メールを送信するか設定します。管理画面のベル（通知センター）とは別チャネルで、ここでの
            ON/OFF はアプリ内通知には影響しません。
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

            {allAdminNotifyOff && (
              <p
                role="status"
                className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground"
              >
                すべての管理者通知メールが OFF
                です。このままでは予約・お問い合わせ・イベント等のイベントが発生しても、管理者へメールは送信されません（アプリ内のベル通知は別途表示されます）。
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <NotificationToggle
                field={fields.notifyNewReservation}
                title="新規予約"
                description="予約が作成されたとき"
                disabled={isDisabled || !reservationEnabled}
                featureDisabledHint={
                  !reservationEnabled ? reservationFeatureHint : undefined
                }
              />
              <NotificationToggle
                field={fields.notifyReservationChange}
                title="予約変更"
                description="予約内容が変更されたとき"
                disabled={isDisabled || !reservationEnabled}
                featureDisabledHint={
                  !reservationEnabled ? reservationFeatureHint : undefined
                }
              />
              <NotificationToggle
                field={fields.notifyReservationCancel}
                title="予約キャンセル"
                description="予約がキャンセルされたとき"
                disabled={isDisabled || !reservationEnabled}
                featureDisabledHint={
                  !reservationEnabled ? reservationFeatureHint : undefined
                }
              />
              <NotificationToggle
                field={fields.notifyNewInquiry}
                title="お問い合わせ"
                description="お問い合わせが送信されたとき"
                disabled={isDisabled || !contactEnabled}
                featureDisabledHint={
                  !contactEnabled ? contactFeatureHint : undefined
                }
              />
              <NotificationToggle
                field={fields.notifyInquiryCustomerReply}
                title="お問い合わせ続報"
                description="会員がマイページから追加メッセージを送信したとき"
                disabled={isDisabled || !contactEnabled}
                featureDisabledHint={
                  !contactEnabled ? contactFeatureHint : undefined
                }
              />
              <NotificationToggle
                field={fields.notifyEventRegistration}
                title="イベント申込"
                description="イベントに申し込まれたとき"
                disabled={isDisabled || !eventsEnabled}
                featureDisabledHint={
                  !eventsEnabled ? eventsFeatureHint : undefined
                }
              />
              <NotificationToggle
                field={fields.notifyEventWaitlistRegistration}
                title="イベントキャンセル待ち登録"
                description="満員のイベントにキャンセル待ちで登録されたとき"
                disabled={isDisabled || !eventsEnabled}
                featureDisabledHint={
                  !eventsEnabled ? eventsFeatureHint : undefined
                }
              />
              <NotificationToggle
                field={fields.notifyEventCancellation}
                title="イベント申込キャンセル"
                description="イベント申込がキャンセルされたとき"
                disabled={isDisabled || !eventsEnabled}
                featureDisabledHint={
                  !eventsEnabled ? eventsFeatureHint : undefined
                }
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
                  label="通知設定を保存"
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
