"use client";

/**
 * Cloudflare Turnstile設定セクション
 *
 * Bot対策のためのTurnstile設定
 */

import { useState, useTransition } from "react";
import { useWatch } from "react-hook-form";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { cn } from "@/shared/lib/cn";
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
  SubmitButton,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateTurnstileSettings,
  testTurnstileConnectionAction,
  clearTurnstileKeys,
} from "@/admin/actions/api-keys";
import { turnstileFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import type { TurnstileConfig } from "@/admin/types/api-keys";
import { StatusBanner } from "../shared";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface TurnstileSectionProps {
  config: TurnstileConfig;
}

// =============================================================================
// Main Component
// =============================================================================

export function TurnstileSection({ config }: TurnstileSectionProps) {
  const confirm = useConfirm();
  const [isTesting, setIsTesting] = useState(false);
  const [isClearing, startClearTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    note?: string;
  } | null>(null);
  const [showSecretKeyInput, setShowSecretKeyInput] = useState(false);

  const { form, isPending, onSubmit } = useFormAction(
    turnstileFormSchema,
    async (data) => {
      const result = await updateTurnstileSettings({
        turnstileSiteKey: data.turnstileSiteKey || null,
        turnstileSecretKey: data.turnstileSecretKey || null,
      });
      if (!isMutationError(result)) {
        form.setValue("turnstileSecretKey", "");
        setShowSecretKeyInput(false);
      }
      return result;
    },
    {
      defaultValues: {
        turnstileSiteKey: config.siteKey || "",
        turnstileSecretKey: "",
      },
      refresh: true,
      successMessage: "Turnstile設定を保存しました",
    },
  );

  const [siteKey, secretKey] = useWatch({
    control: form.control,
    name: ["turnstileSiteKey", "turnstileSecretKey"],
  });

  const handleConnectionTest = async () => {
    if (!siteKey || !secretKey) {
      setTestResult({
        success: false,
        message: "Site KeyとSecret Keyの両方を入力してください",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testTurnstileConnectionAction(siteKey, secretKey);
      if (!isMutationError(result)) {
        setTestResult({
          success: true,
          message: "検証成功",
          ...(result.note !== undefined && { note: result.note }),
        });
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
      title: "キーをクリアしますか？",
      description: "Turnstileキーをクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startClearTransition(async () => {
      const result = await clearTurnstileKeys();
      if (!isMutationError(result)) {
        form.reset({ turnstileSiteKey: "", turnstileSecretKey: "" });
        setTestResult(null);
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-warning"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              Cloudflare Turnstile
            </CardTitle>
            <CardDescription>Bot対策・CAPTCHA設定</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Site Key */}
            <FormField
              control={form.control}
              name="turnstileSiteKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site Key</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="0x..."
                      disabled={isPending}
                      className="font-mono"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    公開キー（クライアント側で使用）
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Secret Key */}
            <FormField
              control={form.control}
              name="turnstileSecretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secret Key</FormLabel>
                  {config.secretKeyMasked && !showSecretKeyInput ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={config.secretKeyMasked}
                        disabled
                        className="font-mono"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSecretKeyInput(true)}
                      >
                        変更
                      </Button>
                    </div>
                  ) : (
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                        className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                        placeholder="0x..."
                        disabled={isPending}
                      />
                    </FormControl>
                  )}
                  <p className="text-xs text-muted-foreground">
                    シークレットキー（サーバー側で使用）
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 接続ステータス */}
            {config.connectionStatus && (
              <StatusBanner success={config.connectionStatus === "connected"}>
                <div className="flex items-center gap-2">
                  {config.connectionStatus === "connected" ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-success" />
                      <span className="text-sm font-medium text-success">
                        検証済み
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
                    最終検証: {formatDateTimeShort(config.lastTestedAt)}
                  </p>
                )}
              </StatusBanner>
            )}

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
                {testResult.note && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {testResult.note}
                  </p>
                )}
              </StatusBanner>
            )}

            {/* アクションボタン */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {(config.siteKey || config.secretKeyMasked) && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleClearKeys}
                  disabled={isPending || isClearing}
                >
                  クリア
                </Button>
              )}
              {siteKey && secretKey && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConnectionTest}
                  disabled={isPending || isTesting}
                >
                  {isTesting ? "テスト中..." : "形式検証"}
                </Button>
              )}
              <SubmitButton
                isPending={isPending}
                label="保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
