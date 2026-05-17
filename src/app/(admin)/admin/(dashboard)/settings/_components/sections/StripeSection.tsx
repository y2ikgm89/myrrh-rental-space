"use client";

/**
 * Stripe設定セクション
 *
 * Stripe APIキーの設定と接続テスト。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { toast } from "sonner";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import {
  updateStripeSettings,
  testStripeConnectionAction,
  clearStripeKeys,
} from "@/admin/actions/settings";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_CURRENCY_VALUES,
} from "@/admin/lib/stripe-shared";
import { createTypeGuard } from "@/shared/lib/serialize";
import { stripeFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

const isSupportedCurrency = createTypeGuard(SUPPORTED_CURRENCY_VALUES);

interface StripeSectionProps {
  settings: Serialized<SettingsData>;
}

export function StripeSection({ settings }: StripeSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    mode?: "test" | "live";
  } | null>(null);
  const [showSecretKeyInput, setShowSecretKeyInput] = useState(false);
  const [showWebhookSecretInput, setShowWebhookSecretInput] = useState(false);

  const [lastResult, action, isPending] = useActionState(
    updateStripeSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "stripe-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: stripeFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      stripeEnabled: settings.stripeEnabled ? "on" : "",
      stripeTestMode: settings.stripeTestMode ? "on" : "",
      stripePublishableKey: settings.stripePublishableKey ?? "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
      stripeCurrency: isSupportedCurrency(settings.stripeCurrency)
        ? settings.stripeCurrency
        : "jpy",
    },
  });

  const enabledControl = useInputControl(fields.stripeEnabled);
  const testModeControl = useInputControl(fields.stripeTestMode);
  const currencyControl = useInputControl(fields.stripeCurrency);
  const secretKeyControl = useInputControl(fields.stripeSecretKey);

  const enabled = enabledControl.value === "on";
  const testMode = testModeControl.value === "on";
  const currency = currencyControl.value ?? "jpy";
  const secretKeyValue = secretKeyControl.value ?? "";

  // 保存成功時に input state をリセット（render-time sync で useEffect 不使用）
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setShowSecretKeyInput(false);
      setShowWebhookSecretInput(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("Stripe設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const handleConnectionTest = () => {
    if (!secretKeyValue) {
      setTestResult({
        success: false,
        message: "シークレットキーを入力してください",
      });
      return;
    }

    startTestTransition(async () => {
      setTestResult(null);
      try {
        const result = await testStripeConnectionAction(secretKeyValue);
        if (!isMutationError(result)) {
          setTestResult({
            success: true,
            message: result.accountId
              ? `接続成功 (アカウントID: ${result.accountId})`
              : "接続成功",
            ...(result.mode !== undefined && { mode: result.mode }),
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
      title: "Stripeキーをクリアしますか？",
      description: "Stripeの全てのキーをクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTestTransition(async () => {
      const result = await clearStripeKeys();
      if (!isMutationError(result)) {
        setTestResult(null);
        toast.success("Stripeキーをクリアしました");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form {...getFormProps(form)} action={action}>
      <input
        type="hidden"
        name={fields.stripeEnabled.name}
        value={enabledControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.stripeTestMode.name}
        value={testModeControl.value ?? ""}
      />
      <input type="hidden" name={fields.stripeCurrency.name} value={currency} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-stripe-brand"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
            </svg>
            Stripe設定
          </CardTitle>
          <CardDescription>
            オンライン決済のためのStripe設定を行います
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 有効/無効 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={fields.stripeEnabled.id}>
                Stripe決済を有効にする
              </Label>
              <p className="text-sm text-muted-foreground">
                予約時にオンライン決済を受け付けます
              </p>
            </div>
            <Switch
              id={fields.stripeEnabled.id}
              checked={enabled}
              onCheckedChange={(checked) =>
                enabledControl.change(checked ? "on" : "")
              }
              disabled={isPending}
            />
          </div>

          {/* テストモード */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={fields.stripeTestMode.id}>テストモード</Label>
              <p className="text-sm text-muted-foreground">
                {testMode
                  ? "テストキーを使用します（実際の決済は行われません）"
                  : "本番キーを使用します（実際の決済が行われます）"}
              </p>
            </div>
            <Switch
              id={fields.stripeTestMode.id}
              checked={testMode}
              onCheckedChange={(checked) =>
                testModeControl.change(checked ? "on" : "")
              }
              disabled={isPending}
            />
          </div>

          {/* APIキー */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">APIキー</h4>

            {/* 公開可能キー */}
            <div className="space-y-2">
              <Label htmlFor={fields.stripePublishableKey.id}>
                公開可能キー
              </Label>
              <Input
                {...getInputProps(fields.stripePublishableKey, {
                  type: "text",
                })}
                placeholder={testMode ? "pk_test_..." : "pk_live_..."}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Stripeダッシュボードの「開発者」&gt;「APIキー」から取得できます
              </p>
              {fields.stripePublishableKey.errors && (
                <p
                  id={fields.stripePublishableKey.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.stripePublishableKey.errors.join(", ")}
                </p>
              )}
            </div>

            {/* シークレットキー */}
            <div className="space-y-2">
              <Label htmlFor={fields.stripeSecretKey.id}>
                シークレットキー
              </Label>
              {settings.stripeSecretKeyMasked && !showSecretKeyInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={settings.stripeSecretKeyMasked}
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
                  {...getInputProps(fields.stripeSecretKey, { type: "text" })}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                  placeholder={testMode ? "sk_test_..." : "sk_live_..."}
                  disabled={isPending}
                />
              )}
              <p className="text-xs text-muted-foreground">
                シークレットキーは暗号化して保存されます
              </p>
              {fields.stripeSecretKey.errors && (
                <p
                  id={fields.stripeSecretKey.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.stripeSecretKey.errors.join(", ")}
                </p>
              )}
            </div>

            {/* Webhookシークレット */}
            <div className="space-y-2">
              <Label htmlFor={fields.stripeWebhookSecret.id}>
                Webhookシークレット（任意）
              </Label>
              {settings.stripeWebhookSecretMasked && !showWebhookSecretInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={settings.stripeWebhookSecretMasked}
                    disabled
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowWebhookSecretInput(true)}
                  >
                    変更
                  </Button>
                </div>
              ) : (
                <Input
                  {...getInputProps(fields.stripeWebhookSecret, {
                    type: "text",
                  })}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                  placeholder="whsec_..."
                  disabled={isPending}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Webhook署名の検証に使用します（将来の機能用）
              </p>
              {fields.stripeWebhookSecret.errors && (
                <p
                  id={fields.stripeWebhookSecret.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.stripeWebhookSecret.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* 通貨設定 */}
          <div className="space-y-2">
            <Label htmlFor={fields.stripeCurrency.id}>通貨</Label>
            <Select
              value={currency}
              onValueChange={(value) => {
                if (isSupportedCurrency(value)) currencyControl.change(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger
                id={fields.stripeCurrency.id}
                className="w-[200px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fields.stripeCurrency.errors && (
              <p
                id={fields.stripeCurrency.errorId}
                className="text-sm text-destructive"
              >
                {fields.stripeCurrency.errors.join(", ")}
              </p>
            )}
          </div>

          {/* 接続ステータス */}
          {settings.stripeConnectionStatus && (
            <StatusBanner
              success={settings.stripeConnectionStatus === "connected"}
            >
              <div className="flex items-center gap-2">
                {settings.stripeConnectionStatus === "connected" ? (
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
              {settings.stripeAccountId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  アカウントID: {settings.stripeAccountId}
                </p>
              )}
              {settings.stripeLastTestedAt && (
                <p className="text-xs text-muted-foreground">
                  最終テスト: {formatDateTimeShort(settings.stripeLastTestedAt)}
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
              {testResult.mode && (
                <p className="mt-1 text-xs text-muted-foreground">
                  モード: {testResult.mode === "test" ? "テスト" : "本番"}
                </p>
              )}
            </StatusBanner>
          )}

          {/* アクションボタン */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(settings.stripeSecretKeyMasked ||
              settings.stripePublishableKey) && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleClearKeys}
                disabled={isPending || testPending}
              >
                キーをクリア
              </Button>
            )}
            {secretKeyValue && (
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
              label="Stripe設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
