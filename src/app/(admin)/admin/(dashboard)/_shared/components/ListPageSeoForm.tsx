"use client";

/**
 * リストページ用SEO設定フォーム
 *
 * ブログ一覧・お知らせ一覧など、リストページのSEO/OGP設定を編集するフォーム
 * Pageテーブルに保存されたSEO設定を更新
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
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
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import {
  updatePageSeoSchema,
  type UpdatePageSeoInput,
} from "@/shared/lib/validations/page";
import { updatePageSeo } from "@/admin/actions/page";
import { isMutationError } from "@/shared/lib/mutation-result";

interface SeoData {
  title: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
}

interface ListPageSeoFormProps {
  /** ページスラッグ（'posts' または 'news'） */
  slug: "posts" | "news";
  /** 現在のSEO設定 */
  seoData: SeoData;
}

export function ListPageSeoForm({ slug, seoData }: ListPageSeoFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<UpdatePageSeoInput>({
    resolver: zodResolver(updatePageSeoSchema),
    defaultValues: {
      title: seoData.title,
      metaDescription: seoData.metaDescription || "",
      metaKeywords: seoData.metaKeywords || "",
      ogpTitle: seoData.ogpTitle || "",
      ogpDescription: seoData.ogpDescription || "",
      ogpImageUrl: seoData.ogpImageUrl || "",
    },
  });

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

  const onSubmit = async (data: UpdatePageSeoInput) => {
    startTransition(async () => {
      const result = await updatePageSeo(slug, data);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("SEO設定を更新しました");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
          <CardDescription>
            検索エンジンに表示されるタイトルと説明文
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">ページタイトル *</Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="ページタイトル"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              検索結果やブラウザタブに表示されるタイトル（推奨: 30-60文字）
            </p>
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="metaDescription">メタディスクリプション</Label>
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
          <CardTitle>SNS共有設定</CardTitle>
          <CardDescription>SNSでシェアされた際に表示される情報</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ogpTitle">OGPタイトル</Label>
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
            <Label htmlFor="ogpDescription">OGP説明文</Label>
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
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* メディアピッカーダイアログ */}
      <ogpPicker.MediaPicker />
    </form>
  );
}
