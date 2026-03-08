"use client";

/**
 * 双方向同期設定セクション（Phase 4）
 *
 * Google Calendarからの変更を予約システムに反映する設定
 * - ポーリング（定期的なチェック）
 * - Webhook（プッシュ通知）
 */

import { useState, useTransition } from "react";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
} from "@/admin/components/ui";
import { Switch } from "@/admin/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import {
  updateTwoWaySyncSettings,
  setupCalendarWebhook,
  stopCalendarWebhook,
  triggerManualSync,
  type SettingsData,
} from "@/admin/actions/settings";
import {
  RefreshCw,
  Clock,
  Webhook,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { CalendarSyncMethod } from "@/shared/db/enums";
import { useRefreshOnSuccess } from "../hooks";
import { formatDateTimeShort } from "@/shared/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface TwoWaySyncSectionProps {
  settings: SettingsData;
}

// =============================================================================
// Main Component
// =============================================================================

export function TwoWaySyncSection({ settings }: TwoWaySyncSectionProps) {
  const confirm = useConfirm();
  const { handleResult, refresh } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    enabled: settings.googleCalendarTwoWaySyncEnabled,
    syncMethod: settings.googleCalendarSyncMethod,
    pollingIntervalMin: settings.googleCalendarPollingIntervalMin,
  });

  // Google Calendarが有効でない場合は表示しない
  if (
    !settings.googleCalendarEnabled ||
    settings.googleCalendarConnectionStatus !== "connected"
  ) {
    return null;
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateTwoWaySyncSettings(formData);
      handleResult({
        ...result,
        message: result.success ? "双方向同期設定を更新しました" : undefined,
      });
    });
  };

  const handleSetupWebhook = () => {
    startTransition(async () => {
      const result = await setupCalendarWebhook();
      handleResult(result);
    });
  };

  const handleStopWebhook = async () => {
    const confirmed = await confirm({
      title: "Webhookを停止しますか？",
      description: "Webhookを停止しますか？",
      confirmLabel: "停止",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await stopCalendarWebhook();
      handleResult(result);
    });
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await triggerManualSync();
      if (result.success) {
        setSyncResult({
          success: true,
          message: `同期完了: ${result.data.processed}件処理 (更新: ${result.data.updated}件, 削除: ${result.data.deleted}件)`,
        });
        toast.success("同期が完了しました");
        refresh();
      } else {
        setSyncResult({
          success: false,
          message: result.error || "同期に失敗しました",
        });
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
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
            <Label htmlFor="twoWaySyncEnabled">双方向同期を有効化</Label>
            <p className="text-sm text-muted-foreground">
              カレンダーの変更を予約システムに反映
            </p>
          </div>
          <Switch
            id="twoWaySyncEnabled"
            checked={formData.enabled}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, enabled: checked }))
            }
            disabled={isPending}
          />
        </div>

        {formData.enabled && (
          <>
            {/* 同期方式設定 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>同期方式</Label>
                <Select
                  value={formData.syncMethod}
                  onValueChange={(value: CalendarSyncMethod) =>
                    setFormData((prev) => ({ ...prev, syncMethod: value }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CalendarSyncMethod.polling}>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        ポーリングのみ
                      </div>
                    </SelectItem>
                    <SelectItem value={CalendarSyncMethod.webhook}>
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4" />
                        Webhookのみ
                      </div>
                    </SelectItem>
                    <SelectItem value={CalendarSyncMethod.both}>
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" />
                        両方使用（推奨）
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {formData.syncMethod === CalendarSyncMethod.polling &&
                    "ポーリング: 定期的にカレンダーをチェック（5分ごと推奨）"}
                  {formData.syncMethod === CalendarSyncMethod.webhook &&
                    "Webhook: カレンダー変更時に即座に通知を受信"}
                  {formData.syncMethod === CalendarSyncMethod.both &&
                    "Webhookで即時同期 + ポーリングでバックアップ"}
                </p>
              </div>

              {/* ポーリング間隔 */}
              {(formData.syncMethod === CalendarSyncMethod.polling ||
                formData.syncMethod === CalendarSyncMethod.both) && (
                <div className="space-y-2">
                  <Label>ポーリング間隔</Label>
                  <Select
                    value={String(formData.pollingIntervalMin)}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        pollingIntervalMin: Number(value),
                      }))
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1分</SelectItem>
                      <SelectItem value="5">5分（推奨）</SelectItem>
                      <SelectItem value="10">10分</SelectItem>
                      <SelectItem value="15">15分</SelectItem>
                      <SelectItem value="30">30分</SelectItem>
                      <SelectItem value="60">60分</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Webhook設定 */}
            {(formData.syncMethod === CalendarSyncMethod.webhook ||
              formData.syncMethod === CalendarSyncMethod.both) && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Webhook className="h-4 w-4" />
                      Webhook状態
                    </Label>
                    {settings.googleCalendarWebhookActive ? (
                      <p className="text-sm text-success flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        有効（有効期限:{" "}
                        {formatDateTimeShort(
                          settings.googleCalendarWebhookExpiration,
                        )}
                        ）
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        未設定
                      </p>
                    )}
                  </div>
                  {settings.googleCalendarWebhookActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStopWebhook}
                      disabled={isPending}
                    >
                      停止
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleSetupWebhook}
                      disabled={isPending}
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
                  variant="outline"
                  size="sm"
                  onClick={handleManualSync}
                  disabled={isSyncing || isPending}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
                  />
                  {isSyncing ? "同期中..." : "手動同期"}
                </Button>
              </div>
              {syncResult && (
                <div
                  className={`rounded p-2 text-sm ${
                    syncResult.success
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {syncResult.message}
                </div>
              )}
            </div>

            {/* 保存ボタン */}
            <Button onClick={handleSave} disabled={isPending}>
              設定を保存
            </Button>
          </>
        )}

        {!formData.enabled && (
          <Button onClick={handleSave} disabled={isPending}>
            設定を保存
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
