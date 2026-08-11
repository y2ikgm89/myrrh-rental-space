"use client";

/**
 * メール設定セクション
 *
 * 送信者情報、返信先、通知先メールアドレスの設定
 */

import {
  useEffect,
  useActionState,
  useRef,
  useState,
  useId,
  type SubmitEvent,
} from "react";
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
import type { SettingsData } from "@/shared/domain/settings/types";
import type { Serialized } from "@/shared/lib/serialize";
import { EmailChips, type EmailChipsHandle } from "./EmailChips";
import { NotificationStaffPicker } from "./NotificationStaffPicker";
import {
  isSettingsFormDisabled,
  type SettingsReadOnlyProps,
} from "../shared/settings-read-only";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

type StaffOption = {
  id: string;
  name: string;
  email: string;
};

interface EmailSectionProps extends SettingsReadOnlyProps {
  settings: Serialized<SettingsData>;
  staff: StaffOption[];
  reservationEnabled?: boolean;
  eventsEnabled?: boolean;
}

type EmailSwitchProps = {
  // switchBoolean()（z.boolean().default(false)）の z.input は boolean | undefined。
  // control は実体の "on" / "" 文字列を読むため挙動は不変。
  field: FieldMetadata<boolean | undefined>;
  label: string;
  disabled: boolean;
  hint?: string | undefined;
};

function EmailSwitch({ field, label, disabled, hint }: EmailSwitchProps) {
  const control = useInputControl(field);
  const isOn = control.value === "on";
  return (
    <div className="space-y-1">
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
      {hint ? (
        <p className="text-xs text-muted-foreground pl-0.5">{hint}</p>
      ) : null}
    </div>
  );
}

function filterValidStaffIds(
  staffIds: string[],
  staff: StaffOption[],
): string[] {
  const allowlist = new Set(staff.map((member) => member.id));
  return staffIds.filter((id) => allowlist.has(id));
}

export function EmailSection({
  settings,
  staff,
  readOnly = false,
  reservationEnabled = true,
  eventsEnabled = true,
}: EmailSectionProps) {
  const router = useRouter();
  const emailChipsRef = useRef<EmailChipsHandle>(null);
  const [lastResult, action, isPending] = useActionState(
    updateEmailSettings,
    undefined,
  );
  const isDisabled = isSettingsFormDisabled(isPending, readOnly);

  const initialValidStaffIds = filterValidStaffIds(
    settings.notificationStaffIds,
    staff,
  );

  const orphanStaffIds = settings.notificationStaffIds.filter(
    (id) => !staff.some((member) => member.id === id),
  );

  const [form, fields] = useForm({
    id: "email-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: emailFormSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      senderEmail: settings.senderEmail ?? "",
      senderName: settings.senderName ?? "",
      replyToEmail: settings.replyToEmail ?? "",
      sendReservationConfirmationEmail:
        settings.sendReservationConfirmationEmail ? "on" : "",
      notifyEventReminder: settings.notifyEventReminder ? "on" : "",
      notificationStaffIds: initialValidStaffIds,
      notificationEmailAddresses: settings.notificationEmailAddresses,
      expectedOrganizationUpdatedAt: settings.organizationUpdatedAt,
      expectedReservationUpdatedAt: settings.reservationUpdatedAt,
      expectedNotificationUpdatedAt: settings.notificationUpdatedAt,
    },
  });

  const [staffIds, setStaffIds] = useState<string[]>(initialValidStaffIds);
  const [customTokens, setCustomTokens] = useState<string[]>(
    () => settings.notificationEmailAddresses,
  );
  // props 同期（配列は参照ではなく内容比較 — 毎 render 新配列でも無限ループしない）
  const [previousStaffIdsKey, setPreviousStaffIdsKey] = useState(() =>
    settings.notificationStaffIds.join("\0"),
  );
  const [previousCustomEmailsKey, setPreviousCustomEmailsKey] = useState(() =>
    settings.notificationEmailAddresses.join("\0"),
  );
  const nextStaffIdsKey = settings.notificationStaffIds.join("\0");
  const nextCustomEmailsKey = settings.notificationEmailAddresses.join("\0");
  if (nextStaffIdsKey !== previousStaffIdsKey) {
    setPreviousStaffIdsKey(nextStaffIdsKey);
    setStaffIds(settings.notificationStaffIds);
  }
  if (nextCustomEmailsKey !== previousCustomEmailsKey) {
    setPreviousCustomEmailsKey(nextCustomEmailsKey);
    setCustomTokens(settings.notificationEmailAddresses);
  }
  const customLabelId = useId();
  const customHelpId = useId();
  const noRecipients = staffIds.length === 0 && customTokens.length === 0;

  const flushEmailChipsDraft = (): boolean =>
    emailChipsRef.current?.flushDraft() ?? true;

  const handleSubmitCapture = (event: SubmitEvent<HTMLFormElement>) => {
    if (!flushEmailChipsDraft()) {
      event.preventDefault();
    }
  };

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("メール設定を更新しました");
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
    <>
      <form
        {...getFormProps(form)}
        action={action}
        onSubmitCapture={handleSubmitCapture}
      >
        <Card>
          <CardHeader>
            <CardTitle>メール設定</CardTitle>
            <CardDescription>メール送信に関する設定を行います</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset
              disabled={readOnly}
              className="space-y-4 border-0 p-0 m-0 min-w-0"
            >
              <input
                {...getInputProps(fields.expectedOrganizationUpdatedAt, {
                  type: "hidden",
                })}
              />
              <input
                {...getInputProps(fields.expectedReservationUpdatedAt, {
                  type: "hidden",
                })}
              />
              <input
                {...getInputProps(fields.expectedNotificationUpdatedAt, {
                  type: "hidden",
                })}
              />

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
                    disabled={isDisabled}
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
                    disabled={isDisabled}
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
                  disabled={isDisabled}
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
                {orphanStaffIds.length > 0 && (
                  <p
                    role="status"
                    className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground"
                  >
                    選択できないスタッフ ID が {orphanStaffIds.length}{" "}
                    件含まれています（退職・権限変更など）。次回の保存で自動的に削除されます。
                  </p>
                )}
                <NotificationStaffPicker
                  staff={staff}
                  value={staffIds}
                  onChange={setStaffIds}
                  disabled={isDisabled}
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
                  ref={emailChipsRef}
                  name="notificationEmailAddresses"
                  value={customTokens}
                  onChange={setCustomTokens}
                  disabled={isDisabled}
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
                  disabled={isDisabled || !reservationEnabled}
                  hint={
                    !reservationEnabled
                      ? "予約機能モジュールが OFF のため、この設定は無効です。"
                      : undefined
                  }
                />
                <p className="text-xs text-muted-foreground">
                  新規予約時の確認メールのみを制御します。キャンセル・ステータス変更の
                  メールは予約者への重要連絡として、この設定に関わらず常に送信されます。
                </p>
                <EmailSwitch
                  field={fields.notifyEventReminder}
                  label="イベント前日リマインダーを参加者へ送信"
                  disabled={isDisabled || !eventsEnabled}
                  hint={
                    !eventsEnabled
                      ? "イベント機能モジュールが OFF のため、この設定は無効です。"
                      : undefined
                  }
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

              {!readOnly ? (
                <div className="flex justify-end pt-2">
                  <SubmitButton
                    isPending={isPending}
                    label="メール設定を保存"
                    pendingLabel="保存中..."
                  />
                </div>
              ) : null}
            </fieldset>
          </CardContent>
        </Card>
      </form>
    </>
  );
}
