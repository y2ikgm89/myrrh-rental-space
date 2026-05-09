"use client";

/**
 * 拠点ごとの Google Business Profile 同期管理カード。
 *
 * - 同期 ON/OFF Switch（楽観的更新 + ロールバック）
 * - 「今すぐ同期」ボタン（手動トリガー）
 * - 最終同期時刻 / エラーバッジ
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
} from "@/admin/components/ui";
import {
  toggleLocationGbpSync,
  triggerGbpSync,
} from "@/admin/actions/settings";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

type LocationGbpSyncCardProps = {
  locationId: string;
  googleBusinessPlaceId: string | null;
  gbpSyncEnabled: boolean;
  gbpSyncedAt: string | null;
  gbpSyncError: string | null;
  gbpEnabledGlobally: boolean;
};

// =============================================================================
// Main Component
// =============================================================================

export function LocationGbpSyncCard({
  locationId,
  googleBusinessPlaceId,
  gbpSyncEnabled,
  gbpSyncedAt,
  gbpSyncError,
  gbpEnabledGlobally,
}: LocationGbpSyncCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 楽観的更新 + ロールバック用 local state
  const [optimisticEnabled, setOptimisticEnabled] = useState(gbpSyncEnabled);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const placeIdMissing = !googleBusinessPlaceId;
  const globallyDisabled = !gbpEnabledGlobally;
  const disabled = isPending || globallyDisabled || placeIdMissing;

  const handleToggle = (next: boolean) => {
    if (disabled) return;
    setOptimisticEnabled(next);
    startTransition(async () => {
      const result = await toggleLocationGbpSync(locationId, next);
      if (isMutationError(result)) {
        // ロールバック
        setOptimisticEnabled(!next);
        toast.error(result.error);
        return;
      }
      toast.success(
        next ? "GBP 同期を有効化しました" : "GBP 同期を無効化しました",
      );
      router.refresh();
    });
  };

  const handleManualSync = () => {
    if (disabled || !optimisticEnabled) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await triggerGbpSync(locationId);
      if (isMutationError(result)) {
        setFeedback({ type: "error", message: result.error });
        toast.error(result.error);
        return;
      }
      setFeedback({
        type: "success",
        message: "Google Business Profile への同期を実行しました",
      });
      toast.success("同期を実行しました");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Business Profile 同期</CardTitle>
        <CardDescription>
          この拠点の情報を Google Business Profile に同期します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* グローバル無効化警告 */}
        {globallyDisabled ? (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            Google Business Profile 連携はサイト全体で無効化されています。
            「外部連携」設定から OAuth 連携を行ってください。
          </p>
        ) : null}

        {/* Place ID 未設定警告 */}
        {placeIdMissing ? (
          <p className="rounded-md bg-warning/10 p-3 text-sm text-warning-foreground">
            Google Business Place ID が未設定です。MEO タブで設定してから
            同期を有効化してください。
          </p>
        ) : null}

        {/* 同期 ON/OFF Switch — 44px ヒットエリア確保 */}
        <label
          className="flex min-h-11 items-center justify-between gap-4 rounded-lg border p-4"
          htmlFor={`gbp-sync-${locationId}`}
        >
          <div className="space-y-0.5">
            <span className="block text-sm font-medium">この拠点の同期</span>
            <span className="block text-sm text-muted-foreground">
              有効化すると、拠点情報を更新するたびに自動同期されます
            </span>
          </div>
          <Switch
            id={`gbp-sync-${locationId}`}
            checked={optimisticEnabled}
            onCheckedChange={handleToggle}
            disabled={disabled}
            aria-label={`${optimisticEnabled ? "有効" : "無効"}: 拠点の Google Business Profile 同期`}
          />
        </label>

        {/* 最終同期時刻 / エラー表示 */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">最終同期:</span>
            <span className="text-sm text-muted-foreground">
              {gbpSyncedAt ? formatDateTimeShort(gbpSyncedAt) : "未同期"}
            </span>
            {gbpSyncError ? <Badge variant="destructive">エラー</Badge> : null}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleManualSync}
            disabled={disabled || !optimisticEnabled}
            className="min-h-11"
          >
            {isPending ? "同期中..." : "今すぐ同期"}
          </Button>
        </div>

        {/* エラーメッセージ */}
        {gbpSyncError ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            前回の同期エラー: {gbpSyncError}
          </p>
        ) : null}

        {/* 手動同期フィードバック */}
        {feedback ? (
          <div
            role="status"
            aria-live="polite"
            className={
              feedback.type === "success"
                ? "rounded-md bg-success/10 p-3 text-sm text-success"
                : "rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            }
          >
            {feedback.message}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
