"use client";

/**
 * Cookie同意バナー設定セクション
 *
 * GDPR対応のCookie同意バナーの表示設定
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Switch,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateCookieConsentSettings } from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { cookieConsentFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

// デフォルト値
const DEFAULT_MESSAGE =
  "当サイトでは、サービス向上のためにCookieを使用しています。Cookieの使用に同意いただける場合は「同意する」をクリックしてください。";
const DEFAULT_ACCEPT_TEXT = "同意する";
const DEFAULT_REJECT_TEXT = "拒否する";
const DEFAULT_POLICY_URL = "/privacy";

interface CookieConsentSectionProps {
  settings: Serialized<SettingsData>;
}

export function CookieConsentSection({ settings }: CookieConsentSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    cookieConsentFormSchema,
    (data) =>
      updateCookieConsentSettings({
        cookieConsentEnabled: data.cookieConsentEnabled,
        cookieConsentMessage: emptyToNull(data.cookieConsentMessage),
        cookieConsentAcceptText: emptyToNull(data.cookieConsentAcceptText),
        cookieConsentRejectText: emptyToNull(data.cookieConsentRejectText),
        cookieConsentPolicyUrl: emptyToNull(data.cookieConsentPolicyUrl),
      }),
    {
      defaultValues: {
        cookieConsentEnabled: settings.cookieConsentEnabled,
        cookieConsentMessage: settings.cookieConsentMessage || "",
        cookieConsentAcceptText: settings.cookieConsentAcceptText || "",
        cookieConsentRejectText: settings.cookieConsentRejectText || "",
        cookieConsentPolicyUrl: settings.cookieConsentPolicyUrl || "",
      },
      refresh: true,
      successMessage: "Cookie同意設定を保存しました",
    },
  );

  const cookieConsentEnabled = useWatch({
    control: form.control,
    name: "cookieConsentEnabled",
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Cookie同意バナー</CardTitle>
            <CardDescription>
              GDPR対応のCookie同意バナーを表示します。グローバル展開時に有効にしてください。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="cookieConsentEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="font-medium">
                      Cookie同意バナーを表示
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      有効にすると、初回訪問時にCookie同意バナーが表示されます
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

            {cookieConsentEnabled && (
              <>
                <FormField
                  control={form.control}
                  name="cookieConsentMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>バナーメッセージ</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={DEFAULT_MESSAGE}
                          rows={3}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        空欄の場合はデフォルトメッセージが表示されます
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="cookieConsentAcceptText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>同意ボタンテキスト</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={DEFAULT_ACCEPT_TEXT}
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cookieConsentRejectText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>拒否ボタンテキスト</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={DEFAULT_REJECT_TEXT}
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
                  name="cookieConsentPolicyUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>プライバシーポリシーURL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={DEFAULT_POLICY_URL}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        「詳細」リンクのリンク先URL
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="Cookie同意設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
