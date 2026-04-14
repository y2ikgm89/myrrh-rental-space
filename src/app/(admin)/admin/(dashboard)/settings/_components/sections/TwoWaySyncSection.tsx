"use client";

/**
 * 双方向同期設定セクション（Phase 4）
 *
 * Google Calendarからの変更を予約システムに反映する設定
 * - ポーリング（定期的なチェック）
 * - Webhook（プッシュ通知）
 */

import { useState, useTransition } from "react";
import type { Serialized } from "@/shared/lib/serialize";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { cn } from "@/shared/lib/cn";
import { toast } from "sonner";
import { useWatch } from "react-hook-form";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateTwoWaySyncSettings,
  setupCalendarWebhook,
  stopCalendarWebhook,
  triggerManualSync,
  type SettingsData,
} from "@/admin/actions/settings";
import { twoWaySyncFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import {
  IconRefresh,
  IconClock,
  IconWebhook,
  IconAlertCircle,
  IconCircleCheck,
} from "@tabler/icons-react";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface TwoWaySyncSectionProps {
  settings: Serialized<SettingsData>;
}

// =============================================================================
// Main Component
// =============================================================================

export function TwoWaySyncSection({ settings }: TwoWaySyncSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [actionPending, startActionTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { form, isPending, onSubmit } = useFormAction(
    twoWaySyncFormSchema,
    (data) => updateTwoWaySyncSettings(data),
    {
      defaultValues: {
        enabled: settings.googleCalendarTwoWaySyncEnabled,
        syncMethod: settings.googleCalendarSyncMethod,
        pollingIntervalMin: settings.googleCalendarPollingIntervalMin,
      },
      refresh: true,
      successMessage: "双方向同期設定を更新しました",
    },
  );

  const enabled = useWatch({ control: form.control, name: "enabled" });
  const syncMethod = useWatch({ control: form.control, name: "syncMethod" });

  // Google Calendarが有効でない場合は表示しない
  if (
    !settings.googleCalendarEnabled ||
    settings.googleCalendarConnectionStatus !== "connected"
  ) {
    return null;
  }

  const handleSetupWebhook = () => {
    startActionTransition(async () => {
      const result = await setupCalendarWebhook();
      if (!isMutationError(result)) {
        toast.success("Webhookを設定しました");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleStopWebhook = async () => {
    const confirmed = await confirmDialog({
      title: "Webhookを停止しますか？",
      description: "Webhookを停止しますか？",
      confirmLabel: "停止",
      variant: "destructive",
    });
    if (!confirmed) return;

    startActionTransition(async () => {
      const result = await stopCalendarWebhook();
      if (!isMutationError(result)) {
        toast.success("Webhookを停止しました");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await triggerManualSync();
      if (!isMutationError(result)) {
        setSyncResult({
          success: true,
          message: `同期完了: ${result.processed}件処理 (更新: ${result.updated}件, 削除: ${result.deleted}件)`,
        });
        toast.success("同期が完了しました");
        router.refresh();
      } else {
        setSyncResult({ success: false, message: result.error });
        toast.error("同期に失敗しました");
      }
    } catch {
      setSyncResult({
        success: false,
        message: "同期中にエラーが発生しました",
      });
      toast.error("同期中にエラーが発生しました");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconRefresh className="h-5 w-5" />
              双方向同期（カレンダー → 予約システム）
            </CardTitle>
            <CardDescription>
              Google
              Calendarでの変更（時間変更、削除など）を予約システムに自動反映します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 有効化トグル */}
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>双方向同期を有効化</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      カレンダーの変更を予約システムに反映
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

            {enabled && (
              <>
                {/* 同期方式設定 */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="syncMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>同期方式</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={CalendarSyncMethod.polling}>
                              <div className="flex items-center gap-2">
                                <IconClock className="h-4 w-4" />
                                ポーリングのみ
                              </div>
                            </SelectItem>
                            <SelectItem value={CalendarSyncMethod.webhook}>
                              <div className="flex items-center gap-2">
                                <IconWebhook className="h-4 w-4" />
                                Webhookのみ
                              </div>
                            </SelectItem>
                            <SelectItem value={CalendarSyncMethod.both}>
                              <div className="flex items-center gap-2">
                                <IconRefresh className="h-4 w-4" />
                                両方使用（推奨）
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          {syncMethod === CalendarSyncMethod.polling &&
                            "ポーリング: 定期的にカレンダーをチェック（5分ごと推奨）"}
                          {syncMethod === CalendarSyncMethod.webhook &&
                            "Webhook: カレンダー変更時に即座に通知を受信"}
                          {syncMethod === CalendarSyncMethod.both &&
                            "Webhookで即時同期 + ポーリングでバックアップ"}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* ポーリング間隔 */}
                  {(syncMethod === CalendarSyncMethod.polling ||
                    syncMethod === CalendarSyncMethod.both) && (
                    <FormField
                      control={form.control}
                      name="pollingIntervalMin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ポーリング間隔</FormLabel>
                          <Select
                            value={String(field.value)}
                            onValueChange={(value) =>
                              field.onChange(Number(value))
                            }
                            disabled={isPending}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">1分</SelectItem>
                              <SelectItem value="5">5分（推奨）</SelectItem>
                              <SelectItem value="10">10分</SelectItem>
                              <SelectItem value="15">15分</SelectItem>
                              <SelectItem value="30">30分</SelectItem>
                              <SelectItem value="60">60分</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Webhook設定 */}
                {(syncMethod === CalendarSyncMethod.webhook ||
                  syncMethod === CalendarSyncMethod.both) && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-2">
                          <IconWebhook className="h-4 w-4" />
                          Webhook状態
                        </FormLabel>
                        {settings.googleCalendarWebhookActive ? (
                          <p className="text-sm text-success flex items-center gap-1">
                            <IconCircleCheck className="h-4 w-4" />
                            有効（有効期限:{" "}
                            {formatDateTimeShort(
                              settings.googleCalendarWebhookExpiration,
                            )}
                            ）
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <IconAlertCircle className="h-4 w-4" />
                            未設定
                          </p>
                        )}
                      </div>
                      {settings.googleCalendarWebhookActive ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleStopWebhook}
                          disabled={isPending || actionPending}
                        >
                          停止
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSetupWebhook}
                          disabled={isPending || actionPending}
                        >
                          設定
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Webhookは最大7日間有効です。期限切れ時は自動的にポーリングにフォールバックします。
                    </p>
                  </div>
                )}

                {/* 同期ステータス */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <FormLabel>最終同期</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTimeShort(
                          settings.googleCalendarLastSyncedAt,
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleManualSync}
                      disabled={isSyncing || isPending || actionPending}
                    >
                      <IconRefresh
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSyncing && "animate-spin",
                        )}
                      />
                      {isSyncing ? "同期中..." : "手動同期"}
                    </Button>
                  </div>
                  {syncResult && (
                    <div
                      className={cn(
                        "rounded p-2 text-sm",
                        syncResult.success
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {syncResult.message}
                    </div>
                  )}
                </div>

                {/* 保存ボタン */}
                <div className="flex justify-end pt-2">
                  <SubmitButton
                    isPending={isPending}
                    label="設定を保存"
                    disabled={!form.formState.isDirty}
                  />
                </div>
              </>
            )}

            {!enabled && (
              <div className="flex justify-end pt-2">
                <SubmitButton
                  isPending={isPending}
                  label="設定を保存"
                  disabled={!form.formState.isDirty}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
