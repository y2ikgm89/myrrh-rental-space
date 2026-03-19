"use client";

/**
 * 通知設定セクション
 *
 * 各種イベント通知のオン/オフ設定
 */

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
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateNotificationSettings } from "@/admin/actions/settings";
import { notificationFormSchema } from "@/admin/actions/settings/schemas";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface NotificationSectionProps {
  settings: Serialized<SettingsData>;
}

export function NotificationSection({ settings }: NotificationSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    notificationFormSchema,
    (data) => updateNotificationSettings(data),
    {
      defaultValues: {
        notifyNewReservation: settings.notifyNewReservation,
        notifyReservationChange: settings.notifyReservationChange,
        notifyReservationCancel: settings.notifyReservationCancel,
        notifyNewInquiry: settings.notifyNewInquiry,
      },
      refresh: true,
      successMessage: "通知設定を更新しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>通知トリガー設定</CardTitle>
            <CardDescription>
              どのイベントで管理者に通知メールを送信するか設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="notifyNewReservation"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="font-medium">新規予約</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        予約が作成されたとき
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notifyReservationChange"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="font-medium">予約変更</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        予約内容が変更されたとき
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notifyReservationCancel"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="font-medium">
                        予約キャンセル
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        予約がキャンセルされたとき
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notifyNewInquiry"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="font-medium">
                        お問い合わせ
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        お問い合わせが送信されたとき
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="通知設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
