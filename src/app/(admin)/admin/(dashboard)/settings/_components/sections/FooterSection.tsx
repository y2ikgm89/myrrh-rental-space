"use client";

/**
 * フッター設定セクション
 *
 * フッターの表示テキスト・SNSリンク表示・テーマカラーを設定
 */

import Link from "next/link";
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
import { updateFooterSettings } from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { footerFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
// =============================================================================
// Types
// =============================================================================

interface FooterSectionProps {
  settings: {
    footerTagline: string | null;
    footerNavigationLabel: string;
    footerContactLabel: string;
    footerHoursLabel: string;
    footerShowSocialLinks: boolean;
    themeColor: string;
  };
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TAGLINE =
  "洗練された空間で、特別なひとときを。\n厳選されたレンタルスペースをご案内します。";

// =============================================================================
// Component
// =============================================================================

export function FooterSection({ settings }: FooterSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    footerFormSchema,
    (data) =>
      updateFooterSettings({
        footerTagline: emptyToNull(data.footerTagline),
        footerNavigationLabel: data.footerNavigationLabel,
        footerContactLabel: data.footerContactLabel,
        footerHoursLabel: data.footerHoursLabel,
        footerShowSocialLinks: data.footerShowSocialLinks,
        themeColor: data.themeColor,
      }),
    {
      defaultValues: {
        footerTagline: settings.footerTagline ?? "",
        footerNavigationLabel: settings.footerNavigationLabel,
        footerContactLabel: settings.footerContactLabel,
        footerHoursLabel: settings.footerHoursLabel,
        footerShowSocialLinks: settings.footerShowSocialLinks,
        themeColor: settings.themeColor,
      },
      refresh: true,
      successMessage: "フッター設定を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>フッター設定</CardTitle>
            <CardDescription>
              フッターの表示テキスト、SNSリンク表示、ブラウザテーマカラーを設定します。
              メニュー項目やSNSリンクは
              <Link
                href="/admin/settings/navigation"
                className="text-primary underline-offset-4 hover:underline"
              >
                ナビゲーション管理
              </Link>
              で編集できます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="footerTagline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ブランド説明文</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={DEFAULT_TAGLINE}
                      rows={3}
                      maxLength={200}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    空欄の場合はデフォルトの説明文が表示されます
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="footerNavigationLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ナビゲーション見出し</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footerContactLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>連絡先見出し</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footerHoursLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>営業時間見出し</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="footerShowSocialLinks"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>SNSリンクを表示</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      ナビゲーション設定で登録したSNSリンクをフッターに表示します
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
              name="themeColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ブラウザテーマカラー</FormLabel>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded border border-input"
                    />
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="#fafafa"
                        className="max-w-[10rem]"
                        disabled={isPending}
                      />
                    </FormControl>
                  </div>
                  <FormDescription>
                    モバイルブラウザのアドレスバーの色に反映されます
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-2">
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
