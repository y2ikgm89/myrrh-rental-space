"use client";

/**
 * 基本情報セクション
 *
 * サイト名、ロゴ、ファビコン、OGP画像などの基本設定
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
  FormMessage,
  Input,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateBasicInfo } from "@/admin/actions/settings";
import {
  basicInfoFormSchema,
  emptyToNull,
} from "@/admin/actions/settings/schemas";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface BasicInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function BasicInfoSection({ settings }: BasicInfoSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    basicInfoFormSchema,
    (data) =>
      updateBasicInfo({
        siteName: emptyToNull(data.siteName),
        siteDescription: emptyToNull(data.siteDescription),
        faviconUrl: emptyToNull(data.faviconUrl),
        defaultOgpImageUrl: emptyToNull(data.defaultOgpImageUrl),
        headerLogoUrl: emptyToNull(data.headerLogoUrl),
        footerLogoUrl: emptyToNull(data.footerLogoUrl),
        footerCopyright: emptyToNull(data.footerCopyright),
        useHeaderLogo: data.useHeaderLogo,
        useFooterLogo: data.useFooterLogo,
      }),
    {
      defaultValues: {
        siteName: settings.siteName || "",
        siteDescription: settings.siteDescription || "",
        faviconUrl: settings.faviconUrl || "",
        defaultOgpImageUrl: settings.defaultOgpImageUrl || "",
        headerLogoUrl: settings.headerLogoUrl || "",
        footerLogoUrl: settings.footerLogoUrl || "",
        footerCopyright: settings.footerCopyright || "",
        useHeaderLogo: settings.useHeaderLogo,
        useFooterLogo: settings.useFooterLogo,
      },
      refresh: true,
      successMessage: "基本情報を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
            <CardDescription>サイトの基本的な情報を設定します</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="siteName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>サイト名</FormLabel>
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
                name="footerCopyright"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>フッターコピーライト</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="2024 Myrrh Rental Space"
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
              name="siteDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>サイト説明</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="サイトの説明文"
                      rows={2}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="headerLogoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ヘッダーロゴURL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="/images/logo.svg"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="useHeaderLogo"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between pt-1">
                        <FormLabel className="text-sm text-muted-foreground">
                          ヘッダーでロゴを使用
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending}
                          />
                        </FormControl>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        OFF時またはロゴ未設定時はサイト名をテキスト表示
                      </p>
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="footerLogoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>フッターロゴURL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="/images/logo-footer.svg"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="useFooterLogo"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between pt-1">
                        <FormLabel className="text-sm text-muted-foreground">
                          フッターでロゴを使用
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending}
                          />
                        </FormControl>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        OFF時またはロゴ未設定時はサイト名をテキスト表示
                      </p>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="faviconUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ファビコンURL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="/favicon.ico"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultOgpImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OGP画像URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="/images/ogp.jpg"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="基本情報を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
