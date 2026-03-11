"use client";

/**
 * Google Maps設定セクション
 *
 * Google Maps APIキーの設定と接続テスト
 */

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
  SubmitButton,
} from "@/admin/components/ui";
import {
  updateGoogleMapsSettings,
  testGoogleMapsConnectionAction,
  clearGoogleMapsKeys,
} from "@/admin/actions/api-keys";
import type { GoogleMapsConfig } from "@/admin/types/api-keys";
import { StatusBanner } from "../shared";
import { useRefreshOnSuccess } from "../hooks";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface GoogleMapsSectionProps {
  config: GoogleMapsConfig;
}

// =============================================================================
// Main Component
// =============================================================================

export function GoogleMapsSection({ config }: GoogleMapsSectionProps) {
  const confirm = useConfirm();
  const { handleResult, refresh } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    googleMapsApiKey: "",
  });

  const [showKeyInput, setShowKeyInput] = useState(false);

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateGoogleMapsSettings({
        googleMapsApiKey: formData.googleMapsApiKey || null,
      });
      if (!isMutationError(result)) {
        setFormData({ googleMapsApiKey: "" });
        setShowKeyInput(false);
      }
      handleResult(result, "Google Maps設定を保存しました");
    });
  };

  const handleConnectionTest = async () => {
    if (!formData.googleMapsApiKey) {
      setTestResult({
        success: false,
        message: "APIキーを入力してください",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testGoogleMapsConnectionAction(
        formData.googleMapsApiKey,
      );
      if (!isMutationError(result)) {
        setTestResult({
          success: true,
          message: "接続成功",
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
      title: "APIキーをクリアしますか？",
      description: "Google Maps APIキーをクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await clearGoogleMapsKeys();
      if (!isMutationError(result)) {
        setFormData({ googleMapsApiKey: "" });
        setTestResult(null);
      }
      handleResult(result, "Google Maps設定をクリアしました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-success"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          Google Maps
        </CardTitle>
        <CardDescription>地図表示のためのAPI設定</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="googleMapsApiKey">APIキー</Label>
          {config.apiKeyMasked && !showKeyInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={config.apiKeyMasked}
                disabled
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKeyInput(true)}
              >
                変更
              </Button>
            </div>
          ) : (
            <Input
              id="googleMapsApiKey"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
              value={formData.googleMapsApiKey}
              onChange={(e) =>
                setFormData({ googleMapsApiKey: e.target.value })
              }
              placeholder="AIza..."
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Google Cloud ConsoleのAPIとサービスから取得できます
          </p>
        </div>

        {/* 接続ステータス */}
        {config.connectionStatus && (
          <StatusBanner success={config.connectionStatus === "connected"}>
            <div className="flex items-center gap-2">
              {config.connectionStatus === "connected" ? (
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
            {config.lastTestedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                最終テスト: {formatDateTimeShort(config.lastTestedAt)}
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
          </StatusBanner>
        )}

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2">
          <SubmitButton
            isPending={isPending}
            onClick={handleSave}
            label="保存"
          />
          {formData.googleMapsApiKey && (
            <Button
              variant="outline"
              onClick={handleConnectionTest}
              disabled={isPending || isTesting}
            >
              {isTesting ? "テスト中..." : "接続テスト"}
            </Button>
          )}
          {config.apiKeyMasked && (
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
