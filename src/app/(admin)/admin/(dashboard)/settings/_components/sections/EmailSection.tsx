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
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateEmailSettings } from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { emailFormSchema } from "@/admin/actions/settings/schemas/form-schemas-email-notification";
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
        emailSubjectPrefix: emptyToNull(data.emailSubjectPrefix),
        emailFooterNote: emptyToNull(data.emailFooterNote),
        emailSupportContactText: emptyToNull(data.emailSupportContactText),
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
        emailSubjectPrefix: settings.emailSubjectPrefix || "",
        emailFooterNote: settings.emailFooterNote || "",
        emailSupportContactText: settings.emailSupportContactText || "",
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

            <fieldset className="rounded-lg border p-4 space-y-4">
              <legend className="px-1 text-sm font-medium">
                テンプレート共通項目
              </legend>
              <FormField
                control={form.control}
                name="emailSubjectPrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>件名プレフィックス</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="[Myrrh] "
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      全メールの件名冒頭に付加する文字列（32文字以内）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emailFooterNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>フッター補足</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="このメールは自動送信されています。"
                        rows={3}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      全メールのフッター下部に表示される補足文
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emailSupportContactText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>サポート問い合わせ文言</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="ご不明な点がございましたら support@example.com までお問い合わせください。"
                        rows={3}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      締め文の下に表示されるサポート案内
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

            <fieldset className="rounded-lg border p-4 space-y-4">
              <legend className="px-1 text-sm font-medium">送信設定</legend>
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
            </fieldset>

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="メール設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
