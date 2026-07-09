"use client";

/**
 * Resend設定セクション
 *
 * 接続テスト / クリア operation は form 経由でない separate Server Action のため
 * `useTransition` を維持（PR #62-#71 settings 系 canonical pattern）。
 */

import {
  useActionState,
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { cn } from "@/shared/lib/cn";
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
  updateResendSettings,
  testResendConnectionAction,
  clearResendKeys,
} from "@/admin/actions/api-keys";
import type { ResendConfig } from "@/admin/types/api-keys";
import { resendFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

interface ResendSectionProps {
  config: ResendConfig;
}

export function ResendSection({ config }: ResendSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [clearPending, startClearTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const [lastResult, action, isPending] = useActionState(
    updateResendSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "resend-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: resendFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      resendApiKey: "",
    },
  });

  const apiKeyControl = useInputControl(fields.resendApiKey);
  const apiKey = apiKeyControl.value ?? "";

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → showKeyInput リセット
  // (`Adjusting State During Render` 公式パターン、set-state-in-effect 違反回避)
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      setShowKeyInput(false);
    }
  }

  // useEffectEvent で useInputControl 参照を effect deps から除外
  const handleSaveSuccess = useEffectEvent(() => {
    toast.success("Resend設定を保存しました");
    apiKeyControl.change("");
    router.refresh();
  });

  useEffect(() => {
    if (isSuccess) {
      handleSaveSuccess();
    }
  }, [isSuccess]);

  const handleConnectionTest = () => {
    if (!apiKey) {
      setTestResult({ success: false, message: "APIキーを入力してください" });
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

    startClearTransition(async () => {
      const result = await clearResendKeys();
      if (!isMutationError(result)) {
        apiKeyControl.change("");
        setTestResult(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const isBusy = isPending || testPending || clearPending;
  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Resend
          </CardTitle>
          <CardDescription>メール配信サービスのAPI設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.resendApiKey.id}>APIキー</Label>
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
              <Input
                id={fields.resendApiKey.id}
                name={fields.resendApiKey.name}
                value={apiKey}
                onChange={(e) => apiKeyControl.change(e.target.value)}
                onBlur={apiKeyControl.blur}
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                placeholder="re_..."
                disabled={isBusy}
                aria-invalid={fields.resendApiKey.errors ? true : undefined}
                aria-describedby={
                  fields.resendApiKey.errors
                    ? fields.resendApiKey.errorId
                    : undefined
                }
              />
            )}
            <p className="text-xs text-muted-foreground">
              Resendダッシュボードの「API Keys」から取得できます
            </p>
            {fields.resendApiKey.errors && (
              <p
                id={fields.resendApiKey.errorId}
                className="text-sm text-destructive"
              >
                {fields.resendApiKey.errors.join(", ")}
              </p>
            )}
          </div>

          {/* 接続ステータス */}
          {config.connectionStatus && (
            <StatusBanner success={config.connectionStatus === "connected"}>
              <div className="flex items-center gap-2">
                {config.connectionStatus === "connected" ? (
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
                className={cn(
                  "text-sm",
                  testResult.success ? "text-success" : "text-destructive",
                )}
              >
                {testResult.message}
              </p>
            </StatusBanner>
          )}

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {config.apiKeyMasked && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleClearKeys}
                disabled={isBusy}
              >
                {clearPending ? "クリア中..." : "クリア"}
              </Button>
            )}
            {apiKey && (
              <Button
                type="button"
                variant="outline"
                onClick={handleConnectionTest}
                disabled={isBusy}
              >
                {testPending ? "テスト中..." : "接続テスト"}
              </Button>
            )}
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
              disabled={testPending || clearPending}
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
