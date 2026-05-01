"use client";

/**
 * iCalフィード設定セクション
 *
 * 外部カレンダーアプリ（TimeTree等）で購読可能なiCalフィードの管理
 */

import { useState, useTransition, useEffect } from "react";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { toast } from "sonner";
import { openExternalTab } from "@/admin/lib/open-external-tab";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui/dialog";
import {
  createICalToken,
  deleteICalToken,
  updateICalFeedSettings,
} from "@/admin/actions/ical-tokens";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  IconCopy,
  IconTrash,
  IconPlus,
  IconExternalLink,
  IconCalendar,
} from "@tabler/icons-react";

// =============================================================================
// Types
// =============================================================================

interface ICalFeedSectionProps {
  onUpdate?: () => void;
}

interface SpaceOption {
  id: string;
  name: string;
}

type ICalFeedResponse = {
  tokens: Array<{
    id: string;
    token: string;
    name: string;
    spaceId: string | null;
    spaceName: string | null;
    createdBy: string;
    createdByName: string | null;
    createdAt: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
  }>;
  settings: {
    icalFeedEnabled: boolean;
    icalFeedIncludeCustomerInfo: boolean;
  };
  spaces: SpaceOption[];
};

async function fetchICalFeedData(): Promise<ICalFeedResponse> {
  const response = await fetch("/admin/api/ical-feed", {
    credentials: "same-origin",
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "iCalフィード設定の取得に失敗しました";
    throw new Error(message);
  }

  const data: ICalFeedResponse = await response.json();
  return data;
}

// =============================================================================
// Main Component
// =============================================================================

export function ICalFeedSection({ onUpdate }: ICalFeedSectionProps) {
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [tokens, setTokens] = useState<ICalFeedResponse["tokens"]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [settings, setSettings] = useState({
    icalFeedEnabled: false,
    icalFeedIncludeCustomerInfo: false,
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTokenData, setNewTokenData] = useState<{
    name: string;
    spaceId: string | null;
    expiresInDays: number | null;
  }>({
    name: "",
    spaceId: "",
    expiresInDays: null,
  });
  const [createdTokenUrl, setCreatedTokenUrl] = useState<string | null>(null);

  // 初回読み込み
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const data = await fetchICalFeedData();
        setTokens(data.tokens);
        setSettings(data.settings);
        setSpaces(data.spaces);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "iCalフィード設定の取得に失敗しました";
        toast.error(message);
      }
    };
    void loadInitialData();
  }, []);

  const refreshTokens = async () => {
    const data = await fetchICalFeedData();
    setTokens(data.tokens);
  };

  const handleSettingsChange = (key: keyof typeof settings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    startTransition(async () => {
      const result = await updateICalFeedSettings(newSettings);
      if (isMutationError(result)) {
        toast.error(result.error);
        setSettings(settings); // ロールバック
      } else {
        toast.success("設定を保存しました");
        onUpdate?.();
      }
    });
  };

  const handleCreateToken = () => {
    if (!newTokenData.name.trim()) {
      toast.error("トークン名を入力してください");
      return;
    }

    startTransition(async () => {
      const result = await createICalToken({
        name: newTokenData.name,
        spaceId: newTokenData.spaceId || null,
        expiresInDays: newTokenData.expiresInDays,
      });

      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("トークンを作成しました");
        const baseUrl =
          typeof window !== "undefined" ? window.location.origin : "";
        setCreatedTokenUrl(`${baseUrl}/api/ical/${result.token}`);
        await refreshTokens();
        setNewTokenData({ name: "", spaceId: null, expiresInDays: null });
        onUpdate?.();
      }
    });
  };

  const handleDeleteToken = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: "トークンを削除しますか？",
      description: `トークン「${name}」を削除しますか？このURLで購読しているカレンダーは更新されなくなります。`,
      confirmLabel: "削除",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteICalToken(id);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("トークンを削除しました");
        await refreshTokens();
        onUpdate?.();
      }
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("URLをコピーしました");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  const getTokenUrl = (token: string) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/api/ical/${token}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconCalendar className="h-5 w-5" />
          iCalフィード（外部カレンダー連携）
        </CardTitle>
        <CardDescription>
          TimeTree、Google
          Calendar等の外部カレンダーアプリから購読可能なiCalフィードを管理します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 有効化設定 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="icalFeedEnabled">iCalフィードを有効化</Label>
              <p className="text-sm text-muted-foreground">
                外部カレンダーアプリからの予約情報購読を許可
              </p>
            </div>
            <Switch
              id="icalFeedEnabled"
              checked={settings.icalFeedEnabled}
              onCheckedChange={(checked) =>
                handleSettingsChange("icalFeedEnabled", checked)
              }
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="icalFeedIncludeCustomerInfo">
                顧客情報を含む
              </Label>
              <p className="text-sm text-muted-foreground">
                予約者の氏名をカレンダーイベントに表示（無効時は「予約済み」と表示）
              </p>
            </div>
            <Switch
              id="icalFeedIncludeCustomerInfo"
              checked={settings.icalFeedIncludeCustomerInfo}
              onCheckedChange={(checked) =>
                handleSettingsChange("icalFeedIncludeCustomerInfo", checked)
              }
              disabled={isPending || !settings.icalFeedEnabled}
            />
          </div>
        </div>

        {/* トークン管理 */}
        {settings.icalFeedEnabled && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">公開トークン</h4>
              <Dialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCreatedTokenUrl(null);
                      setNewTokenData({
                        name: "",
                        spaceId: null,
                        expiresInDays: null,
                      });
                    }}
                  >
                    <IconPlus className="mr-2 h-4 w-4" />
                    新規トークン作成
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {createdTokenUrl
                        ? "トークン作成完了"
                        : "新規トークン作成"}
                    </DialogTitle>
                    <DialogDescription>
                      {createdTokenUrl
                        ? "このURLを外部カレンダーアプリに登録してください"
                        : "iCalフィード用のトークンを作成します"}
                    </DialogDescription>
                  </DialogHeader>

                  {createdTokenUrl ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-muted p-4">
                        <code className="break-all text-sm">
                          {createdTokenUrl}
                        </code>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => copyToClipboard(createdTokenUrl)}
                          className="flex-1"
                        >
                          <IconCopy className="mr-2 h-4 w-4" />
                          URLをコピー
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => openExternalTab(createdTokenUrl)}
                        >
                          <IconExternalLink className="mr-2 h-4 w-4" />
                          開く
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        TimeTreeの場合: 設定 → カレンダーを追加 → URLを購読
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="tokenName">トークン名</Label>
                        <Input
                          id="tokenName"
                          placeholder="例: TimeTree用"
                          value={newTokenData.name}
                          onChange={(e) =>
                            setNewTokenData((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tokenSpace">対象スペース</Label>
                        <Select
                          value={newTokenData.spaceId || "all"}
                          onValueChange={(value) =>
                            setNewTokenData((prev) => ({
                              ...prev,
                              spaceId: value === "all" ? null : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="すべてのスペース" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              すべてのスペース
                            </SelectItem>
                            {spaces.map((space) => (
                              <SelectItem key={space.id} value={space.id}>
                                {space.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tokenExpires">有効期限</Label>
                        <Select
                          value={String(newTokenData.expiresInDays ?? "never")}
                          onValueChange={(value) =>
                            setNewTokenData((prev) => ({
                              ...prev,
                              expiresInDays:
                                value === "never" ? null : Number(value),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="無期限" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="never">無期限</SelectItem>
                            <SelectItem value="30">30日</SelectItem>
                            <SelectItem value="90">90日</SelectItem>
                            <SelectItem value="365">1年</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    {createdTokenUrl ? (
                      <Button onClick={() => setIsCreateDialogOpen(false)}>
                        閉じる
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setIsCreateDialogOpen(false)}
                        >
                          キャンセル
                        </Button>
                        <SubmitButton
                          isPending={isPending}
                          label="作成"
                          pendingLabel="作成中..."
                          onClick={handleCreateToken}
                        />
                      </>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* トークン一覧 */}
            {tokens.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-muted-foreground">トークンがありません</p>
                <p className="text-sm text-muted-foreground">
                  「新規トークン作成」ボタンをクリックして開始してください
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{token.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {token.spaceName
                          ? `スペース: ${token.spaceName}`
                          : "全スペース"}
                        {token.expiresAt && (
                          <span className="ml-2">
                            ・有効期限:{" "}
                            {new Date(token.expiresAt).toLocaleDateString(
                              "ja-JP",
                            )}
                          </span>
                        )}
                        {token.lastUsedAt && (
                          <span className="ml-2">
                            ・最終アクセス:{" "}
                            {new Date(token.lastUsedAt).toLocaleDateString(
                              "ja-JP",
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(getTokenUrl(token.token))
                        }
                      >
                        <IconCopy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openExternalTab(getTokenUrl(token.token))
                        }
                      >
                        <IconExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteToken(token.id, token.name)}
                        disabled={isPending}
                      >
                        <IconTrash className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
