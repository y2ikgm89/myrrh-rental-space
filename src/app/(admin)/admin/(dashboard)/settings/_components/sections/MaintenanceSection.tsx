"use client";

/**
 * メンテナンス設定セクション
 *
 * clean break 移行。Switch は `useInputControl` で hidden input と sync する公式パターン
 * (https://conform.guide/api/react/useInputControl)。
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getFormProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { cn } from "@/shared/lib/cn";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { updateMaintenanceSettings } from "@/admin/actions/settings";
import { maintenanceFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface MaintenanceSectionProps {
  settings: Serialized<SettingsData>;
}

export function MaintenanceSection({ settings }: MaintenanceSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateMaintenanceSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "maintenance-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: maintenanceFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      maintenanceMode: settings.maintenanceMode ? "on" : "",
      maintenanceMessage: settings.maintenanceMessage ?? "",
    },
  });

  const maintenanceMode = useInputControl(fields.maintenanceMode);
  const isActive = maintenanceMode.value === "on";

  // Conform 公式仕様: resetForm: true の reply は `{ initialValue: null }` のみを返す
  // (intent: "reset" は submit intent ではないため status は undefined)
  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("メンテナンス設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;
  const maintenanceMessageErrors = fields.maintenanceMessage.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>メンテナンス設定</CardTitle>
          <CardDescription>
            サイトのメンテナンスモードを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              "flex items-center justify-between rounded-lg border p-4",
              isActive && "border-destructive bg-destructive/5",
            )}
          >
            <div className="space-y-0.5">
              <label
                className="text-sm font-medium"
                htmlFor={fields.maintenanceMode.id}
              >
                メンテナンスモード
              </label>
              <p className="text-xs text-muted-foreground">
                有効にすると、公開ページにメンテナンス画面が表示されます
              </p>
            </div>
            <Switch
              id={fields.maintenanceMode.id}
              checked={isActive}
              onCheckedChange={(checked) =>
                maintenanceMode.change(checked ? "on" : "")
              }
              onBlur={maintenanceMode.blur}
              disabled={isPending}
            />
            <input
              type="hidden"
              name={fields.maintenanceMode.name}
              value={isActive ? "on" : ""}
            />
          </div>

          {isActive && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                メンテナンスモードが有効です
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                公開ページにアクセスするとメンテナンス画面が表示されます。
                管理画面は引き続き利用可能です。
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor={fields.maintenanceMessage.id}
            >
              メンテナンスメッセージ
            </label>
            <Textarea
              {...getTextareaProps(fields.maintenanceMessage)}
              placeholder={`現在メンテナンス中です。\n\nご不便をおかけして申し訳ございません。\nメンテナンス完了までしばらくお待ちください。`}
              rows={5}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              メンテナンス画面に表示するメッセージ
            </p>
            {maintenanceMessageErrors &&
              maintenanceMessageErrors.length > 0 && (
                <p
                  id={fields.maintenanceMessage.errorId}
                  className="text-sm text-destructive"
                >
                  {maintenanceMessageErrors.join(", ")}
                </p>
              )}
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="メンテナンス設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
