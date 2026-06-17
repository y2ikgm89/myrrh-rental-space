"use client";

/**
 * Google Calendar設定セクション
 *
 * サービスアカウント連携、iCal/Add to Calendar設定。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import type { Serialized } from "@/shared/lib/serialize";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { cn } from "@/shared/lib/cn";
import { toast } from "sonner";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import {
  updateGoogleCalendarSettings,
  testGoogleCalendarConnectionAction,
  clearGoogleCalendarServiceAccount,
  toggleEventImport,
  type SettingsData,
} from "@/admin/actions/settings";
import { googleCalendarFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

interface GoogleCalendarSectionProps {
  settings: Serialized<SettingsData>;
}

type ReminderMode = "default" | "off" | "custom";

export function GoogleCalendarSection({
  settings,
}: GoogleCalendarSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    calendarName?: string;
    accountEmail?: string;
  } | null>(null);
  const [showCalendarIdInput, setShowCalendarIdInput] = useState(false);
  const [showServiceAccountInput, setShowServiceAccountInput] = useState(false);

  const [lastResult, action, isPending] = useActionState(
    updateGoogleCalendarSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "google-calendar-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: googleCalendarFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      googleCalendarEnabled: settings.googleCalendarEnabled ? "on" : "",
      googleCalendarId: settings.googleCalendarId ?? "",
      serviceAccountJson: "",
      icalAttachmentEnabled: settings.icalAttachmentEnabled ? "on" : "",
      addToCalendarLinksEnabled: settings.addToCalendarLinksEnabled ? "on" : "",
      googleCalendarMeetEnabled: settings.googleCalendarMeetEnabled ? "on" : "",
      googleCalendarReminderMinutes:
        settings.googleCalendarReminderMinutes === null
          ? ""
          : String(settings.googleCalendarReminderMinutes),
    },
  });

  const calendarEnabledControl = useInputControl(fields.googleCalendarEnabled);
  const icalAttachmentControl = useInputControl(fields.icalAttachmentEnabled);
  const addToCalendarControl = useInputControl(
    fields.addToCalendarLinksEnabled,
  );
  const meetEnabledControl = useInputControl(fields.googleCalendarMeetEnabled);
  const reminderControl = useInputControl(fields.googleCalendarReminderMinutes);
  const serviceAccountControl = useInputControl(fields.serviceAccountJson);
  const calendarIdControl = useInputControl(fields.googleCalendarId);

  const calendarEnabled = calendarEnabledControl.value === "on";
  const icalAttachment = icalAttachmentControl.value === "on";
  const addToCalendar = addToCalendarControl.value === "on";
  const meetEnabled = meetEnabledControl.value === "on";
  const reminderRaw = reminderControl.value ?? "";
  const calendarId = calendarIdControl.value ?? "";
  const serviceAccountJson = serviceAccountControl.value ?? "";

  // リマインダー mode 計算（null=default / 0=off / N=custom）
  const reminderMode: ReminderMode =
    reminderRaw === "" ? "default" : reminderRaw === "0" ? "off" : "custom";

  // 保存成功時に showServiceAccountInput をリセット
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setShowCalendarIdInput(false);
      setShowServiceAccountInput(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("Google Calendar設定を更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const handleConnectionTest = () => {
    if (!serviceAccountJson || !calendarId) {
      setTestResult({
        success: false,
        message: "サービスアカウントJSONとカレンダーIDを入力してください",
      });
      return;
    }

    startTestTransition(async () => {
      setTestResult(null);
      try {
        const result = await testGoogleCalendarConnectionAction({
          serviceAccountJson,
          calendarId,
        });
        if (!isMutationError(result)) {
          setTestResult({
            success: true,
            message: "接続成功",
            calendarName: result.calendarName,
            accountEmail: result.accountEmail,
          });
          router.refresh();
        } else {
          setTestResult({ success: false, message: result.error });
        }
      } catch {
        setTestResult({
          success: false,
          message: "接続テストでエラーが発生しました",
        });
      }
    });
  };

  const handleClearCredentials = async () => {
    const confirmed = await confirmDialog({
      title: "認証情報をクリアしますか？",
      description: "サービスアカウント認証情報をクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTestTransition(async () => {
      const result = await clearGoogleCalendarServiceAccount();
      if (!isMutationError(result)) {
        serviceAccountControl.change("");
        setTestResult(null);
        toast.success("認証情報をクリアしました");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleReminderModeChange = (mode: ReminderMode) => {
    if (mode === "default") reminderControl.change("");
    else if (mode === "off") reminderControl.change("0");
    else reminderControl.change("60");
  };

  return (
    <form {...getFormProps(form)} action={action}>
      <input
        type="hidden"
        name={fields.googleCalendarEnabled.name}
        value={calendarEnabledControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.icalAttachmentEnabled.name}
        value={icalAttachmentControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.addToCalendarLinksEnabled.name}
        value={addToCalendarControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.googleCalendarMeetEnabled.name}
        value={meetEnabledControl.value ?? ""}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Google Calendar連携
          </CardTitle>
          <CardDescription>
            予約をGoogle
            Calendarに自動登録し、予約者にカレンダー追加リンクを提供します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* サービスアカウント連携セクション */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">
              サービスアカウント連携（共有カレンダー）
            </h4>

            {/* 有効/無効 */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={fields.googleCalendarEnabled.id}>
                  Google Calendar同期を有効にする
                </Label>
                <p className="text-sm text-muted-foreground">
                  予約作成時に自動でカレンダーに登録します
                </p>
              </div>
              <Switch
                id={fields.googleCalendarEnabled.id}
                checked={calendarEnabled}
                onCheckedChange={(checked) =>
                  calendarEnabledControl.change(checked ? "on" : "")
                }
                disabled={isPending}
              />
            </div>

            {/* カレンダーID */}
            <div className="space-y-2">
              <Label htmlFor={fields.googleCalendarId.id}>カレンダーID</Label>
              {settings.googleCalendarId && !showCalendarIdInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={settings.googleCalendarId}
                    disabled
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCalendarIdInput(true)}
                  >
                    変更
                  </Button>
                </div>
              ) : (
                <Input
                  {...getInputProps(fields.googleCalendarId, { type: "text" })}
                  placeholder="example@group.calendar.google.com"
                  disabled={isPending}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Google
                Calendarの「設定」→「カレンダーの統合」からIDをコピーしてください。誤って書き換えないよう、保存済みの場合は「変更」を押してから編集します。
              </p>
              {fields.googleCalendarId.errors && (
                <p
                  id={fields.googleCalendarId.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.googleCalendarId.errors.join(", ")}
                </p>
              )}
            </div>

            {/* サービスアカウントJSON */}
            <div className="space-y-2">
              <Label htmlFor={fields.serviceAccountJson.id}>
                サービスアカウント認証情報（JSON）
              </Label>
              {settings.googleCalendarServiceAccountEmailMasked &&
              !showServiceAccountInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={settings.googleCalendarServiceAccountEmailMasked}
                    disabled
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowServiceAccountInput(true)}
                  >
                    変更
                  </Button>
                </div>
              ) : (
                <Textarea
                  {...getTextareaProps(fields.serviceAccountJson)}
                  placeholder='{"type": "service_account", ...}'
                  rows={6}
                  className="font-mono text-xs"
                  disabled={isPending}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Google Cloud
                ConsoleでサービスアカウントのJSONキーをダウンロードしてください
              </p>
              {fields.serviceAccountJson.errors && (
                <p
                  id={fields.serviceAccountJson.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.serviceAccountJson.errors.join(", ")}
                </p>
              )}
            </div>

            {/* 接続ステータス */}
            {settings.googleCalendarConnectionStatus && (
              <StatusBanner
                success={
                  settings.googleCalendarConnectionStatus === "connected"
                }
              >
                <div className="flex items-center gap-2">
                  {settings.googleCalendarConnectionStatus === "connected" ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-success" />
                      <span className="text-sm font-medium text-success">
                        接続済み
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      <span className="text-sm font-medium text-destructive">
                        エラー
                      </span>
                    </>
                  )}
                </div>
                {settings.googleCalendarLastTestedAt && (
                  <p className="text-xs text-muted-foreground">
                    最終テスト:{" "}
                    {formatDateTimeShort(settings.googleCalendarLastTestedAt)}
                  </p>
                )}
              </StatusBanner>
            )}

            {/* 接続テスト結果 */}
            {testResult && (
              <StatusBanner success={testResult.success}>
                <p
                  className={cn(
                    "text-sm",
                    testResult.success ? "text-success" : "text-destructive",
                  )}
                >
                  {testResult.message}
                </p>
                {testResult.calendarName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    カレンダー名: {testResult.calendarName}
                  </p>
                )}
                {testResult.accountEmail && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    サービスアカウント: {testResult.accountEmail}
                  </p>
                )}
              </StatusBanner>
            )}
          </div>

          {/* カレンダーイベント設定（Meet + リマインダー） */}
          <fieldset className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">
              カレンダーイベント設定
            </legend>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={fields.googleCalendarMeetEnabled.id}>
                  Google Meet を自動生成
                </Label>
                <p className="text-sm text-muted-foreground">
                  予約イベントに Google Meet
                  ビデオ会議リンクを自動追加します（OAuth 連携必須）
                </p>
              </div>
              <Switch
                id={fields.googleCalendarMeetEnabled.id}
                checked={meetEnabled}
                onCheckedChange={(checked) =>
                  meetEnabledControl.change(checked ? "on" : "")
                }
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.googleCalendarReminderMinutes.id}>
                メール通知リマインダー
              </Label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  id={fields.googleCalendarReminderMinutes.id}
                  value={reminderMode}
                  onChange={(event) => {
                    const v = event.target.value;
                    if (v === "default" || v === "off" || v === "custom") {
                      handleReminderModeChange(v);
                    }
                  }}
                  disabled={isPending}
                  className="h-11 rounded-md border border-border bg-background px-3 text-sm"
                  aria-label="リマインダー設定"
                >
                  <option value="default">カレンダー既定を使う</option>
                  <option value="off">通知なし</option>
                  <option value="custom">開始前にメール通知</option>
                </select>
                {reminderMode === "custom" && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={40320}
                      step={5}
                      value={reminderRaw || "60"}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        reminderControl.change(
                          Number.isFinite(parsed) && parsed > 0
                            ? String(parsed)
                            : "60",
                        );
                      }}
                      disabled={isPending}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">分前</span>
                  </div>
                )}
              </div>
              <input
                type="hidden"
                name={fields.googleCalendarReminderMinutes.name}
                value={reminderRaw}
              />
              <p className="text-xs text-muted-foreground">
                既定: Google カレンダーに設定された通知タイミングを使用 / 0
                分で通知なし / 最大 40320 分（4 週間）
              </p>
              {fields.googleCalendarReminderMinutes.errors && (
                <p
                  id={fields.googleCalendarReminderMinutes.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.googleCalendarReminderMinutes.errors.join(", ")}
                </p>
              )}
            </div>
          </fieldset>

          {/* 予約者向け設定 */}
          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium">予約者向けカレンダー追加</h4>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={fields.icalAttachmentEnabled.id}>
                  iCalファイルをメールに添付
                </Label>
                <p className="text-sm text-muted-foreground">
                  予約確認メールにiCal (.ics) ファイルを添付します
                </p>
              </div>
              <Switch
                id={fields.icalAttachmentEnabled.id}
                checked={icalAttachment}
                onCheckedChange={(checked) =>
                  icalAttachmentControl.change(checked ? "on" : "")
                }
                disabled={isPending}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={fields.addToCalendarLinksEnabled.id}>
                  「カレンダーに追加」リンクを表示
                </Label>
                <p className="text-sm text-muted-foreground">
                  Google Calendar、Outlook、Apple
                  Calendarへの追加リンクを表示します
                </p>
              </div>
              <Switch
                id={fields.addToCalendarLinksEnabled.id}
                checked={addToCalendar}
                onCheckedChange={(checked) =>
                  addToCalendarControl.change(checked ? "on" : "")
                }
                disabled={isPending}
              />
            </div>
          </div>

          {/* イベント取り込み設定（接続済みの場合のみ表示） */}
          {settings.googleCalendarConnectionStatus === "connected" && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium">イベント取り込み</h4>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">イベント取り込み</p>
                  <p className="text-sm text-muted-foreground">
                    Google Calendar
                    のイベントを自動的にイベント管理に取り込みます（下書き状態で作成されます）
                  </p>
                </div>
                <Switch
                  checked={settings.eventImportEnabled}
                  onCheckedChange={(checked) => {
                    startTestTransition(async () => {
                      const result = await toggleEventImport(checked);
                      if (!isMutationError(result)) {
                        router.refresh();
                      }
                    });
                  }}
                  disabled={isPending || testPending}
                />
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {settings.googleCalendarServiceAccountEmailMasked && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleClearCredentials}
                disabled={isPending || testPending}
              >
                認証情報をクリア
              </Button>
            )}
            {serviceAccountJson && calendarId && (
              <Button
                type="button"
                variant="outline"
                onClick={handleConnectionTest}
                disabled={isPending || testPending}
              >
                {testPending ? "テスト中..." : "接続テスト"}
              </Button>
            )}
            <SubmitButton
              isPending={isPending}
              label="設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
