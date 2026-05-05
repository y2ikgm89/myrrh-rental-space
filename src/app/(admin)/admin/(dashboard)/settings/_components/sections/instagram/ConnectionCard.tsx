"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAperture,
  IconLink,
  IconKey,
  IconUnlink,
  IconExternalLink,
} from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  SelectionBox,
  SubmitButton,
} from "@/admin/components/ui";
import {
  saveManualToken,
  testInstagramConnectionAction,
} from "@/admin/actions/instagram";
import type { InstagramConfig } from "@/shared/domain/instagram/types";
import { StatusBanner } from "../../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types & Constants
// =============================================================================

const CONNECTION_METHODS = ["oauth", "manual"] as const;
type ConnectionMethod = (typeof CONNECTION_METHODS)[number];
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS);
function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value);
}

export const CONNECTION_METHOD_OPTIONS = [
  {
    value: "oauth" as const,
    label: "OAuth連携（推奨）",
    description: "Instagramアカウントで認証して自動的にトークンを取得します",
    icon: <IconLink />,
  },
  {
    value: "manual" as const,
    label: "手動トークン入力",
    description: "自分でアクセストークンを取得して入力します",
    icon: <IconKey />,
  },
];

// =============================================================================
// Component
// =============================================================================

interface ConnectionCardProps {
  config: InstagramConfig;
  isPending: boolean;
  onDisconnect: () => void;
}

export function ConnectionCard({
  config,
  isPending,
  onDisconnect,
}: ConnectionCardProps) {
  const router = useRouter();
  const [connectionMethod, setConnectionMethod] =
    useState<ConnectionMethod>("oauth");
  const [manualToken, setManualToken] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleOAuthConnect = () => {
    window.location.href = "/api/instagram/oauth/authorize";
  };

  const handleTestConnection = async () => {
    if (!manualToken) {
      setTestResult({
        success: false,
        message: "アクセストークンを入力してください",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testInstagramConnectionAction(manualToken);
      if (!isMutationError(result)) {
        setTestResult({
          success: true,
          message: result.username
            ? `接続成功 - @${result.username}`
            : "接続成功",
        });
      } else {
        setTestResult({ success: false, message: result.error });
      }
    } catch {
      setTestResult({
        success: false,
        message: "接続テストでエラーが発生しました",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveManualToken = async () => {
    if (!manualToken) return;

    setIsSaving(true);
    try {
      const result = await saveManualToken(manualToken);
      if (!isMutationError(result)) {
        setManualToken("");
        setTestResult(null);
        router.refresh();
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 連携済みの場合
  if (config.isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconAperture className="h-5 w-5" />
            Instagram連携
          </CardTitle>
          <CardDescription>アカウント接続状況</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusBanner success>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="text-sm font-medium text-success">連携済み</span>
            </div>
            <p className="mt-1 text-sm text-success">
              @{config.username || "unknown"}
              {config.accountType && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({config.accountType})
                </span>
              )}
            </p>
            {config.tokenExpiresAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                トークン有効期限: {formatDateTimeShort(config.tokenExpiresAt)}
                {config.tokenExpiryDays !== null && (
                  <span className="ml-1">
                    （残り{config.tokenExpiryDays}日）
                  </span>
                )}
              </p>
            )}
            {config.shouldRefreshToken && (
              <p className="mt-2 text-xs text-warning">
                トークンの有効期限が近づいています。再認証することで更新できます。
              </p>
            )}
          </StatusBanner>

          <div className="flex flex-wrap gap-2">
            {config.username && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://www.instagram.com/${config.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  <IconExternalLink className="h-4 w-4" />
                  プロフィールを表示
                </a>
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={onDisconnect}
              disabled={isPending}
            >
              <IconUnlink className="mr-1 h-4 w-4" />
              連携解除
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 未連携の場合
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconAperture className="h-5 w-5" />
          Instagram連携
        </CardTitle>
        <CardDescription>
          Instagramアカウントと連携して投稿を表示できます
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 連携方法選択 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">連携方法を選択</label>
          <SelectionBox
            options={CONNECTION_METHOD_OPTIONS}
            value={connectionMethod}
            onChange={(value) => {
              if (isConnectionMethod(value)) setConnectionMethod(value);
            }}
            columns={2}
            name="connection-method"
          />
        </div>

        {/* OAuth連携 */}
        {connectionMethod === "oauth" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
              <p className="text-sm text-primary">
                「Instagramと連携」ボタンをクリックすると、Instagramのログインページに移動します。
                認証後、自動的にこのページに戻ります。
              </p>
            </div>
            <Button
              type="button"
              onClick={handleOAuthConnect}
              className="w-full"
            >
              <IconAperture className="mr-2 h-4 w-4" />
              Instagramと連携
            </Button>
          </div>
        )}

        {/* 手動トークン入力 */}
        {connectionMethod === "manual" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="manualToken" className="text-sm font-medium">
                アクセストークン
              </label>
              <Input
                id="manualToken"
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="IGQ..."
                disabled={isPending || isTesting}
              />
              <p className="text-xs text-muted-foreground">
                Meta for
                Developersで取得した長期アクセストークンを入力してください
              </p>
            </div>

            {/* テスト結果 */}
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
              </StatusBanner>
            )}

            <div className="flex flex-wrap gap-2">
              <SubmitButton
                isPending={isTesting}
                label="接続テスト"
                pendingLabel="テスト中..."
                variant="outline"
                onClick={handleTestConnection}
                disabled={!manualToken || isPending}
              />
              <SubmitButton
                isPending={isSaving}
                label="保存"
                onClick={handleSaveManualToken}
                disabled={!manualToken || isPending}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
