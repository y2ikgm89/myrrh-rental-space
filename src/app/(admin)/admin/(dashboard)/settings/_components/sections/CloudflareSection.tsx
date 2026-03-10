"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/admin/contexts/confirm-context";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/admin/components/ui";
import {
  updateCloudflareSettings,
  testCloudflareConnectionAction,
  clearCloudflareKeys,
} from "@/admin/actions/api-keys";
import type { CloudflareConfig } from "@/admin/types/api-keys";
import { StatusBanner } from "../shared";
import { useRefreshOnSuccess } from "../hooks";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { isMutationError } from "@/shared/lib/mutation-result";
import { CloudIcon } from "lucide-react";

interface Props {
  config: CloudflareConfig;
}

export function CloudflareSection({ config }: Props) {
  const confirm = useConfirm();
  const { handleResult, refresh } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    cloudflareZoneId: "",
    cloudflareApiToken: "",
  });

  const [showTokenInput, setShowTokenInput] = useState(false);

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateCloudflareSettings({
        cloudflareZoneId: formData.cloudflareZoneId || null,
        cloudflareApiToken: formData.cloudflareApiToken || null,
      });
      if (!isMutationError(result)) {
        setFormData({ cloudflareZoneId: "", cloudflareApiToken: "" });
        setShowTokenInput(false);
      }
      handleResult(result, "Cloudflare設定を保存しました");
    });
  };

  const handleConnectionTest = async () => {
    const zoneId = formData.cloudflareZoneId || config.zoneId;
    const apiToken = formData.cloudflareApiToken;

    if (!zoneId || !apiToken) {
      setTestResult({
        success: false,
        message: "Zone IDとAPI Tokenの両方を入力してください",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testCloudflareConnectionAction(zoneId, apiToken);
      if (!isMutationError(result)) {
        const zoneName = result.zoneName;
        setTestResult({
          success: true,
          message: zoneName ? `接続成功 (Zone: ${zoneName})` : "接続成功",
        });
        refresh();
      } else {
        setTestResult({
          success: false,
          message: result.error,
        });
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

  const handleClearKeys = async () => {
    const confirmed = await confirm({
      title: "設定をクリアしますか？",
      description: "Cloudflare設定をクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await clearCloudflareKeys();
      if (!isMutationError(result)) {
        setFormData({ cloudflareZoneId: "", cloudflareApiToken: "" });
        setTestResult(null);
      }
      handleResult(result, "Cloudflare設定をクリアしました");
    });
  };

  const hasExistingConfig = config.zoneId || config.apiTokenMasked;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudIcon className="h-5 w-5 text-warning" />
          Cloudflare CDN
        </CardTitle>
        <CardDescription>
          CDNキャッシュの自動パージ設定（コンテンツ更新時に自動でキャッシュクリア）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cloudflareZoneId">Zone ID</Label>
          {config.zoneId && !showTokenInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={config.zoneId}
                disabled
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTokenInput(true)}
              >
                変更
              </Button>
            </div>
          ) : (
            <Input
              id="cloudflareZoneId"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono"
              value={formData.cloudflareZoneId}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  cloudflareZoneId: e.target.value,
                }))
              }
              placeholder="32文字の16進数"
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Cloudflare Dashboard → Overview → API セクションから取得できます
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cloudflareApiToken">API Token</Label>
          {config.apiTokenMasked && !showTokenInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={config.apiTokenMasked}
                disabled
                className="font-mono"
              />
            </div>
          ) : (
            // Note: CSS -webkit-text-security による視覚的マスクのみ
            // DevToolsでは平文参照可能（設定済みの場合はサーバー側でマスク表示）
            <Input
              id="cloudflareApiToken"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
              value={formData.cloudflareApiToken}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  cloudflareApiToken: e.target.value,
                }))
              }
              placeholder="API Token"
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            My Profile → API Tokens → Create Token で作成。
            <br />
            必要な権限: Zone &gt; Cache Purge &gt; Purge
          </p>
        </div>

        {config.connectionStatus && (
          <StatusBanner success={config.connectionStatus === "connected"}>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  config.connectionStatus === "connected"
                    ? "bg-success"
                    : "bg-destructive"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  config.connectionStatus === "connected"
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {config.connectionStatus === "connected"
                  ? "接続済み"
                  : "エラー"}
              </span>
            </div>
            {config.lastTestedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                最終テスト: {formatDateTimeShort(config.lastTestedAt)}
              </p>
            )}
          </StatusBanner>
        )}

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
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "保存中..." : "保存"}
          </Button>
          {formData.cloudflareApiToken && (
            <Button
              variant="outline"
              onClick={handleConnectionTest}
              disabled={isPending || isTesting}
            >
              {isTesting ? "テスト中..." : "接続テスト"}
            </Button>
          )}
          {hasExistingConfig && (
            <Button
              variant="destructive"
              onClick={handleClearKeys}
              disabled={isPending}
            >
              クリア
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
