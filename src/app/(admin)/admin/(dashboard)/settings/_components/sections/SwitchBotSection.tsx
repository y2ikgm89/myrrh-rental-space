"use client";

/**
 * SwitchBot スマートロック連携設定セクション
 *
 * TurnstileSection canonical pattern を踏襲、Open Token + Secret Key の 2 入力 +
 * 有効/無効トグル（GoogleCalendarSection参考）+ パスコード有効バッファ(分)。
 * Turnstileと異なり接続テストは実際にSwitchBot APIを叩いて疎通確認する。
 */

import {
  useActionState,
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
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
  Switch,
} from "@/admin/components/ui";
import {
  updateSwitchBotSettings,
  testSwitchBotConnectionAction,
  clearSwitchBotKeys,
  registerSwitchBotWebhookAction,
} from "@/admin/actions/api-keys";
import { switchbotFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import type { SwitchBotConfig } from "@/admin/types/api-keys";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  SmartLockDeviceRegistry,
  type SmartLockDeviceRegistryLocationOption,
} from "@/admin/components/SmartLockDeviceRegistry";
import type { SmartLockDeviceWithLocation } from "@/shared/domain/smart-lock/queries";

interface SwitchBotSectionProps {
  config: SwitchBotConfig;
  devices: readonly SmartLockDeviceWithLocation[];
  availableLocations: readonly SmartLockDeviceRegistryLocationOption[];
}

