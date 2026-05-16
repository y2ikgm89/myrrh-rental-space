"use client";

/**
 * 双方向同期設定セクション — Phase 1 Task 6 conform 移行
 *
 * Google Calendarからの変更を予約システムに反映する設定。
 * `useFormAction` (RHF) → `useActionState` + `useForm` (conform) clean break 移行。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import type { Serialized } from "@/shared/lib/serialize";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { cn } from "@/shared/lib/cn";
import { toast } from "sonner";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
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
import { isValidCalendarSyncMethod } from "@/shared/lib/validations/enums/guards";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

interface TwoWaySyncSectionProps {
  settings: Serialized<SettingsData>;
}

const POLLING_INTERVAL_OPTIONS = [1, 5, 10, 15, 30, 60] as const;

export function TwoWaySyncSection({ settings }: TwoWaySyncSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [actionPending, startActionTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [lastResult, action, isPending] = useActionState(
    updateTwoWaySyncSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "two-way-sync-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: twoWaySyncFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      enabled: settings.googleCalendarTwoWaySyncEnabled ? "on" : "",
      syncMethod: settings.googleCalendarSyncMethod,
      pollingIntervalMin: String(settings.googleCalendarPollingIntervalMin),
    },
  });

  const enabledControl = useInputControl(fields.enabled);
  const syncMethodControl = useInputControl(fields.syncMethod);
  const pollingIntervalControl = useInputControl(fields.pollingIntervalMin);

  const enabled = enabledControl.value === "on";
  const syncMethod =
    syncMethodControl.value ?? settings.googleCalendarSyncMethod;
  const pollingInterval =
    pollingIntervalControl.value ??
    String(settings.googleCalendarPollingIntervalMin);

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("双方向同期設定を更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

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
    <form {...getFormProps(form)} action={action}>
      <input
        type="hidden"
        name={fields.enabled.name}
        value={enabledControl.value ?? ""}
      />
      <input type="hidden" name={fields.syncMethod.name} value={syncMethod} />
      <input
        type="hidden"
        name={fields.pollingIntervalMin.name}
        value={pollingInterval}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconRefresh className="h-5 w-5" aria-hidden="true" />
            双方向同期（カレンダー → 予約システム）
          </CardTitle>
          <CardDescription>
            Google
            Calendarでの変更（時間変更、削除など）を予約システムに自動反映します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 有効化トグル */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={fields.enabled.id}>双方向同期を有効化</Label>
              <p className="text-sm text-muted-foreground">
                カレンダーの変更を予約システムに反映
              </p>
            </div>
            <Switch
              id={fields.enabled.id}
              checked={enabled}
              onCheckedChange={(checked) =>
                enabledControl.change(checked ? "on" : "")
              }
              disabled={isPending}
            />
          </div>

          {enabled && (
            <>
              {/* 同期方式設定 */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={fields.syncMethod.id}>同期方式</Label>
                  <Select
                    value={syncMethod}
                    onValueChange={(value) => {
                      if (isValidCalendarSyncMethod(value)) {
                        syncMethodControl.change(value);
                      }
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger id={fields.syncMethod.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CalendarSyncMethod.polling}>
                        <div className="flex items-center gap-2">
                          <IconClock className="h-4 w-4" aria-hidden="true" />
                          ポーリングのみ
                        </div>
                      </SelectItem>
                      <SelectItem value={CalendarSyncMethod.webhook}>
                        <div className="flex items-center gap-2">
                          <IconWebhook className="h-4 w-4" aria-hidden="true" />
                          Webhookのみ
                        </div>
                      </SelectItem>
                      <SelectItem value={CalendarSyncMethod.both}>
                        <div className="flex items-center gap-2">
                          <IconRefresh className="h-4 w-4" aria-hidden="true" />
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
                  {fields.syncMethod.errors && (
                    <p
                      id={fields.syncMethod.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.syncMethod.errors.join(", ")}
                    </p>
                  )}
                </div>

                {/* ポーリング間隔 */}
                {(syncMethod === CalendarSyncMethod.polling ||
                  syncMethod === CalendarSyncMethod.both) && (
                  <div className="space-y-2">
                    <Label htmlFor={fields.pollingIntervalMin.id}>
                      ポーリング間隔
                    </Label>
                    <Select
                      value={pollingInterval}
                      onValueChange={(value) => {
                        pollingIntervalControl.change(value);
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger id={fields.pollingIntervalMin.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POLLING_INTERVAL_OPTIONS.map((min) => (
                          <SelectItem key={min} value={String(min)}>
                            {min}分{min === 5 ? "（推奨）" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fields.pollingIntervalMin.errors && (
                      <p
                        id={fields.pollingIntervalMin.errorId}
                        className="text-sm text-destructive"
                      >
                        {fields.pollingIntervalMin.errors.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Webhook設定 */}
              {(syncMethod === CalendarSyncMethod.webhook ||
                syncMethod === CalendarSyncMethod.both) && (
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <IconWebhook className="h-4 w-4" aria-hidden="true" />
                        Webhook状態
                      </Label>
                      {settings.googleCalendarWebhookActive ? (
                        <p className="text-sm text-success flex items-center gap-1">
                          <IconCircleCheck
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          有効（有効期限:{" "}
                          {formatDateTimeShort(
                            settings.googleCalendarWebhookExpiration,
                          )}
                          ）
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <IconAlertCircle
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
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
                    <Label>最終同期</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTimeShort(settings.googleCalendarLastSyncedAt)}
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
                      aria-hidden="true"
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
            </>
          )}

          {/* 保存ボタン */}
          <div className="flex justify-end pt-2">
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
