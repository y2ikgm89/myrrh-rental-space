"use client";

/**
 * Google Maps設定セクション — Phase 1 Task 6 conform 移行
 *
 * `useFormAction` (RHF + shadcn Form/FormField) → `useActionState` + `useForm`
 * (@conform-to/react) clean break 移行。Google Maps APIキーの設定と接続テスト。
 * PR #75 ResendSection canonical pattern を踏襲。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
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
  updateGoogleMapsSettings,
  testGoogleMapsConnectionAction,
  clearGoogleMapsKeys,
} from "@/admin/actions/api-keys";
import { googleMapsFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import type { GoogleMapsConfig } from "@/admin/types/api-keys";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

interface GoogleMapsSectionProps {
  config: GoogleMapsConfig;
}

export function GoogleMapsSection({ config }: GoogleMapsSectionProps) {
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
    updateGoogleMapsSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "google-maps-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: googleMapsFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      googleMapsApiKey: "",
    },
  });

  const apiKeyControl = useInputControl(fields.googleMapsApiKey);
  const apiKey = apiKeyControl.value ?? "";

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → showKeyInput リセット
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      setShowKeyInput(false);
    }
  }

  useEffect(() => {
    if (isSuccess) {
      toast.success("Google Maps設定を保存しました");
      apiKeyControl.change("");
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, router]);

  const handleConnectionTest = () => {
    if (!apiKey) {
      setTestResult({ success: false, message: "APIキーを入力してください" });
      return;
    }
    startTestTransition(async () => {
      setTestResult(null);
      try {
        const result = await testGoogleMapsConnectionAction(apiKey);
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
      description: "Google Maps APIキーをクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startClearTransition(async () => {
      const result = await clearGoogleMapsKeys();
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
              className="h-5 w-5 text-success"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            Google Maps
          </CardTitle>
          <CardDescription>地図表示のためのAPI設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.googleMapsApiKey.id}>APIキー</Label>
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
                id={fields.googleMapsApiKey.id}
                name={fields.googleMapsApiKey.name}
                value={apiKey}
                onChange={(e) => apiKeyControl.change(e.target.value)}
                onBlur={apiKeyControl.blur}
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                placeholder="AIza..."
                disabled={isBusy}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Google Cloud ConsoleのAPIとサービスから取得できます
            </p>
            {fields.googleMapsApiKey.errors && (
              <p
                id={fields.googleMapsApiKey.errorId}
                className="text-sm text-destructive"
              >
                {fields.googleMapsApiKey.errors.join(", ")}
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
