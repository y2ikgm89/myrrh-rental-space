"use client";

/**
 * SEO設定セクション
 *
 * メタ情報、Analytics設定、検索エンジン検証の3カード構成。
 * 各カードが独立した `useActionState` + `useForm` (conform) を持つ。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SelectionBox,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import {
  updateMetaSettings,
  updateAnalyticsSettings,
  updateSearchVerification,
} from "@/admin/actions/settings";
import {
  metaFormSchema,
  analyticsFormSchema,
  searchVerificationFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-seo-analytics";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { AnalyticsType } from "@/shared/lib/validations/enums/prisma-types";

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

// =============================================================================
// MetaSettingsCard
// =============================================================================

function MetaSettingsCard({ settings }: SeoSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateMetaSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "seo-meta-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: metaFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      defaultMetaDescription: settings.defaultMetaDescription ?? "",
      defaultMetaKeywords: settings.defaultMetaKeywords ?? "",
      defaultOgpTitle: settings.defaultOgpTitle ?? "",
      defaultOgpDescription: settings.defaultOgpDescription ?? "",
    },
  });

  const metaDescriptionControl = useInputControl(fields.defaultMetaDescription);
  const metaDescriptionLength = (metaDescriptionControl.value ?? "").length;

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("メタ情報を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>メタ情報設定</CardTitle>
          <CardDescription>
            検索エンジンやSNSシェア時に表示される情報を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.defaultMetaDescription.id}>
              デフォルトメタディスクリプション
            </Label>
            <Textarea
              {...getTextareaProps(fields.defaultMetaDescription)}
              placeholder="サイトのデフォルト説明文（160文字以内推奨）"
              rows={2}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              現在 {metaDescriptionLength} 文字（推奨: 120〜160文字）
            </p>
            {fields.defaultMetaDescription.errors && (
              <p
                id={fields.defaultMetaDescription.errorId}
                className="text-sm text-destructive"
              >
                {fields.defaultMetaDescription.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.defaultMetaKeywords.id}>
              デフォルトメタキーワード
            </Label>
            <Input
              {...getInputProps(fields.defaultMetaKeywords, { type: "text" })}
              placeholder="レンタルスペース, 会議室, イベント会場"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">カンマ区切りで入力</p>
            {fields.defaultMetaKeywords.errors && (
              <p
                id={fields.defaultMetaKeywords.errorId}
                className="text-sm text-destructive"
              >
                {fields.defaultMetaKeywords.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.defaultOgpTitle.id}>OGPタイトル</Label>
              <Input
                {...getInputProps(fields.defaultOgpTitle, { type: "text" })}
                placeholder="サイト名 | キャッチコピー"
                disabled={isPending}
              />
              {fields.defaultOgpTitle.errors && (
                <p
                  id={fields.defaultOgpTitle.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.defaultOgpTitle.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.defaultOgpDescription.id}>OGP説明</Label>
              <Input
                {...getInputProps(fields.defaultOgpDescription, {
                  type: "text",
                })}
                placeholder="SNSシェア時の説明文"
                disabled={isPending}
              />
              {fields.defaultOgpDescription.errors && (
                <p
                  id={fields.defaultOgpDescription.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.defaultOgpDescription.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <SubmitButton
              isPending={isPending}
              label="メタ情報を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

// =============================================================================
// AnalyticsSettingsCard
// =============================================================================

function AnalyticsSettingsCard({ settings }: SeoSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateAnalyticsSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "seo-analytics-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: analyticsFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      analyticsType: settings.analyticsType ?? "none",
      googleAnalyticsId: settings.googleAnalyticsId ?? "",
      googleTagManagerId: settings.googleTagManagerId ?? "",
      gaPropertyId: settings.gaPropertyId ?? "",
      microsoftClarityId: settings.microsoftClarityId ?? "",
    },
  });

  const analyticsTypeControl = useInputControl(fields.analyticsType);
  const analyticsType = analyticsTypeControl.value ?? "none";

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("Analytics設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <form {...getFormProps(form)} action={action}>
      <input
        type="hidden"
        name={fields.analyticsType.name}
        value={analyticsType}
      />

      <Card>
        <CardHeader>
          <CardTitle>Analytics設定</CardTitle>
          <CardDescription>
            Google AnalyticsまたはGoogle Tag Managerを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.analyticsType.id}>トラッキング方式</Label>
            <SelectionBox
              options={ANALYTICS_TYPE_OPTIONS}
              value={analyticsType}
              onChange={(value) => analyticsTypeControl.change(value)}
              columns={3}
              disabled={isPending}
              name="トラッキング方式"
              ariaDescribedBy={
                fields.analyticsType.errors
                  ? fields.analyticsType.errorId
                  : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              GA4とGTMは排他選択です。GTM経由でGA4を使う場合はGTMを選択してください。
            </p>
            {fields.analyticsType.errors && (
              <p
                id={fields.analyticsType.errorId}
                className="text-sm text-destructive"
              >
                {fields.analyticsType.errors.join(", ")}
              </p>
            )}
          </div>

          {analyticsType === AnalyticsType.ga4 && (
            <div className="space-y-2">
              <Label htmlFor={fields.googleAnalyticsId.id}>
                GA4 Measurement ID
              </Label>
              <Input
                {...getInputProps(fields.googleAnalyticsId, { type: "text" })}
                placeholder="G-XXXXXXXXXX"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                GA4管理画面 &gt; データストリーム &gt; 測定IDから取得
              </p>
              {fields.googleAnalyticsId.errors && (
                <p
                  id={fields.googleAnalyticsId.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.googleAnalyticsId.errors.join(", ")}
                </p>
              )}
            </div>
          )}

          {analyticsType === AnalyticsType.gtm && (
            <div className="space-y-2">
              <Label htmlFor={fields.googleTagManagerId.id}>
                GTM Container ID
              </Label>
              <Input
                {...getInputProps(fields.googleTagManagerId, { type: "text" })}
                placeholder="GTM-XXXXXXX"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                GTM管理画面のコンテナIDから取得
              </p>
              {fields.googleTagManagerId.errors && (
                <p
                  id={fields.googleTagManagerId.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.googleTagManagerId.errors.join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 border-t pt-2">
            <Label htmlFor={fields.gaPropertyId.id}>
              GA4 プロパティID（ダッシュボード統計用）
            </Label>
            <Input
              {...getInputProps(fields.gaPropertyId, { type: "text" })}
              placeholder="123456789"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              GA4管理画面 &gt; プロパティ設定 &gt;
              プロパティIDから取得（数値のみ）。
              ダッシュボードでのアクセス解析表示に必要です。
            </p>
            {fields.gaPropertyId.errors && (
              <p
                id={fields.gaPropertyId.errorId}
                className="text-sm text-destructive"
              >
                {fields.gaPropertyId.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t pt-2">
            <Label htmlFor={fields.microsoftClarityId.id}>
              Microsoft Clarity プロジェクトID
            </Label>
            <Input
              {...getInputProps(fields.microsoftClarityId, { type: "text" })}
              placeholder="abcd1234ef"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Microsoft
              Clarity（無料・GDPR対応）のヒートマップ・セッション録画を有効化します。
              Clarity管理画面 &gt; Settings &gt; Setup &gt; Project IDから取得。
              GA4/GTM とは独立して並行動作します。
            </p>
            {fields.microsoftClarityId.errors && (
              <p
                id={fields.microsoftClarityId.errorId}
                className="text-sm text-destructive"
              >
                {fields.microsoftClarityId.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <SubmitButton
              isPending={isPending}
              label="Analytics設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

// =============================================================================
// SearchVerificationCard
// =============================================================================

function SearchVerificationCard({ settings }: SeoSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateSearchVerification,
    undefined,
  );

  const [form, fields] = useForm({
    id: "seo-search-verification",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: searchVerificationFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      googleSearchConsoleId: settings.googleSearchConsoleId ?? "",
      bingWebmasterToolsId: settings.bingWebmasterToolsId ?? "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("検索エンジン検証を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>検索エンジン検証</CardTitle>
          <CardDescription>
            Google Search ConsoleやBing Webmaster
            Toolsの所有権確認用メタタグを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fields.googleSearchConsoleId.id}>
              Google Search Console
            </Label>
            <Input
              {...getInputProps(fields.googleSearchConsoleId, {
                type: "text",
              })}
              placeholder="verification-code-here"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              &lt;meta name=&quot;google-site-verification&quot;
              content=&quot;...&quot; /&gt; のcontent属性値を入力
            </p>
            {fields.googleSearchConsoleId.errors && (
              <p
                id={fields.googleSearchConsoleId.errorId}
                className="text-sm text-destructive"
              >
                {fields.googleSearchConsoleId.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.bingWebmasterToolsId.id}>
              Bing Webmaster Tools
            </Label>
            <Input
              {...getInputProps(fields.bingWebmasterToolsId, { type: "text" })}
              placeholder="verification-code-here"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              &lt;meta name=&quot;msvalidate.01&quot; content=&quot;...&quot;
              /&gt; のcontent属性値を入力
            </p>
            {fields.bingWebmasterToolsId.errors && (
              <p
                id={fields.bingWebmasterToolsId.errorId}
                className="text-sm text-destructive"
              >
                {fields.bingWebmasterToolsId.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <SubmitButton
              isPending={isPending}
              label="検索エンジン検証を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
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
