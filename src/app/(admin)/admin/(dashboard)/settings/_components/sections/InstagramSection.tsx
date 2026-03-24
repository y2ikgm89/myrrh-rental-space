"use client";

/**
 * Instagram設定セクション
 *
 * Instagram連携の設定と管理:
 * - OAuth連携 / 手動トークン入力
 * - フィード表示設定
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { Aperture, Link2, Key, Unlink, ExternalLink } from "lucide-react";
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
  SelectionBox,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateInstagramSettings,
  saveManualToken,
  testInstagramConnectionAction,
  disconnectInstagram,
  type InstagramConfig,
} from "@/admin/actions/instagram";
import { instagramFeedFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { StatusBanner } from "../shared";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { InstagramFeedLayout } from "@/shared/db/enums";
import { isValidInstagramFeedLayout } from "@/shared/lib/validations/enums/guards";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface InstagramSectionProps {
  config: InstagramConfig;
}

const CONNECTION_METHODS = ["oauth", "manual"] as const;
type ConnectionMethod = (typeof CONNECTION_METHODS)[number];
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS);
function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value);
}

// =============================================================================
// Constants
// =============================================================================

const CONNECTION_METHOD_OPTIONS = [
  {
    value: "oauth" as const,
    label: "OAuth連携（推奨）",
    description: "Instagramアカウントで認証して自動的にトークンを取得します",
    icon: <Link2 />,
  },
  {
    value: "manual" as const,
    label: "手動トークン入力",
    description: "自分でアクセストークンを取得して入力します",
    icon: <Key />,
  },
];

const LAYOUT_OPTIONS = [
  {
    value: InstagramFeedLayout.grid,
    label: "グリッド",
    description: "写真を格子状に並べて表示",
  },
  {
    value: InstagramFeedLayout.masonry,
    label: "メイソンリー",
    description: "高さの異なるグリッドレイアウト",
  },
  {
    value: InstagramFeedLayout.slider,
    label: "スライダー",
    description: "横スクロールで表示",
  },
];

// =============================================================================
// Connection Card Component
// =============================================================================

interface ConnectionCardProps {
  config: InstagramConfig;
  isPending: boolean;
  onDisconnect: () => void;
}

function ConnectionCard({
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
    // OAuth認証ページへリダイレクト
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
            <Aperture className="h-5 w-5" />
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
                  <ExternalLink className="h-4 w-4" />
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
              <Unlink className="mr-1 h-4 w-4" />
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
          <Aperture className="h-5 w-5" />
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
              <Aperture className="mr-2 h-4 w-4" />
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
                  className={`text-sm ${testResult.success ? "text-success" : "text-destructive"}`}
                >
                  {testResult.message}
                </p>
              </StatusBanner>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={!manualToken || isPending || isTesting}
              >
                {isTesting ? "テスト中..." : "接続テスト"}
              </Button>
              <Button
                type="button"
                onClick={handleSaveManualToken}
                disabled={!manualToken || isPending || isSaving}
              >
                {isSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Feed Settings Card Component
// =============================================================================

interface FeedSettingsCardProps {
  config: InstagramConfig;
  parentIsPending: boolean;
}

function FeedSettingsCard({ config, parentIsPending }: FeedSettingsCardProps) {
  const { form, isPending, onSubmit } = useFormAction(
    instagramFeedFormSchema,
    (data) => updateInstagramSettings(data),
    {
      defaultValues: {
        feedEnabled: config.feedEnabled,
        feedLayout: config.feedLayout,
        feedColumns: config.feedColumns,
        feedMaxItems: config.feedMaxItems,
        showCaption: config.showCaption,
        showViewAll: config.showViewAll,
      },
      refresh: true,
      successMessage: "Instagram設定を保存しました",
    },
  );

  const feedEnabled = form.getValues("feedEnabled");
  const formIsPending = isPending || parentIsPending;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Aperture className="h-5 w-5" />
              フィード表示設定
            </CardTitle>
            <CardDescription>
              ホームページや固定ページでのInstagram投稿の表示設定
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* フィード有効化 */}
            <FormField
              control={form.control}
              name="feedEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>フィードを有効化</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      ホームページにInstagramフィードを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={formIsPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* レイアウト選択 */}
            <FormField
              control={form.control}
              name="feedLayout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>レイアウト</FormLabel>
                  <FormControl>
                    <SelectionBox
                      options={LAYOUT_OPTIONS}
                      value={field.value}
                      onChange={(value) => {
                        if (isValidInstagramFeedLayout(value)) {
                          field.onChange(value);
                        }
                      }}
                      columns={3}
                      disabled={formIsPending || !feedEnabled}
                      name="feed-layout"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 列数 */}
            <FormField
              control={form.control}
              name="feedColumns"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>列数</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.valueAsNumber || 3)
                      }
                      type="number"
                      min={2}
                      max={6}
                      disabled={formIsPending || !feedEnabled}
                      className="w-24"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    2〜6の範囲で指定
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 表示件数 */}
            <FormField
              control={form.control}
              name="feedMaxItems"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>表示件数</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.valueAsNumber || 6)
                      }
                      type="number"
                      min={1}
                      max={24}
                      disabled={formIsPending || !feedEnabled}
                      className="w-24"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    1〜24の範囲で指定
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* キャプション表示 */}
            <FormField
              control={form.control}
              name="showCaption"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>キャプションを表示</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      投稿のキャプションを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={formIsPending || !feedEnabled}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* もっと見るリンク */}
            <FormField
              control={form.control}
              name="showViewAll"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>「もっと見る」リンク</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Instagramプロフィールへのリンクを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={formIsPending || !feedEnabled}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* 保存ボタン */}
            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function InstagramSection({ config }: InstagramSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [isPending, startTransition] = useTransition();

  const handleDisconnect = async () => {
    const confirmed = await confirmDialog({
      title: "Instagram連携を解除しますか？",
      description:
        "Instagram連携を解除しますか？キャッシュされた投稿も削除されます。",
      confirmLabel: "解除",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await disconnectInstagram();
      if (!isMutationError(result)) {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 接続設定カード */}
      <ConnectionCard
        config={config}
        isPending={isPending}
        onDisconnect={handleDisconnect}
      />

      {/* フィード設定カード（連携済みの場合のみ表示） */}
      {config.isConnected && (
        <FeedSettingsCard config={config} parentIsPending={isPending} />
      )}
    </div>
  );
}
