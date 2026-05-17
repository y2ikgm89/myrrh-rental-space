"use client";

/**
 * Cloudflare Turnstile設定セクション — Phase 1 Task 6 conform 移行
 *
 * `useFormAction` (RHF + shadcn Form/FormField) → `useActionState` + `useForm`
 * (@conform-to/react) clean break 移行。Bot対策のためのTurnstile設定。
 * PR #75-#77 ResendSection / GoogleMapsSection / CloudflareSection canonical
 * pattern を踏襲、Site Key + Secret Key の 2 入力。
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
  updateTurnstileSettings,
  testTurnstileConnectionAction,
  clearTurnstileKeys,
} from "@/admin/actions/api-keys";
import { turnstileFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import type { TurnstileConfig } from "@/admin/types/api-keys";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

interface TurnstileSectionProps {
  config: TurnstileConfig;
}

export function TurnstileSection({ config }: TurnstileSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [clearPending, startClearTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    note?: string;
  } | null>(null);
  const [showSecretKeyInput, setShowSecretKeyInput] = useState(false);

  const [lastResult, action, isPending] = useActionState(
    updateTurnstileSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "turnstile-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: turnstileFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      turnstileSiteKey: config.siteKey ?? "",
      turnstileSecretKey: "",
    },
  });

  const siteKeyControl = useInputControl(fields.turnstileSiteKey);
  const secretKeyControl = useInputControl(fields.turnstileSecretKey);
  const siteKey = siteKeyControl.value ?? "";
  const secretKey = secretKeyControl.value ?? "";

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → showSecretKeyInput リセット
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      setShowSecretKeyInput(false);
    }
  }

  // useEffectEvent で useInputControl 参照を effect deps から除外
  const handleSaveSuccess = useEffectEvent(() => {
    toast.success("Turnstile設定を保存しました");
    secretKeyControl.change("");
    router.refresh();
  });

  useEffect(() => {
    if (isSuccess) {
      handleSaveSuccess();
    }
  }, [isSuccess]);

  const handleConnectionTest = () => {
    if (!siteKey || !secretKey) {
      setTestResult({
        success: false,
        message: "Site KeyとSecret Keyの両方を入力してください",
      });
      return;
    }
    startTestTransition(async () => {
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
      title: "キーをクリアしますか？",
      description: "Turnstileキーをクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startClearTransition(async () => {
      const result = await clearTurnstileKeys();
      if (!isMutationError(result)) {
        siteKeyControl.change("");
        secretKeyControl.change("");
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
              className="h-5 w-5 text-warning"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            Cloudflare Turnstile
          </CardTitle>
          <CardDescription>Bot対策・CAPTCHA設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.turnstileSiteKey.id}>Site Key</Label>
            <Input
              id={fields.turnstileSiteKey.id}
              name={fields.turnstileSiteKey.name}
              value={siteKey}
              onChange={(e) => siteKeyControl.change(e.target.value)}
              onBlur={siteKeyControl.blur}
              type="text"
              placeholder="0x..."
              disabled={isBusy}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              公開キー（クライアント側で使用）
            </p>
            {fields.turnstileSiteKey.errors && (
              <p
                id={fields.turnstileSiteKey.errorId}
                className="text-sm text-destructive"
              >
                {fields.turnstileSiteKey.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.turnstileSecretKey.id}>Secret Key</Label>
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
              <Input
                id={fields.turnstileSecretKey.id}
                name={fields.turnstileSecretKey.name}
                value={secretKey}
                onChange={(e) => secretKeyControl.change(e.target.value)}
                onBlur={secretKeyControl.blur}
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                placeholder="0x..."
                disabled={isBusy}
              />
            )}
            <p className="text-xs text-muted-foreground">
              シークレットキー（サーバー側で使用）
            </p>
            {fields.turnstileSecretKey.errors && (
              <p
                id={fields.turnstileSecretKey.errorId}
                className="text-sm text-destructive"
              >
                {fields.turnstileSecretKey.errors.join(", ")}
              </p>
            )}
          </div>

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
                      検証済み
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
                  最終検証: {formatDateTimeShort(config.lastTestedAt)}
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
              {testResult.note && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {testResult.note}
                </p>
              )}
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
            {(config.siteKey || config.secretKeyMasked) && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleClearKeys}
                disabled={isBusy}
              >
                {clearPending ? "クリア中..." : "クリア"}
              </Button>
            )}
            {siteKey && secretKey && (
              <Button
                type="button"
                variant="outline"
                onClick={handleConnectionTest}
                disabled={isBusy}
              >
                {testPending ? "テスト中..." : "形式検証"}
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