export function SwitchBotSection({
  config,
  devices,
  availableLocations,
}: SwitchBotSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [clearPending, startClearTransition] = useTransition();
  const [webhookPending, startWebhookTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    note?: string;
  } | null>(null);
  const [webhookResult, setWebhookResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showOpenTokenInput, setShowOpenTokenInput] = useState(false);
  const [showSecretKeyInput, setShowSecretKeyInput] = useState(false);

  const [lastResult, action, isPending] = useActionState(
    updateSwitchBotSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "switchbot-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: switchbotFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      switchbotEnabled: config.enabled ? "on" : "",
      switchbotOpenToken: "",
      switchbotSecretKey: "",
      switchbotPasscodeBufferMinutes: String(config.passcodeBufferMinutes),
    },
  });

  const enabledControl = useInputControl(fields.switchbotEnabled);
  const openTokenControl = useInputControl(fields.switchbotOpenToken);
  const secretKeyControl = useInputControl(fields.switchbotSecretKey);
  const enabled = enabledControl.value === "on";
  const openToken = openTokenControl.value ?? "";
  const secretKey = secretKeyControl.value ?? "";

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → showOpenTokenInput/showSecretKeyInput リセット
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      setShowOpenTokenInput(false);
      setShowSecretKeyInput(false);
    }
  }

  // useEffectEvent で useInputControl 参照を effect deps から除外
  const handleSaveSuccess = useEffectEvent(() => {
    toast.success("SwitchBot設定を保存しました");
    openTokenControl.change("");
    secretKeyControl.change("");
    router.refresh();
  });

  useEffect(() => {
    if (isSuccess) {
      handleSaveSuccess();
    }
  }, [isSuccess]);

  const handleConnectionTest = () => {
    if (!openToken || !secretKey) {
      setTestResult({
        success: false,
        message: "Open TokenとSecret Keyの両方を入力してください",
      });
      return;
    }
    startTestTransition(async () => {
      setTestResult(null);
      try {
        const result = await testSwitchBotConnectionAction(
          openToken,
          secretKey,
        );
        if (!isMutationError(result)) {
          setTestResult({
            success: true,
            message: "接続成功",
            ...(result.note !== undefined && { note: result.note }),
          });
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
      title: "キーをクリアしますか？",
      description: "SwitchBotのキーをクリアしますか？連携は無効になります。",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startClearTransition(async () => {
      const result = await clearSwitchBotKeys();
      if (!isMutationError(result)) {
        openTokenControl.change("");
        secretKeyControl.change("");
        enabledControl.change("");
        setTestResult(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRegisterWebhook = () => {
    startWebhookTransition(async () => {
      setWebhookResult(null);
      try {
        const result = await registerSwitchBotWebhookAction();
        if (!isMutationError(result)) {
          setWebhookResult({
            success: true,
            message: `Webhookを登録しました: ${result.url}`,
          });
        } else {
          setWebhookResult({ success: false, message: result.error });
        }
      } catch {
        setWebhookResult({
          success: false,
          message: "Webhook登録でエラーが発生しました",
        });
      }
    });
  };

  const isBusy = isPending || testPending || clearPending || webhookPending;
  const formErrors = form.errors;

  return (
    <div className="space-y-6">
      <form {...getFormProps(form)} action={action}>
        <input
          type="hidden"
          name={fields.switchbotEnabled.name}
          value={enabledControl.value ?? ""}
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-warning"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              SwitchBot スマートロック連携
            </CardTitle>
            <CardDescription>
              スマートロックの解錠パスコード発行に使用するAPI認証情報を管理します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={fields.switchbotEnabled.id}>
                  SwitchBot連携を有効にする
                </Label>
                <p className="text-sm text-muted-foreground">
                  予約時にスマートロックの解錠パスコードを自動発行します
                </p>
              </div>
              <Switch
                id={fields.switchbotEnabled.id}
                checked={enabled}
                onCheckedChange={(checked) =>
                  enabledControl.change(checked ? "on" : "")
                }
                disabled={isBusy}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.switchbotOpenToken.id}>Open Token</Label>
              {config.openTokenMasked && !showOpenTokenInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={config.openTokenMasked}
                    disabled
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOpenTokenInput(true)}
                  >
                    変更
                  </Button>
                </div>
              ) : (
                <Input
                  id={fields.switchbotOpenToken.id}
                  name={fields.switchbotOpenToken.name}
                  value={openToken}
                  onChange={(e) => openTokenControl.change(e.target.value)}
                  onBlur={openTokenControl.blur}
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  placeholder="SwitchBotアプリの開発者向けオプションから取得"
                  disabled={isBusy}
                  className="font-mono"
                  aria-invalid={
                    fields.switchbotOpenToken.errors ? true : undefined
                  }
                  aria-describedby={
                    fields.switchbotOpenToken.errors
                      ? fields.switchbotOpenToken.errorId
                      : undefined
                  }
                />
              )}
              <p className="text-xs text-muted-foreground">
                SwitchBotアプリ「プロフィール」→「設定」→バージョン表示を連続タップして開発者向けオプションから取得します。誤って書き換えないよう、保存済みの場合は「変更」を押してから編集します。
              </p>
              {fields.switchbotOpenToken.errors && (
                <p
                  id={fields.switchbotOpenToken.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.switchbotOpenToken.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.switchbotSecretKey.id}>Secret Key</Label>
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
                  id={fields.switchbotSecretKey.id}
                  name={fields.switchbotSecretKey.name}
                  value={secretKey}
                  onChange={(e) => secretKeyControl.change(e.target.value)}
                  onBlur={secretKeyControl.blur}
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                  placeholder="SwitchBotアプリの開発者向けオプションから取得"
                  disabled={isBusy}
                  aria-invalid={
                    fields.switchbotSecretKey.errors ? true : undefined
                  }
                  aria-describedby={
                    fields.switchbotSecretKey.errors
                      ? fields.switchbotSecretKey.errorId
                      : undefined
                  }
                />
              )}
              <p className="text-xs text-muted-foreground">
                シークレットキー（サーバー側で使用）
              </p>
              {fields.switchbotSecretKey.errors && (
                <p
                  id={fields.switchbotSecretKey.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.switchbotSecretKey.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.switchbotPasscodeBufferMinutes.id}>
                パスコード有効バッファ（分）
              </Label>
              <Input
                {...getInputProps(fields.switchbotPasscodeBufferMinutes, {
                  type: "number",
                })}
                min={0}
                max={180}
                disabled={isBusy}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">
                予約開始・終了時刻の前後何分をパスコード有効期間に含めるかを設定します（0〜180分）
              </p>
              {fields.switchbotPasscodeBufferMinutes.errors && (
                <p
                  id={fields.switchbotPasscodeBufferMinutes.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.switchbotPasscodeBufferMinutes.errors.join(", ")}
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

            {config.enabled &&
              (config.openTokenMasked || config.secretKeyMasked) && (
                <div className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        Webhook（パスコード確定通知）
                      </p>
                      <p className="text-xs text-muted-foreground">
                        SwitchBotからの発行結果通知を受け取るURLを登録します（未登録でも
                        ポーリングにより発行自体は完了しますが、確定が早まります）
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRegisterWebhook}
                      disabled={isBusy}
                    >
                      {webhookPending ? "登録中..." : "Webhookを登録"}
                    </Button>
                  </div>
                  {webhookResult && (
                    <StatusBanner success={webhookResult.success}>
                      <p
                        className={cn(
                          "text-sm break-all",
                          webhookResult.success
                            ? "text-success"
                            : "text-destructive",
                        )}
                      >
                        {webhookResult.message}
                      </p>
                    </StatusBanner>
                  )}
                </div>
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
              {(config.openTokenMasked || config.secretKeyMasked) && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleClearKeys}
                  disabled={isBusy}
                >
                  {clearPending ? "クリア中..." : "クリア"}
                </Button>
              )}
              {openToken && secretKey && (
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

      <Card>
        <CardHeader>
          <CardTitle>スマートロックデバイス登録簿</CardTitle>
          <CardDescription>
            拠点に紐づくスマートロックデバイスの登録・編集・削除・有効化を管理します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SmartLockDeviceRegistry
            devices={devices}
            availableLocations={availableLocations}
          />
        </CardContent>
      </Card>
    </div>
  );
}
