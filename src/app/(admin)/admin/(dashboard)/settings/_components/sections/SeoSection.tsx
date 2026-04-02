"use client";

/**
 * SEO設定セクション
 *
 * メタ情報、Analytics設定、検索エンジン検証の3カード構成
 * 各カードが独立したフォームと保存ボタンを持つ
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
  SelectionBox,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateMetaSettings,
  updateAnalyticsSettings,
  updateSearchVerification,
} from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import {
  metaFormSchema,
  analyticsFormSchema,
  searchVerificationFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-seo-analytics";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { AnalyticsType } from "@generated/prisma/enums";
import { isValidAnalyticsType } from "@/shared/lib/validations/enums/guards";

interface SeoSectionProps {
  settings: Serialized<SettingsData>;
}

const ANALYTICS_TYPE_OPTIONS = [
  {
    value: "ga4",
    label: "Google Analytics 4 (GA4)",
    description: "Googleアナリティクス4を使用",
  },
  {
    value: "gtm",
    label: "Google Tag Manager (GTM)",
    description: "タグマネージャー経由で管理",
  },
  { value: "none", label: "無効", description: "トラッキングを無効化" },
];

function MetaSettingsCard({ settings }: SeoSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    metaFormSchema,
    (data) =>
      updateMetaSettings({
        defaultMetaDescription: emptyToNull(data.defaultMetaDescription),
        defaultMetaKeywords: emptyToNull(data.defaultMetaKeywords),
        defaultOgpTitle: emptyToNull(data.defaultOgpTitle),
        defaultOgpDescription: emptyToNull(data.defaultOgpDescription),
      }),
    {
      defaultValues: {
        defaultMetaDescription: settings.defaultMetaDescription || "",
        defaultMetaKeywords: settings.defaultMetaKeywords || "",
        defaultOgpTitle: settings.defaultOgpTitle || "",
        defaultOgpDescription: settings.defaultOgpDescription || "",
      },
      refresh: true,
      successMessage: "メタ情報を保存しました",
    },
  );

  const metaDescriptionValue = useWatch({
    control: form.control,
    name: "defaultMetaDescription",
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>メタ情報設定</CardTitle>
            <CardDescription>
              検索エンジンやSNSシェア時に表示される情報を設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="defaultMetaDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>デフォルトメタディスクリプション</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="サイトのデフォルト説明文（160文字以内推奨）"
                      rows={2}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    現在 {metaDescriptionValue.length} 文字（推奨:
                    120〜160文字）
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="defaultMetaKeywords"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>デフォルトメタキーワード</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="レンタルスペース, 会議室, イベント会場"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>カンマ区切りで入力</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="defaultOgpTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OGPタイトル</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="サイト名 | キャッチコピー"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultOgpDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OGP説明</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="SNSシェア時の説明文"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-4">
              <SubmitButton
                isPending={isPending}
                label="メタ情報を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

function AnalyticsSettingsCard({ settings }: SeoSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    analyticsFormSchema,
    (data) =>
      updateAnalyticsSettings({
        analyticsType:
          data.analyticsType !== "none" &&
          isValidAnalyticsType(data.analyticsType)
            ? data.analyticsType
            : null,
        googleAnalyticsId: emptyToNull(data.googleAnalyticsId),
        googleTagManagerId: emptyToNull(data.googleTagManagerId),
        gaPropertyId: emptyToNull(data.gaPropertyId),
      }),
    {
      defaultValues: {
        analyticsType: settings.analyticsType ?? "none",
        googleAnalyticsId: settings.googleAnalyticsId || "",
        googleTagManagerId: settings.googleTagManagerId || "",
        gaPropertyId: settings.gaPropertyId || "",
      },
      refresh: true,
      successMessage: "Analytics設定を保存しました",
    },
  );

  const analyticsType = useWatch({
    control: form.control,
    name: "analyticsType",
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Analytics設定</CardTitle>
            <CardDescription>
              Google AnalyticsまたはGoogle Tag Managerを設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="analyticsType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>トラッキング方式</FormLabel>
                  <FormControl>
                    <SelectionBox
                      options={ANALYTICS_TYPE_OPTIONS}
                      value={field.value ?? "none"}
                      onChange={(value) => field.onChange(value)}
                      columns={3}
                      disabled={isPending}
                      name="トラッキング方式"
                    />
                  </FormControl>
                  <FormDescription>
                    GA4とGTMは排他選択です。GTM経由でGA4を使う場合はGTMを選択してください。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {analyticsType === AnalyticsType.ga4 && (
              <FormField
                control={form.control}
                name="googleAnalyticsId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GA4 Measurement ID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="G-XXXXXXXXXX"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      GA4管理画面 &gt; データストリーム &gt; 測定IDから取得
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {analyticsType === AnalyticsType.gtm && (
              <FormField
                control={form.control}
                name="googleTagManagerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GTM Container ID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="GTM-XXXXXXX"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      GTM管理画面のコンテナIDから取得
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="gaPropertyId"
              render={({ field }) => (
                <FormItem className="pt-2 border-t">
                  <FormLabel>
                    GA4 プロパティID（ダッシュボード統計用）
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="123456789"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    GA4管理画面 &gt; プロパティ設定 &gt;
                    プロパティIDから取得（数値のみ）。
                    ダッシュボードでのアクセス解析表示に必要です。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <SubmitButton
                isPending={isPending}
                label="Analytics設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

function SearchVerificationCard({ settings }: SeoSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    searchVerificationFormSchema,
    (data) =>
      updateSearchVerification({
        googleSearchConsoleId: emptyToNull(data.googleSearchConsoleId),
        bingWebmasterToolsId: emptyToNull(data.bingWebmasterToolsId),
      }),
    {
      defaultValues: {
        googleSearchConsoleId: settings.googleSearchConsoleId || "",
        bingWebmasterToolsId: settings.bingWebmasterToolsId || "",
      },
      refresh: true,
      successMessage: "検索エンジン検証を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>検索エンジン検証</CardTitle>
            <CardDescription>
              Google Search ConsoleやBing Webmaster
              Toolsの所有権確認用メタタグを設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="googleSearchConsoleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google Search Console</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="verification-code-here"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    &lt;meta name=&quot;google-site-verification&quot;
                    content=&quot;...&quot; /&gt; のcontent属性値を入力
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bingWebmasterToolsId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bing Webmaster Tools</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="verification-code-here"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    &lt;meta name=&quot;msvalidate.01&quot;
                    content=&quot;...&quot; /&gt; のcontent属性値を入力
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <SubmitButton
                isPending={isPending}
                label="検索エンジン検証を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

export function SeoSection({ settings }: SeoSectionProps) {
  return (
    <div className="space-y-6">
      <MetaSettingsCard settings={settings} />
      <AnalyticsSettingsCard settings={settings} />
      <SearchVerificationCard settings={settings} />
    </div>
  );
}
