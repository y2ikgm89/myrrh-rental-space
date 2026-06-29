"use client";

/**
 * ページSEO編集フォーム
 *
 * への clean break 移行。`updatePageSeo` は `page.slug` を bind で部分適用。
 *
 * - 基本SEO設定 / OGP設定 を「フォーム左 / ライブプレビュー右」で表示
 *   (Sanity Studio / Mailchimp / Stripe Dashboard / Webflow CMS 準拠)
 * - 文字数カウントは `useInputControl().value` を直接購読 (リアクティブ)
 * - OGP 画像は `useSingleMediaPicker` + `useInputControl` で sync
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { IconPhotoPlus, IconDeviceFloppy } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Textarea,
  Label,
  CharCount,
  SubmitButton,
} from "@/admin/components/ui";
import { SerpPreview } from "@/admin/components/seo/SerpPreview";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { updatePageSeoSchema } from "@/shared/lib/validations/page";
import { updatePageSeo } from "@/admin/actions/pages";

interface PageSeoData {
  slug: string;
  title: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
}

interface PageSeoFormProps {
  page: PageSeoData;
}

export function PageSeoForm({ page }: PageSeoFormProps) {
  const router = useRouter();
  const boundAction = updatePageSeo.bind(null, page.slug);
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `page-seo-${page.slug}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updatePageSeoSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      title: page.title,
      metaDescription: page.metaDescription || "",
      metaKeywords: page.metaKeywords || "",
      ogpTitle: page.ogpTitle || "",
      ogpDescription: page.ogpDescription || "",
      ogpImageUrl: page.ogpImageUrl || "",
    },
  });

  const titleControl = useInputControl(fields.title);
  const metaDescriptionControl = useInputControl(fields.metaDescription);
  const ogpTitleControl = useInputControl(fields.ogpTitle);
  const ogpDescriptionControl = useInputControl(fields.ogpDescription);
  const ogpImageUrlControl = useInputControl(fields.ogpImageUrl);

  const watchedTitle = titleControl.value ?? "";
  const watchedMetaDescription = metaDescriptionControl.value ?? "";
  const watchedOgpTitle = ogpTitleControl.value ?? "";
  const watchedOgpDescription = ogpDescriptionControl.value ?? "";
  const ogpImageUrl = ogpImageUrlControl.value ?? "";

  const ogpPicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        ogpImageUrlControl.change(selected.url);
      }
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("SEO設定を更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      {/* 基本SEO設定 — フォーム左 / SERP プレビュー右 */}
      <Card>
        <CardHeader>
          <CardTitle>基本SEO設定</CardTitle>
          <CardDescription>
            検索エンジンに表示されるタイトルと説明文
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={fields.title.id}>ページタイトル *</Label>
                  <CharCount current={watchedTitle.length} max={60} />
                </div>
                <Input
                  {...getInputProps(fields.title, { type: "text" })}
                  placeholder="ページタイトル"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  検索結果やブラウザタブに表示されるタイトル（推奨:
                  30-60文字、上限200文字）
                </p>
                {fields.title.errors && (
                  <p
                    id={fields.title.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.title.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={fields.metaDescription.id}>
                    メタディスクリプション
                  </Label>
                  <CharCount
                    current={watchedMetaDescription.length}
                    max={160}
                  />
                </div>
                <Textarea
                  {...getTextareaProps(fields.metaDescription)}
                  placeholder="ページの説明文を入力..."
                  rows={3}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  検索結果に表示される説明文（推奨: 120-160文字）
                </p>
                {fields.metaDescription.errors && (
                  <p
                    id={fields.metaDescription.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.metaDescription.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.metaKeywords.id}>メタキーワード</Label>
                <Input
                  {...getInputProps(fields.metaKeywords, { type: "text" })}
                  placeholder="キーワード1, キーワード2, キーワード3"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  カンマ区切りでキーワードを入力（SEO効果は限定的）
                </p>
                {fields.metaKeywords.errors && (
                  <p
                    id={fields.metaKeywords.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.metaKeywords.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                検索結果プレビュー
              </p>
              <div className="lg:sticky lg:top-6">
                <SerpPreview
                  title={watchedTitle}
                  description={watchedMetaDescription}
                  slug={page.slug}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OGP設定 — フォーム左 / SNS プレビュー右 */}
      <Card>
        <CardHeader>
          <CardTitle>OGP設定</CardTitle>
          <CardDescription>SNSでシェアされた際に表示される情報</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={fields.ogpTitle.id}>OGPタイトル</Label>
                  <CharCount current={watchedOgpTitle.length} max={100} />
                </div>
                <Input
                  {...getInputProps(fields.ogpTitle, { type: "text" })}
                  placeholder="SNSシェア用タイトル（空欄時はページタイトルを使用）"
                  disabled={isPending}
                />
                {fields.ogpTitle.errors && (
                  <p
                    id={fields.ogpTitle.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.ogpTitle.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={fields.ogpDescription.id}>OGP説明文</Label>
                  <CharCount current={watchedOgpDescription.length} max={200} />
                </div>
                <Textarea
                  {...getTextareaProps(fields.ogpDescription)}
                  placeholder="SNSシェア用説明文（空欄時はメタディスクリプションを使用）"
                  rows={2}
                  disabled={isPending}
                />
                {fields.ogpDescription.errors && (
                  <p
                    id={fields.ogpDescription.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.ogpDescription.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.ogpImageUrl.id}>OGP画像</Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    id={fields.ogpImageUrl.id}
                    onClick={() => ogpPicker.openPicker()}
                    disabled={isPending}
                  >
                    <IconPhotoPlus className="mr-1 h-3 w-3" />
                    画像を選択
                  </Button>
                  {ogpImageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => ogpImageUrlControl.change("")}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  )}
                </div>
                <input
                  type="hidden"
                  name={fields.ogpImageUrl.name}
                  value={ogpImageUrl}
                />
                {ogpImageUrl && (
                  <p className="truncate text-xs text-muted-foreground">
                    {ogpImageUrl}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  推奨サイズ: 1200x630px
                </p>
                {fields.ogpImageUrl.errors && (
                  <p className="text-sm text-destructive">
                    {fields.ogpImageUrl.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                SNSシェアプレビュー
              </p>
              <div className="lg:sticky lg:top-6">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative aspect-[1200/630] w-full bg-muted">
                    {ogpImageUrl ? (
                      <Image
                        src={ogpImageUrl}
                        alt="OGP プレビュー"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <IconPhotoPlus className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-sm font-medium">
                      {watchedOgpTitle || watchedTitle || "OGPタイトル"}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {watchedOgpDescription ||
                        watchedMetaDescription ||
                        "OGP説明文"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {formErrors && formErrors.length > 0 && (
        <div
          id={form.errorId}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {formErrors.join(", ")}
        </div>
      )}

      {/* 送信ボタン */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <SubmitButton
          isPending={isPending}
          label="保存"
          pendingLabel="保存中..."
        >
          <>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            保存
          </>
        </SubmitButton>
      </div>

      {ogpPicker.mediaPickerDialog}
    </form>
  );
}
