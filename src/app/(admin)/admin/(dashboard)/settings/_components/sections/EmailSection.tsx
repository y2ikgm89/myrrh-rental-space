"use client";

/**
 * メール設定セクション
 *
 * 送信者情報、返信先、通知先メールアドレスの設定
 */

import { useEffect, useActionState, useState, useId } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import type { FieldMetadata } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { updateEmailSettings } from "@/admin/actions/settings";
import { emailFormSchema } from "@/admin/actions/settings/schemas/form-schemas-email-notification";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { EmailChips } from "./EmailChips";
import { NotificationStaffPicker } from "./NotificationStaffPicker";

type StaffOption = {
  id: string;
  name: string;
  email: string;
};

interface EmailSectionProps {
  settings: Serialized<SettingsData>;
  staff: StaffOption[];
}

type EmailSwitchProps = {
  // switchBoolean()（z.boolean().default(false)）の z.input は boolean | undefined。
  // control は実体の "on" / "" 文字列を読むため挙動は不変。
  field: FieldMetadata<boolean | undefined>;
  label: string;
  disabled: boolean;
};

function EmailSwitch({ field, label, disabled }: EmailSwitchProps) {
  const control = useInputControl(field);
  const isOn = control.value === "on";
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={field.id}
        checked={isOn}
        onCheckedChange={(checked) => control.change(checked ? "on" : "")}
        onBlur={control.blur}
        disabled={disabled}
      />
      <label className="text-sm font-medium" htmlFor={field.id}>
        {label}
      </label>
      <input type="hidden" name={field.name} value={isOn ? "on" : ""} />
    </div>
  );
}

export function EmailSection({ settings, staff }: EmailSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateEmailSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "email-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: emailFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      senderEmail: settings.senderEmail ?? "",
      senderName: settings.senderName ?? "",
      replyToEmail: settings.replyToEmail ?? "",
      sendReservationConfirmationEmail:
        settings.sendReservationConfirmationEmail ? "on" : "",
      notifyEventReminder: settings.notifyEventReminder ? "on" : "",
      notificationStaffIds: settings.notificationStaffIds,
      notificationEmailAddresses: settings.notificationEmailAddresses,
    },
  });

  const [staffIds, setStaffIds] = useState<string[]>(
    settings.notificationStaffIds,
  );
  const [customTokens, setCustomTokens] = useState<string[]>(
    () => settings.notificationEmailAddresses,
  );
  const customLabelId = useId();
  const customHelpId = useId();
  const noRecipients = staffIds.length === 0 && customTokens.length === 0;

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("メール設定を更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <>
      <form {...getFormProps(form)} action={action}>
        <Card>
          <CardHeader>
            <CardTitle>メール設定</CardTitle>
            <CardDescription>メール送信に関する設定を行います</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.senderEmail.id}
                >
                  送信元メールアドレス
                </label>
                <Input
                  {...getInputProps(fields.senderEmail, { type: "email" })}
                  placeholder="noreply@example.com"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Resend
                  で検証済みのドメインのアドレスを指定してください（保存時に照合します）。
                </p>
                {fields.senderEmail.errors &&
                  fields.senderEmail.errors.length > 0 && (
                    <p
                      id={fields.senderEmail.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.senderEmail.errors.join(", ")}
                    </p>
                  )}
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.senderName.id}
                >
                  送信者名
                </label>
                <Input
                  {...getInputProps(fields.senderName, { type: "text" })}
                  placeholder="Myrrh Rental Space"
                  disabled={isPending}
                />
                {fields.senderName.errors &&
                  fields.senderName.errors.length > 0 && (
                    <p
                      id={fields.senderName.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.senderName.errors.join(", ")}
                    </p>
                  )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              環境変数 <code className="font-mono">EMAIL_FROM</code> /{" "}
              <code className="font-mono">EMAIL_FROM_NAME</code>{" "}
              が設定されている場合はそちらが優先されます（通常は未設定で上の項目が使われます）。
            </p>

            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor={fields.replyToEmail.id}
              >
                返信先メールアドレス
              </label>
              <Input
                {...getInputProps(fields.replyToEmail, { type: "email" })}
                placeholder="info@example.com"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                受信者が「返信」したときの宛先。すべての送信メールに適用されます。
              </p>
              {fields.replyToEmail.errors &&
                fields.replyToEmail.errors.length > 0 && (
                  <p
                    id={fields.replyToEmail.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.replyToEmail.errors.join(", ")}
                  </p>
                )}
            </div>

            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-foreground">
                通知を受け取るスタッフ
              </span>
              <NotificationStaffPicker
                staff={staff}
                value={staffIds}
                onChange={setStaffIds}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                チェックしたスタッフの現在のメールアドレスに通知が届きます（メール変更・退職に自動で追従）。
              </p>
            </div>

            <div className="space-y-1.5">
              <span
                id={customLabelId}
                className="block text-sm font-medium text-foreground"
              >
                その他の通知先（スタッフ以外）
              </span>
              <EmailChips
                name="notificationEmailAddresses"
                value={customTokens}
                onChange={setCustomTokens}
                disabled={isPending}
                placeholder="info@example.com を入力して Enter"
                labelledBy={customLabelId}
                describedBy={customHelpId}
              />
              <p id={customHelpId} className="text-xs text-muted-foreground">
                スタッフ以外に通知したいアドレス（共有メール・外部担当者など）。入力して
                Enter／カンマで追加、× で削除できます。
              </p>
              {fields.notificationEmailAddresses.errors &&
                fields.notificationEmailAddresses.errors.length > 0 && (
                  <p
                    id={fields.notificationEmailAddresses.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.notificationEmailAddresses.errors.join(", ")}
                  </p>
                )}
            </div>

            {noRecipients && (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
                通知先が未設定です。このままだと予約・お問い合わせ等の管理者通知は誰にも届きません。
              </p>
            )}

            <fieldset className="rounded-lg border p-4 space-y-3">
              <legend className="px-1 text-sm font-medium">送信設定</legend>
              <EmailSwitch
                field={fields.sendReservationConfirmationEmail}
                label="予約確認メールを予約者へ送信"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                新規予約時の確認メールのみを制御します。キャンセル・ステータス変更の
                メールは予約者への重要連絡として、この設定に関わらず常に送信されます。
              </p>
              <EmailSwitch
                field={fields.notifyEventReminder}
                label="イベント前日リマインダーを参加者へ送信"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                翌日開催のイベントについて、前日に参加者全員へリマインダーメールを
                一斉送信します（毎時実行の
                cron）。参加者数に比例してメール送信数が 増えるため、既定では
                OFF になっています。有効化する場合は送信量にご注意ください。
              </p>
              <p className="text-xs text-muted-foreground">
                管理者への通知メール（新規予約・変更・キャンセル・お問い合わせ・イベント申込）の
                ON/OFF
                は「通知」タブ、宛先は上の「通知先メールアドレス」で設定します。
              </p>
            </fieldset>

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
                label="メール設定を保存"
                pendingLabel="保存中..."
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  );
}
