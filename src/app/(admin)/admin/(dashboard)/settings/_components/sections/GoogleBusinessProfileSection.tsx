"use client";

/**
 * Google Business Profile 連携セクション
 *
 * OAuth 連携状態の表示と接続 / 解除 + 同期トグルの管理。
 */

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SubmitButton,
} from "@/admin/components/ui";
import { initiateGbpAuth, revokeGbpAuth } from "@/admin/actions/settings";
import { isMutationError } from "@/shared/lib/mutation-result";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { ConnectionStatus } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Types
// =============================================================================

type GbpAuthInfo = {
  readonly accountName: string;
};

type GoogleBusinessProfileSectionProps = {
  oauthConfigured: boolean;
  authInfo: GbpAuthInfo | null;
  connectionStatus: ConnectionStatus | null;
  lastTestedAt: string | null;
};

const GBP_SECTION_TITLE_ID = "google-business-profile-section-title";

// =============================================================================
// Main Component
// =============================================================================

export function GoogleBusinessProfileSection({
  oauthConfigured,
  authInfo,
  connectionStatus,
  lastTestedAt,
}: GoogleBusinessProfileSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmDialog = useConfirm();
  const [isPending, startTransition] = useTransition();

  const isConnected = authInfo !== null;

  // OAuth callback redirect 後の query param を toast で通知して URL を clean up
  // toast はサーバ外副作用のため useEffect 内で OK（setState ではない）
  const successFlag = searchParams.get("gbp_success");
  const errorFlag = searchParams.get("gbp_error");

  useEffect(() => {
    if (!successFlag && !errorFlag) return;
    if (successFlag) {
      toast.success("Google Business Profile と連携しました");
    } else if (errorFlag) {
      toast.error(`連携に失敗しました: ${errorFlag}`);
    }
    // URL から query を取り除く
    const params = new URLSearchParams(searchParams.toString());
    params.delete("gbp_success");
    params.delete("gbp_error");
    const next = params.toString();
    router.replace(`/admin/settings/integrations${next ? `?${next}` : ""}`);
  }, [successFlag, errorFlag, router, searchParams]);

  const handleRevoke = async () => {
    const confirmed = await confirmDialog({
      title: "連携を解除しますか？",
      description:
        "Google Business Profile との連携を解除すると、以降の自動同期が停止します。",
      confirmLabel: "解除",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await revokeGbpAuth();
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("連携を解除しました");
      router.refresh();
    });
  };

  return (
    <Card role="region" aria-labelledby={GBP_SECTION_TITLE_ID}>
      <CardHeader>
        <CardTitle
          id={GBP_SECTION_TITLE_ID}
          className="flex items-center gap-2"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Google Business Profile 連携
        </CardTitle>
        <CardDescription>
          接続後、各 Location の MEO タブで「GBP 同期」を有効化することで Google
          Business Profile に自動同期されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connectionStatus ? (
          <StatusBanner
            success={connectionStatus === ConnectionStatus.CONNECTED}
          >
            <div className="flex items-center gap-2">
              {connectionStatus === ConnectionStatus.CONNECTED ? (
                <>
                  <span
                    className="h-2 w-2 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-success">
                    接続済み
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="h-2 w-2 rounded-full bg-destructive"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-destructive">
                    エラー
                  </span>
                </>
              )}
            </div>
            {isConnected && authInfo ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {authInfo.accountName}
              </p>
            ) : null}
            {lastTestedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                最終テスト: {formatDateTimeShort(lastTestedAt)}
              </p>
            ) : null}
          </StatusBanner>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
            <span className="text-sm font-medium">連携状態:</span>
            {isConnected ? (
              <Badge variant="success">連携済み</Badge>
            ) : (
              <Badge variant="secondary">未連携</Badge>
            )}
            {isConnected && authInfo ? (
              <span className="text-sm text-muted-foreground">
                {authInfo.accountName}
              </span>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-4">
          {/* 接続 / 解除ボタン */}
          {isConnected ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRevoke()}
              disabled={isPending}
              className="min-h-11"
            >
              {isPending ? "解除中..." : "連携を解除"}
            </Button>
          ) : (
            <form action={initiateGbpAuth}>
              <SubmitButton
                isPending={isPending}
                label="Google で連携"
                pendingLabel="連携中..."
                variant="outline"
                className="min-h-11"
              />
            </form>
          )}
        </div>

        {!oauthConfigured ? (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            Google で連携するには `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET`
            の環境変数が必要です。
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
