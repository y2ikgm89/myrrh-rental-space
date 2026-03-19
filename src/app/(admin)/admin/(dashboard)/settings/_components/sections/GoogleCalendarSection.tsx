"use client";

/**
 * Google Calendar設定セクション
 *
 * サービスアカウント連携、OAuth連携、iCal/Add to Calendar設定
 */

import { useState, useTransition } from "react";
import type { Serialized } from "@/shared/lib/serialize";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateGoogleCalendarSettings,
  testGoogleCalendarConnectionAction,
  clearGoogleCalendarServiceAccount,
  type SettingsData,
} from "@/admin/actions/settings";
import { googleCalendarFormSchema } from "@/admin/actions/settings/schemas";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface GoogleCalendarSectionProps {
  settings: Serialized<SettingsData>;
}

// =============================================================================
// Main Component
// =============================================================================

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
  const [showServiceAccountInput, setShowServiceAccountInput] = useState(false);

  const { form, isPending, onSubmit } = useFormAction(
    googleCalendarFormSchema,
    (data) =>
      updateGoogleCalendarSettings({
        googleCalendarEnabled: data.googleCalendarEnabled,
        googleCalendarId: data.googleCalendarId || null,
        serviceAccountJson: data.serviceAccountJson || null,
        icalAttachmentEnabled: data.icalAttachmentEnabled,
        addToCalendarLinksEnabled: data.addToCalendarLinksEnabled,
      }),
    {
      defaultValues: {
        googleCalendarEnabled: settings.googleCalendarEnabled,
        googleCalendarId: settings.googleCalendarId || "",
        serviceAccountJson: "",
        icalAttachmentEnabled: settings.icalAttachmentEnabled,
        addToCalendarLinksEnabled: settings.addToCalendarLinksEnabled,
      },
      refresh: true,
      successMessage: "Google Calendar設定を更新しました",
      onSuccess: () => {
        form.setValue("serviceAccountJson", "");
        setShowServiceAccountInput(false);
      },
    },
  );

  const handleConnectionTest = () => {
    const serviceAccountJson = form.getValues("serviceAccountJson");
    const calendarId = form.getValues("googleCalendarId");

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
        form.setValue("serviceAccountJson", "");
        setTestResult(null);
        router.refresh();
      }
    });
  };

  const serviceAccountJson = form.getValues("serviceAccountJson");
  const googleCalendarId = form.getValues("googleCalendarId");

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
              <FormField
                control={form.control}
                name="googleCalendarEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Google Calendar同期を有効にする</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        予約作成時に自動でカレンダーに登録します
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* カレンダーID */}
              <FormField
                control={form.control}
                name="googleCalendarId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>カレンダーID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="example@group.calendar.google.com"
                        disabled={isPending}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Google
                      Calendarの「設定」→「カレンダーの統合」からIDをコピーしてください
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* サービスアカウントJSON */}
              <FormField
                control={form.control}
                name="serviceAccountJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>サービスアカウント認証情報（JSON）</FormLabel>
                    {settings.googleCalendarServiceAccountEmailMasked &&
                    !showServiceAccountInput ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={
                            settings.googleCalendarServiceAccountEmailMasked
                          }
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
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder='{"type": "service_account", ...}'
                          rows={6}
                          className="font-mono text-xs"
                          disabled={isPending}
                        />
                      </FormControl>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Google Cloud
                      ConsoleでサービスアカウントのJSONキーをダウンロードしてください
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                    className={`text-sm ${testResult.success ? "text-success" : "text-destructive"}`}
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

            {/* 予約者向け設定 */}
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium">予約者向けカレンダー追加</h4>

              <FormField
                control={form.control}
                name="icalAttachmentEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>iCalファイルをメールに添付</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        予約確認メールにiCal (.ics) ファイルを添付します
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="addToCalendarLinksEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>「カレンダーに追加」リンクを表示</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Google Calendar、Outlook、Apple
                        Calendarへの追加リンクを表示します
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* アクションボタン */}
            <div className="flex flex-wrap gap-2">
              <SubmitButton
                isPending={isPending}
                label="設定を保存"
                disabled={!form.formState.isDirty}
              />
              {serviceAccountJson && googleCalendarId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConnectionTest}
                  disabled={isPending || testPending}
                >
                  {testPending ? "テスト中..." : "接続テスト"}
                </Button>
              )}
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
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
