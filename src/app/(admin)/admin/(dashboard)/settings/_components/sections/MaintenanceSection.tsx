"use client";

/**
 * メンテナンス設定セクション
 *
 * メンテナンスモードの有効/無効、メッセージ設定
 */

import { useWatch } from "react-hook-form";
import {
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
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateMaintenanceSettings } from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { maintenanceFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface MaintenanceSectionProps {
  settings: Serialized<SettingsData>;
}

export function MaintenanceSection({ settings }: MaintenanceSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    maintenanceFormSchema,
    (data) =>
      updateMaintenanceSettings({
        maintenanceMode: data.maintenanceMode,
        maintenanceMessage: emptyToNull(data.maintenanceMessage),
      }),
    {
      defaultValues: {
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage || "",
      },
      refresh: true,
      successMessage: "メンテナンス設定を保存しました",
    },
  );

  const maintenanceMode = useWatch({
    control: form.control,
    name: "maintenanceMode",
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>メンテナンス設定</CardTitle>
            <CardDescription>
              サイトのメンテナンスモードを設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="maintenanceMode"
              render={({ field }) => (
                <FormItem>
                  <div
                    className={`flex items-center justify-between rounded-lg border p-4 ${
                      field.value ? "border-destructive bg-destructive/5" : ""
                    }`}
                  >
                    <div className="space-y-0.5">
                      <FormLabel className="font-medium">
                        メンテナンスモード
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        有効にすると、公開ページにメンテナンス画面が表示されます
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            {maintenanceMode && (
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

            <FormField
              control={form.control}
              name="maintenanceMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>メンテナンスメッセージ</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={`現在メンテナンス中です。\n\nご不便をおかけして申し訳ございません。\nメンテナンス完了までしばらくお待ちください。`}
                      rows={5}
                      disabled={isPending}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    メンテナンス画面に表示するメッセージ
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="メンテナンス設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
