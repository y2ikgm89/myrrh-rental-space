"use client";

/**
 * Resend設定セクション
 *
 * Resend APIキーの設定と接続テスト
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
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
  updateResendSettings,
  testResendConnectionAction,
  clearResendKeys,
} from "@/admin/actions/api-keys";
import type { ResendConfig } from "@/admin/types/api-keys";
import { resendFormSchema } from "@/admin/actions/settings/schemas";
import { StatusBanner } from "../shared";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface ResendSectionProps {
  config: ResendConfig;
}

// =============================================================================
// Main Component
// =============================================================================

export function ResendSection({ config }: ResendSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const { form, isPending, onSubmit } = useFormAction(
    resendFormSchema,
    (data) =>
      updateResendSettings({
        resendApiKey: data.resendApiKey || null,
      }),
    {
      defaultValues: {
        resendApiKey: "",
      },
      refresh: true,
      successMessage: "Resend設定を保存しました",
      onSuccess: () => {
        form.setValue("resendApiKey", "");
        setShowKeyInput(false);
      },
    },
  );

  const handleConnectionTest = () => {
    const apiKey = form.getValues("resendApiKey");
    if (!apiKey) {
      setTestResult({
        success: false,
        message: "APIキーを入力してください",
      });
      return;
    }

    startTestTransition(async () => {
      setTestResult(null);
      try {
        const result = await testResendConnectionAction(apiKey);
        if (!isMutationError(result)) {
          setTestResult({ success: true, message: "接続成功" });
          router.refresh();
        } else {
          setTestResult({ success: false, message: result.error });
        }
      } catch {
        setTestResult({
          success: false,
          message: "接続テストでエラーが発生しました",
        });
      }
    });
  };

  const handleClearKeys = async () => {
    const confirmed = await confirmDialog({
      title: "APIキーをクリアしますか？",
      description: "Resend APIキーをクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTestTransition(async () => {
      const result = await clearResendKeys();
      if (!isMutationError(result)) {
        form.setValue("resendApiKey", "");
        setTestResult(null);
        router.refresh();
      }
    });
  };

  const resendApiKey = form.getValues("resendApiKey");

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Resend
            </CardTitle>
            <CardDescription>メール配信サービスのAPI設定</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* API Key */}
            <FormField
              control={form.control}
              name="resendApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>APIキー</FormLabel>
                  {config.apiKeyMasked && !showKeyInput ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={config.apiKeyMasked}
                        disabled
                        className="font-mono"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowKeyInput(true)}
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
                        placeholder="re_..."
                        disabled={isPending}
                      />
                    </FormControl>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Resendダッシュボードの「API Keys」から取得できます
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {config.apiKeyMasked && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleClearKeys}
                  disabled={isPending || testPending}
                >
                  クリア
                </Button>
              )}
              {resendApiKey && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConnectionTest}
                  disabled={isPending || testPending}
                >
                  {testPending ? "テスト中..." : "接続テスト"}
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
