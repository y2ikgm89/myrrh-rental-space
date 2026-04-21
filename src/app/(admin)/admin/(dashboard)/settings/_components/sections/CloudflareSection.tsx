"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { useWatch } from "react-hook-form";
import { useFormAction } from "@/admin/hooks/useFormAction";
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
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);

  const { form, isPending, onSubmit } = useFormAction(
    cloudflareFormSchema,
    (data) =>
      updateCloudflareSettings({
        cloudflareZoneId: data.cloudflareZoneId || null,
        cloudflareApiToken: data.cloudflareApiToken || null,
      }),
    {
      defaultValues: {
        cloudflareZoneId: "",
        cloudflareApiToken: "",
      },
      refresh: true,
      successMessage: "Cloudflare設定を保存しました",
      onSuccess: () => {
        form.setValue("cloudflareZoneId", "");
        form.setValue("cloudflareApiToken", "");
        setShowTokenInput(false);
      },
    },
  );

  const handleConnectionTest = () => {
    const zoneId = form.getValues("cloudflareZoneId") || config.zoneId;
    const apiToken = form.getValues("cloudflareApiToken");

    if (!zoneId || !apiToken) {
      setTestResult({
        success: false,
        message: "Zone IDとAPI Tokenの両方を入力してください",
      });
      return;
    }

    startTestTransition(async () => {
      setTestResult(null);
      try {
        const result = await testCloudflareConnectionAction(zoneId, apiToken);
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

    startTestTransition(async () => {
      const result = await clearCloudflareKeys();
      if (!isMutationError(result)) {
        form.setValue("cloudflareZoneId", "");
        form.setValue("cloudflareApiToken", "");
        setTestResult(null);
        router.refresh();
      }
    });
  };

  const hasExistingConfig = config.zoneId || config.apiTokenMasked;
  const cloudflareApiToken = useWatch({
    control: form.control,
    name: "cloudflareApiToken",
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconCloud className="h-5 w-5 text-warning" />
              Cloudflare CDN
            </CardTitle>
            <CardDescription>
              CDNキャッシュの自動パージ設定（コンテンツ更新時に自動でキャッシュクリア）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="cloudflareZoneId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zone ID</FormLabel>
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
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                        className="font-mono"
                        placeholder="32文字の16進数"
                        disabled={isPending}
                      />
                    </FormControl>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Cloudflare Dashboard → Overview → API
                    セクションから取得できます
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cloudflareApiToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Token</FormLabel>
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
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                        className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                        placeholder="API Token"
                        disabled={isPending}
                      />
                    </FormControl>
                  )}
                  <p className="text-xs text-muted-foreground">
                    My Profile → API Tokens → Create Token で作成。
                    <br />
                    必要な権限: Zone &gt; Cache Purge &gt; Purge
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasExistingConfig && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleClearKeys}
                  disabled={isPending || testPending}
                >
                  クリア
                </Button>
              )}
              {cloudflareApiToken && (
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
