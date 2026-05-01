"use client";

/**
 * ページSEO編集フォーム
 *
 * 業界標準の「フォーム左 / ライブプレビュー右」レイアウト
 * （Sanity Studio / Mailchimp / Stripe Dashboard / Webflow CMS 準拠）。
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { IconPhotoPlus, IconDeviceFloppy } from "@tabler/icons-react";
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
import { updatePageSeo } from "@/admin/actions/page";
import { useFormAction } from "@/admin/hooks/useFormAction";

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

  const { form, isPending, onSubmit } = useFormAction(
    updatePageSeoSchema,
    (data) => updatePageSeo(page.slug, data),
    {
      defaultValues: {
        title: page.title,
        metaDescription: page.metaDescription || "",
        metaKeywords: page.metaKeywords || "",
        ogpTitle: page.ogpTitle || "",
        ogpDescription: page.ogpDescription || "",
        ogpImageUrl: page.ogpImageUrl || "",
      },
      successMessage: "SEO設定を更新しました",
      refresh: true,
    },
  );

  const {
    register,
    setValue,
    control,
    formState: { errors, isDirty },
  } = form;

  const watchedTitle = useWatch({ control, name: "title" }) || "";
  const watchedMetaDescription =
    useWatch({ control, name: "metaDescription" }) || "";
  const watchedOgpTitle = useWatch({ control, name: "ogpTitle" }) || "";
  const watchedOgpDescription =
    useWatch({ control, name: "ogpDescription" }) || "";
  const ogpImageUrl = useWatch({ control, name: "ogpImageUrl" });

  const ogpPicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setValue("ogpImageUrl", selected.url);
      }
    },
  });

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
                  <Label htmlFor="title">ページタイトル *</Label>
                  <CharCount current={watchedTitle.length} max={60} />
                </div>
                <Input
                  id="title"
                  {...register("title")}
                  placeholder="ページタイトル"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  検索結果やブラウザタブに表示されるタイトル（推奨:
                  30-60文字、上限200文字）
                </p>
                {errors.title && (
                  <p className="text-sm text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="metaDescription">
                    メタディスクリプション
                  </Label>
                  <CharCount
                    current={watchedMetaDescription.length}
                    max={160}
                  />
                </div>
                <Textarea
                  id="metaDescription"
                  {...register("metaDescription")}
                  placeholder="ページの説明文を入力..."
                  rows={3}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  検索結果に表示される説明文（推奨: 120-160文字）
                </p>
                {errors.metaDescription && (
                  <p className="text-sm text-destructive">
                    {errors.metaDescription.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="metaKeywords">メタキーワード</Label>
                <Input
                  id="metaKeywords"
                  {...register("metaKeywords")}
                  placeholder="キーワード1, キーワード2, キーワード3"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  カンマ区切りでキーワードを入力（SEO効果は限定的）
                </p>
                {errors.metaKeywords && (
                  <p className="text-sm text-destructive">
                    {errors.metaKeywords.message}
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
                  <Label htmlFor="ogpTitle">OGPタイトル</Label>
                  <CharCount current={watchedOgpTitle.length} max={100} />
                </div>
                <Input
                  id="ogpTitle"
                  {...register("ogpTitle")}
                  placeholder="SNSシェア用タイトル（空欄時はページタイトルを使用）"
                  disabled={isPending}
                />
                {errors.ogpTitle && (
                  <p className="text-sm text-destructive">
                    {errors.ogpTitle.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ogpDescription">OGP説明文</Label>
                  <CharCount current={watchedOgpDescription.length} max={200} />
                </div>
                <Textarea
                  id="ogpDescription"
                  {...register("ogpDescription")}
                  placeholder="SNSシェア用説明文（空欄時はメタディスクリプションを使用）"
                  rows={2}
                  disabled={isPending}
                />
                {errors.ogpDescription && (
                  <p className="text-sm text-destructive">
                    {errors.ogpDescription.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ogpImageUrl">OGP画像</Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    id="ogpImageUrl"
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
                      onClick={() => setValue("ogpImageUrl", "")}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  )}
                </div>
                {ogpImageUrl && (
                  <p className="truncate text-xs text-muted-foreground">
                    {ogpImageUrl}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  推奨サイズ: 1200x630px
                </p>
                {errors.ogpImageUrl && (
                  <p className="text-sm text-destructive">
                    {errors.ogpImageUrl.message}
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

      {/* 送信ボタン */}
      <div className="flex items-center justify-end gap-4">
        {isDirty && (
          <span className="text-sm font-medium text-warning">
            未保存の変更があります
          </span>
        )}
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
          disabled={!isDirty}
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
