"use client";

/**
 * CloudflareSection
 *
 * API Token の設定と接続テスト。PR #75 ResendSection canonical pattern を踏襲、
 * Zone ID と API Token の 2 入力に拡張。
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
  updateCloudflareSettings,
  testCloudflareConnectionAction,
  clearCloudflareKeys,
} from "@/admin/actions/api-keys";
import type { CloudflareConfig } from "@/admin/types/api-keys";
import { cloudflareFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { StatusBanner } from "../shared/StatusBanner";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";
import { IconCloud } from "@tabler/icons-react";

interface Props {
  config: CloudflareConfig;
}

export function CloudflareSection({ config }: Props) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [testPending, startTestTransition] = useTransition();
  const [clearPending, startClearTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);

  const [lastResult, action, isPending] = useActionState(
    updateCloudflareSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "cloudflare-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: cloudflareFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      cloudflareZoneId: "",
      cloudflareApiToken: "",
    },
  });

  const zoneIdControl = useInputControl(fields.cloudflareZoneId);
  const apiTokenControl = useInputControl(fields.cloudflareApiToken);
  const zoneId = zoneIdControl.value ?? "";
  const apiToken = apiTokenControl.value ?? "";

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → showTokenInput リセット
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      setShowTokenInput(false);
    }
  }

  // useEffectEvent で useInputControl 参照を effect deps から除外
  // (`react-hooks/exhaustive-deps` + `@eslint-react/exhaustive-deps` 同時解消)
  const handleSaveSuccess = useEffectEvent(() => {
    toast.success("Cloudflare設定を保存しました");
    zoneIdControl.change("");
    apiTokenControl.change("");
    router.refresh();
  });

  useEffect(() => {
    if (isSuccess) {
      handleSaveSuccess();
    }
  }, [isSuccess]);

  const handleConnectionTest = () => {
    const effectiveZoneId = zoneId || config.zoneId || "";
    if (!effectiveZoneId || !apiToken) {
      setTestResult({
        success: false,
        message: "Zone IDとAPI Tokenの両方を入力してください",
      });
      return;
    }
    startTestTransition(async () => {
      setTestResult(null);
      try {
        const result = await testCloudflareConnectionAction(
          effectiveZoneId,
          apiToken,
        );
        if (!isMutationError(result)) {
          const zoneName = result.zoneName;
          setTestResult({
            success: true,
            message: zoneName ? `接続成功 (Zone: ${zoneName})` : "接続成功",
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
      title: "設定をクリアしますか？",
      description: "Cloudflare設定をクリアしますか？",
      confirmLabel: "クリア",
      variant: "destructive",
    });
    if (!confirmed) return;

    startClearTransition(async () => {
      const result = await clearCloudflareKeys();
      if (!isMutationError(result)) {
        zoneIdControl.change("");
        apiTokenControl.change("");
        setTestResult(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const hasExistingConfig = config.zoneId || config.apiTokenMasked;
  const isBusy = isPending || testPending || clearPending;
  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCloud className="h-5 w-5 text-warning" aria-hidden="true" />
            Cloudflare CDN
          </CardTitle>
          <CardDescription>
            CDNキャッシュの自動パージ設定（コンテンツ更新時に自動でキャッシュクリア）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.cloudflareZoneId.id}>Zone ID</Label>
            {config.zoneId && !showTokenInput ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={config.zoneId}
                  disabled
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTokenInput(true)}
                >
                  変更
                </Button>
              </div>
            ) : (
              <Input
                id={fields.cloudflareZoneId.id}
                name={fields.cloudflareZoneId.name}
                value={zoneId}
                onChange={(e) => zoneIdControl.change(e.target.value)}
                onBlur={zoneIdControl.blur}
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono"
                placeholder="32文字の16進数"
                disabled={isBusy}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Cloudflare Dashboard → Overview → API セクションから取得できます
            </p>
            {fields.cloudflareZoneId.errors && (
              <p
                id={fields.cloudflareZoneId.errorId}
                className="text-sm text-destructive"
              >
                {fields.cloudflareZoneId.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.cloudflareApiToken.id}>API Token</Label>
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
              <Input
                id={fields.cloudflareApiToken.id}
                name={fields.cloudflareApiToken.name}
                value={apiToken}
                onChange={(e) => apiTokenControl.change(e.target.value)}
                onBlur={apiTokenControl.blur}
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                placeholder="API Token"
                disabled={isBusy}
              />
            )}
            <p className="text-xs text-muted-foreground">
              My Profile → API Tokens → Create Token で作成。
              <br />
              必要な権限: Zone &gt; Cache Purge &gt; Purge
            </p>
            {fields.cloudflareApiToken.errors && (
              <p
                id={fields.cloudflareApiToken.errorId}
                className="text-sm text-destructive"
              >
                {fields.cloudflareApiToken.errors.join(", ")}
              </p>
            )}
          </div>

          {config.connectionStatus && (
            <StatusBanner success={config.connectionStatus === "connected"}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    config.connectionStatus === "connected"
                      ? "bg-success"
                      : "bg-destructive",
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    config.connectionStatus === "connected"
                      ? "text-success"
                      : "text-destructive",
                  )}
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
            {hasExistingConfig && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleClearKeys}
                disabled={isBusy}
              >
                {clearPending ? "クリア中..." : "クリア"}
              </Button>
            )}
            {apiToken && (
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
