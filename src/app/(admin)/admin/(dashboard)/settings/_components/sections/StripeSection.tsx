"use client";

/**
 * Stripe設定セクション
 *
 * Stripe APIキーの設定と接続テスト。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { toast } from "sonner";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  isTestKey,
} from "@/shared/lib/stripe-shared";
import {
  STRIPE_PAYMENT_METHOD_LABELS,
  STRIPE_PAYMENT_METHOD_TYPE_VALUES,
  STRIPE_PAYMENT_METHOD_CURRENCY_ALLOW,
  isStripePaymentMethodType,
  isPaymentMethodAllowedForCurrency,
  filterCompatiblePaymentMethods,
  type StripePaymentMethodType,
} from "@/shared/lib/stripe-payment-methods";
import { Checkbox } from "@/admin/components/ui";
import { createTypeGuard } from "@/shared/lib/serialize";
import { stripeFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { IconAlertTriangle, IconCopy } from "@tabler/icons-react";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import {
  HiddenControlInput,
  useFieldControl,
} from "@/shared/lib/conform/control";
import { ConnectionStatus } from "@/shared/lib/validations/enums/prisma-types";

const isSupportedCurrency = createTypeGuard(SUPPORTED_CURRENCY_VALUES);

interface StripeSectionProps {
  settings: Serialized<SettingsData>;
  stripeWebhookUrl: string;
  stripeEnvSecretActive: boolean;
}

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

export function StripeSection({
  settings,
  stripeWebhookUrl,
  stripeEnvSecretActive,
}: StripeSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    mode?: "test" | "live";
  } | null>(null);
  const [showPublishableKeyInput, setShowPublishableKeyInput] = useState(false);
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
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      stripePublishableKey: settings.stripePublishableKey ?? "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
      stripeCurrency: isSupportedCurrency(settings.stripeCurrency)
        ? settings.stripeCurrency
        : "jpy",
      stripePaymentMethodTypes:
        settings.stripePaymentMethodTypes.filter(isStripePaymentMethodType)
          .length > 0
          ? settings.stripePaymentMethodTypes.filter(isStripePaymentMethodType)
          : ["card"],
      expectedUpdatedAt: settings.stripeUpdatedAt,
    },
  });

  // 選択中の payment_method_types を state で持ち、多値 hidden input として POST。
  // conform の getInputProps は multi-checkbox に直接対応しないため、状態管理は
  // 手動 + hidden input で fallback する (useTypedControl でも overkill)。
  //
  // Codex PR #1046 P2 (comment 3570245234): DB に既に invalid combination が
  // 保存されている場合 (例: currency=usd + methods=[card, konbini]) の初回 render で、
  // konbini が checked + disabled + hidden input で POST される状態を放置すると
  // Zod superRefine が全 save を reject し admin が修復不能になる。初期化時に
  // filterCompatiblePaymentMethods() を通して既存 stale state をクリーニングする。
  const [selectedMethods, setSelectedMethods] = useState<
    ReadonlyArray<StripePaymentMethodType>
  >(() => {
    // filter に type guard を渡すことで返り値が StripePaymentMethodType[] に narrow される
    const validated: StripePaymentMethodType[] =
      settings.stripePaymentMethodTypes.filter(isStripePaymentMethodType);
    // 現在の currency と互換な method のみ残す (DB の stale invalid state 修復)
    const initialCurrency = isSupportedCurrency(settings.stripeCurrency)
      ? settings.stripeCurrency
      : "jpy";
    const compatible = filterCompatiblePaymentMethods(
      validated,
      initialCurrency,
    );
    return compatible.length > 0 ? compatible : ["card"];
  });

  const toggleMethod = (method: StripePaymentMethodType, checked: boolean) => {
    setSelectedMethods((prev) => {
      const set = new Set(prev);
      if (checked) {
        set.add(method);
      } else {
        set.delete(method);
      }
      // 最低 1 件維持 (ドメイン層の gate と対称)。全 uncheck を防ぐ。
      if (set.size === 0) return prev;
      return STRIPE_PAYMENT_METHOD_TYPE_VALUES.filter((m) => set.has(m));
    });
  };

  const currencyControl = useFieldControl(fields.stripeCurrency);
  const secretKeyControl = useFieldControl(fields.stripeSecretKey);

  const currency = currencyControl.value ?? "jpy";
  const secretKeyValue = secretKeyControl.value ?? "";

  // Currency 切替時に非対応 method を自動 drop する (Codex PR #1045 P2 fix)。
  // 例: JPY で `konbini` 選択中 → USD に切替 → `konbini` は非対応なので配列から除外。
  // 残りが空になったら "card" にフォールバック (server 側 min(1) 契約と対称)。
  // render-time sync で useEffect 不使用 (React 公式 anti-pattern 回避)。
  const [previousCurrency, setPreviousCurrency] = useState(currency);
  if (currency !== previousCurrency) {
    setPreviousCurrency(currency);
    setSelectedMethods((prev) => {
      const compatible = filterCompatiblePaymentMethods(prev, currency);
      if (compatible.length === prev.length) return prev;
      return compatible.length > 0 ? compatible : ["card"];
    });
  }

  // test / live は保存済み公開キーの接頭辞から自動判定（DB トグルは持たない）
  const savedMode: "test" | "live" | null = settings.stripePublishableKey
    ? isTestKey(settings.stripePublishableKey)
      ? "test"
      : "live"
    : null;

  // 保存成功時に input state をリセット（render-time sync で useEffect 不使用）
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setShowPublishableKeyInput(false);
      setShowSecretKeyInput(false);
      setShowWebhookSecretInput(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("Stripe設定を保存しました");
      router.refresh();
      return;
    }
    if (lastResult?.status === "error") {
      const formLevelErrors = lastResult.error?.[""];
      const conflictMessage = formLevelErrors?.find((message) =>
        message.includes(OPTIMISTIC_CONFLICT_HINT),
      );
      if (conflictMessage) {
        toast.error(conflictMessage);
        router.refresh();
      }
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  const handleCopyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(stripeWebhookUrl);
      toast.success("Webhook URL をコピーしました");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

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
      <input {...getInputProps(fields.expectedUpdatedAt, { type: "hidden" })} />
      <HiddenControlInput
        field={fields.stripeCurrency}
        control={currencyControl}
      />
      <HiddenControlInput
        field={fields.stripeSecretKey}
        control={secretKeyControl}
      />
      {/* 多値 checkbox の POST 経路: 選択した method を全て個別 hidden input で出力
        (conform は同名 name の複数値を FormData.getAll() で拾える)。名前は Zod schema の
        stripePaymentMethodTypes に一致させ、array Zod が受け取る形にする。 */}
      {selectedMethods.map((method) => (
        <input
          key={method}
          type="hidden"
          name={fields.stripePaymentMethodTypes.name}
          value={method}
        />
      ))}

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
            オンライン決済のための Stripe credentials を設定します。
            <br />
            決済機能の ON/OFF は「
            <Link
              href="/admin/settings/features"
              className="underline underline-offset-4 hover:text-foreground"
            >
              機能モジュール
            </Link>
            」の「オンライン決済」で切り替えます（OFF でも credentials
            が設定されていれば webhook による決済確定・返金反映は継続します。OFF
            で止まるのは新規 checkout のみ）。
            <br />
            イベントチケットは ticket 価格を税込固定で Stripe に送り、領収書は
            10% 内税として税額を逆算します（予約スペースの税率設定とは別経路）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="info">
            <IconAlertTriangle aria-hidden="true" />
            <AlertTitle>決済機能 OFF と Webhook の関係</AlertTitle>
            <AlertDescription>
              オンライン決済は二層で制御されます。（1）「
              <Link
                href="/admin/settings/features"
                className="underline underline-offset-4 hover:text-foreground"
              >
                機能モジュール
              </Link>
              」の「オンライン決済」OFF では新規 checkout
              のみ停止します。（2）Stripe credentials（シークレットキー +
              Webhook 署名秘密）が設定されていれば、Webhook
              による決済確定・返金反映・精算処理は決済機能 OFF でも継続します。
            </AlertDescription>
          </Alert>

          {stripeEnvSecretActive && (
            <Alert>
              <IconAlertTriangle aria-hidden="true" />
              <AlertTitle>
                環境変数の Stripe シークレットキーが使用中
              </AlertTitle>
              <AlertDescription>
                DB にシークレットキーが保存されていませんが、環境変数{" "}
                <span className="font-mono">STRIPE_SECRET_KEY</span> により決済
                API が動作しています。管理画面からキーを保存すると DB
                が正本になり、環境変数への依存を解消できます。
              </AlertDescription>
            </Alert>
          )}

          {/* 動作モード（APIキーから自動判定・読み取り専用） */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>動作モード</Label>
              <p className="text-sm text-muted-foreground">
                test / live は API キー（pk_test_ /
                pk_live_）の種類で決まります。 ここでは切り替えできません。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  savedMode === "live"
                    ? "bg-warning"
                    : savedMode === "test"
                      ? "bg-success"
                      : "bg-muted-foreground",
                )}
              />
              <span className="text-sm font-medium">
                {savedMode === "test"
                  ? "テストモード"
                  : savedMode === "live"
                    ? "本番モード（実際の決済が行われます）"
                    : "キー未設定"}
              </span>
            </div>
          </div>

          {/* APIキー */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">APIキー</h4>

            {/* 公開可能キー */}
            <div className="space-y-2">
              <Label htmlFor={fields.stripePublishableKey.id}>
                公開可能キー
              </Label>
              {settings.stripePublishableKey && !showPublishableKeyInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={settings.stripePublishableKey}
                    disabled
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPublishableKeyInput(true)}
                  >
                    変更
                  </Button>
                </div>
              ) : (
                <Input
                  {...getInputProps(fields.stripePublishableKey, {
                    type: "text",
                  })}
                  className="font-mono"
                  placeholder={
                    savedMode === "live" ? "pk_live_..." : "pk_test_..."
                  }
                  disabled={isPending}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Stripeダッシュボードの「開発者」&gt;「APIキー」から取得できます。誤って書き換えないよう、保存済みの場合は「変更」を押してから編集します。
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
                  id={fields.stripeSecretKey.id}
                  value={secretKeyValue}
                  onChange={(e) => secretKeyControl.change(e.target.value)}
                  onBlur={secretKeyControl.blur}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                  placeholder={
                    savedMode === "live" ? "sk_live_..." : "sk_test_..."
                  }
                  disabled={isPending}
                  aria-invalid={
                    fields.stripeSecretKey.errors ? true : undefined
                  }
                  aria-describedby={
                    fields.stripeSecretKey.errors
                      ? fields.stripeSecretKey.errorId
                      : undefined
                  }
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

            {/* Webhook エンドポイント URL */}
            <div className="space-y-2">
              <Label htmlFor="stripe-webhook-endpoint-url">
                Webhook エンドポイント URL
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="stripe-webhook-endpoint-url"
                  type="text"
                  value={stripeWebhookUrl}
                  readOnly
                  disabled
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyWebhookUrl()}
                  aria-label="Webhook URL をコピー"
                >
                  <IconCopy className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Stripe Dashboard → Developers → Webhooks → Add endpoint に上記
                URL（<span className="font-mono">/api/webhooks/stripe</span>
                ）を登録してください。
              </p>
            </div>

            {/* Webhookシークレット */}
            <div className="space-y-2">
              <Label htmlFor={fields.stripeWebhookSecret.id}>
                Webhook 署名秘密
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
                Stripe Dashboard → Developers → Webhooks → Signing secret
                （whsec_...）を貼り付けます。暗号化して DB に保存され、上記
                エンドポイントへの POST の署名検証に使用します。checkout
                可用性の判定と Webhook 処理の両方に必須です。
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

          {/* 決済方法 (payment_method_types) — 最低 1 件必須。ハードコード fallback なし */}
          <div className="space-y-3">
            <div>
              <Label>有効化する決済方法</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Stripe Checkout で提示する決済方法を選択します。少なくとも 1
                種類を有効にしてください。
              </p>
            </div>
            <div
              role="group"
              aria-label="有効化する決済方法"
              aria-describedby={
                fields.stripePaymentMethodTypes.errors
                  ? fields.stripePaymentMethodTypes.errorId
                  : undefined
              }
              className="space-y-2 rounded-lg border p-4"
            >
              {STRIPE_PAYMENT_METHOD_TYPE_VALUES.map((method) => {
                const allowedCurrencies =
                  STRIPE_PAYMENT_METHOD_CURRENCY_ALLOW[method];
                const disabledForCurrency = !isPaymentMethodAllowedForCurrency(
                  method,
                  currency,
                );
                const isChecked = selectedMethods.includes(method);
                const inputId = `stripe-payment-method-${method}`;
                return (
                  <label
                    key={method}
                    htmlFor={inputId}
                    className={cn(
                      "flex items-start gap-3 cursor-pointer",
                      // 減光しない。この状態でだけ出る「対応通貨: ...」は
                      // **なぜ選べないかを伝える唯一の導線**で、`opacity-50` では
                      // 2.14:1（手段名も 3.44:1）まで落ちて読めなくなっていた。
                      // Checkbox が disabled なので SC 1.4.3 の inactive 例外は
                      // 形式的には成立するが、例外の趣旨は「不活性な要素の視認性は
                      // 問わない」であって、説明文を潰してよいという意味ではない。
                      // 状態は disabled な Checkbox 自身と説明文の存在が担う。
                      disabledForCurrency && "cursor-not-allowed",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={isChecked}
                      disabled={isPending || disabledForCurrency}
                      onCheckedChange={(checked) =>
                        toggleMethod(method, checked === true)
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 leading-tight">
                      <p className="text-sm font-medium">
                        {STRIPE_PAYMENT_METHOD_LABELS[method]}
                      </p>
                      {disabledForCurrency && allowedCurrencies && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          対応通貨:{" "}
                          {allowedCurrencies
                            .map((c) => c.toUpperCase())
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            {fields.stripePaymentMethodTypes.errors && (
              <p
                id={fields.stripePaymentMethodTypes.errorId}
                className="text-sm text-destructive"
              >
                {fields.stripePaymentMethodTypes.errors.join(", ")}
              </p>
            )}
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
                aria-invalid={fields.stripeCurrency.errors ? true : undefined}
                aria-describedby={
                  fields.stripeCurrency.errors
                    ? fields.stripeCurrency.errorId
                    : undefined
                }
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
              success={
                settings.stripeConnectionStatus === ConnectionStatus.CONNECTED
              }
            >
              <p className="text-xs text-muted-foreground mb-2">
                保存済み credentials に基づく接続状態です（接続テストは DB
                を更新しません）。
              </p>
              <div className="flex items-center gap-2">
                {settings.stripeConnectionStatus ===
                ConnectionStatus.CONNECTED ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span className="text-sm font-medium text-success">
                      接続確認済み（保存済み）
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

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(settings.stripeSecretKeyMasked ||
              settings.stripePublishableKey) && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleClearKeys()}
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
            {secretKeyValue && (
              <p className="w-full text-right text-xs text-muted-foreground">
                入力中のシークレットキーで API
                接続を検証します。結果はこの画面のみに表示され、DB
                の接続状態は更新されません。
              </p>
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
