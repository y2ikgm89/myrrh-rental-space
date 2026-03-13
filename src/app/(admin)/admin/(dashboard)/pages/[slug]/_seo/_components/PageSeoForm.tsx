"use client";

/**
 * ページSEO編集フォーム
 *
 * システムページのSEO/OGP設定を編集するフォーム。
 * CharCount / SerpPreview / SNSシェアプレビューを統合。
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { ImagePlus, Save, Loader2 } from "lucide-react";
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

  // リアルタイム監視（CharCount / SerpPreview 用）
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

  // beforeunload protection for unsaved changes
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
      {/* SERP プレビュー */}
      <SerpPreview
        title={watchedTitle}
        description={watchedMetaDescription}
        slug={page.slug}
      />

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle>基本SEO設定</CardTitle>
          <CardDescription>
            検索エンジンに表示されるタイトルと説明文
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="metaDescription">メタディスクリプション</Label>
              <CharCount current={watchedMetaDescription.length} max={160} />
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
        </CardContent>
      </Card>

      {/* OGP設定 */}
      <Card>
        <CardHeader>
          <CardTitle>OGP設定</CardTitle>
          <CardDescription>SNSでシェアされた際に表示される情報</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <div className="flex items-start gap-3">
              {ogpImageUrl ? (
                <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border">
                  <Image
                    src={ogpImageUrl}
                    alt="OGP画像"
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => ogpPicker.openPicker()}
                  disabled={isPending}
                >
                  <ImagePlus className="mr-1 h-3 w-3" />
                  画像を選択
                </Button>
                {ogpImageUrl && (
                  <>
                    <p className="truncate text-xs text-muted-foreground">
                      {ogpImageUrl}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setValue("ogpImageUrl", "")}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              推奨サイズ: 1200x630px
            </p>
            {errors.ogpImageUrl && (
              <p className="text-sm text-destructive">
                {errors.ogpImageUrl.message}
              </p>
            )}
          </div>

          {/* SNS シェアプレビュー */}
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              SNSシェアプレビュー
            </p>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {/* OGP 画像 */}
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
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              {/* テキスト部分 */}
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
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex items-center justify-end gap-4">
        {isDirty && (
          <span className="text-sm text-warning font-medium">
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
        <Button type="submit" disabled={isPending || !isDirty}>
          {isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {isPending ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* メディアピッカーダイアログ */}
      <ogpPicker.MediaPicker />
    </form>
  );
}
