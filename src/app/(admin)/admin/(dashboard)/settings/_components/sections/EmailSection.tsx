"use client";

/**
 * メール設定セクション
 *
 * 送信者情報、返信先、通知先メールアドレスの設定
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateEmailSettings } from "@/admin/actions/settings";
import { emailFormSchema, emptyToNull } from "@/admin/actions/settings/schemas";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface EmailSectionProps {
  settings: Serialized<SettingsData>;
}

export function EmailSection({ settings }: EmailSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    emailFormSchema,
    (data) =>
      updateEmailSettings({
        senderEmail: emptyToNull(data.senderEmail),
        senderName: emptyToNull(data.senderName),
        replyToEmail: emptyToNull(data.replyToEmail),
        sendReservationConfirmationEmail: data.sendReservationConfirmationEmail,
        sendAdminNotificationEmail: data.sendAdminNotificationEmail,
        notificationEmailAddresses: emptyToNull(
          data.notificationEmailAddresses,
        ),
      }),
    {
      defaultValues: {
        senderEmail: settings.senderEmail || "",
        senderName: settings.senderName || "",
        replyToEmail: settings.replyToEmail || "",
        sendReservationConfirmationEmail:
          settings.sendReservationConfirmationEmail,
        sendAdminNotificationEmail: settings.sendAdminNotificationEmail,
        notificationEmailAddresses: settings.notificationEmailAddresses || "",
      },
      refresh: true,
      successMessage: "メール設定を更新しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>メール設定</CardTitle>
            <CardDescription>メール送信に関する設定を行います</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="senderEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>送信元メールアドレス</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="noreply@example.com"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="senderName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>送信者名</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Myrrh Rental Space"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="replyToEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>返信先メールアドレス</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="info@example.com"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notificationEmailAddresses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>通知先メールアドレス</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="admin1@example.com, admin2@example.com"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    カンマ区切りで複数指定可能。予約・お問い合わせの通知を受け取るアドレス
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border p-4 space-y-4">
              <h4 className="font-medium">送信設定</h4>
              <div className="flex flex-wrap gap-6">
                <FormField
                  control={form.control}
                  name="sendReservationConfirmationEmail"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormLabel>予約確認メールを送信</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sendAdminNotificationEmail"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormLabel>管理者通知メールを送信</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <SubmitButton
              isPending={isPending}
              label="メール設定を保存"
              disabled={!form.formState.isDirty}
            />
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
