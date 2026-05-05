"use client";

/**
 * 基本情報セクション
 *
 * サイト名、フッターコピーライト、サイト説明（テキスト情報）と、
 * ロゴ・ファビコン・OGP画像（ブランド画像）を 1 つの保存単位で管理する。
 *
 * UI 構造:
 * - テキスト情報 grid（siteName / footerCopyright + siteDescription）
 * - 横線で区切り「ブランド画像」サブセクション
 *   - 4 画像すべて `<fieldset>` + `<legend>` で視覚・semantic 的にグルーピング
 *   - ヘッダー / フッターロゴ: 画像 + 使用 Switch + 補足の複合グループ
 *   - ファビコン / OGP画像: 画像のみの単一グループ（FormLabel は sr-only で legend と冗長性回避）
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
import { MediaPickerField } from "@/admin/components/media-picker";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateBasicInfo } from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { basicInfoFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
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
          <CardContent className="space-y-6">
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

            <div className="space-y-4 border-t pt-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  ブランド画像
                </h3>
                <p className="text-xs text-muted-foreground">
                  サイトのロゴ・ファビコン・OGP画像を設定します
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="space-y-4 rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">
                    ヘッダーロゴ
                  </legend>
                  <FormField
                    control={form.control}
                    name="headerLogoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">
                          ヘッダーロゴ画像
                        </FormLabel>
                        <FormControl>
                          <MediaPickerField
                            value={field.value}
                            onChange={field.onChange}
                            disabled={isPending}
                            aspectRatio="logo"
                            defaultUsage="SITE"
                            alt="ヘッダーロゴ"
                            recommendedSize="横長 3:1 / 高さ 64px 程度の透過 PNG・SVG"
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
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-sm font-normal">
                            ヘッダーで使用
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={isPending}
                            />
                          </FormControl>
                        </div>
                        <FormDescription className="text-xs">
                          OFF時またはロゴ未設定時はサイト名をテキスト表示
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </fieldset>

                <fieldset className="space-y-4 rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">
                    フッターロゴ
                  </legend>
                  <FormField
                    control={form.control}
                    name="footerLogoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">
                          フッターロゴ画像
                        </FormLabel>
                        <FormControl>
                          <MediaPickerField
                            value={field.value}
                            onChange={field.onChange}
                            disabled={isPending}
                            aspectRatio="logo"
                            defaultUsage="SITE"
                            alt="フッターロゴ"
                            recommendedSize="横長 3:1 / 高さ 64px 程度の透過 PNG・SVG"
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
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-sm font-normal">
                            フッターで使用
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={isPending}
                            />
                          </FormControl>
                        </div>
                        <FormDescription className="text-xs">
                          OFF時またはロゴ未設定時はサイト名をテキスト表示
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </fieldset>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="space-y-2 rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">
                    ファビコン
                  </legend>
                  <FormField
                    control={form.control}
                    name="faviconUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">
                          ファビコン画像
                        </FormLabel>
                        <FormControl>
                          <MediaPickerField
                            value={field.value}
                            onChange={field.onChange}
                            disabled={isPending}
                            aspectRatio="square"
                            defaultUsage="SITE"
                            alt="ファビコン"
                            recommendedSize="正方形 192×192 以上（.ico .png .svg）"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>

                <fieldset className="space-y-2 rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">
                    OGP画像（デフォルト）
                  </legend>
                  <FormField
                    control={form.control}
                    name="defaultOgpImageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">OGP画像</FormLabel>
                        <FormControl>
                          <MediaPickerField
                            value={field.value}
                            onChange={field.onChange}
                            disabled={isPending}
                            aspectRatio="wide"
                            defaultUsage="SITE"
                            alt="OGP画像"
                            recommendedSize="1200×630px（横長 1.91:1）"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>
              </div>
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
