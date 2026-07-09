"use client";

/**
 * リストページ用SEO設定フォーム
 *
 * ブログ一覧・お知らせ一覧など、リストページのSEO/OGP設定を編集するフォーム。
 * への clean break 移行。`updatePageSeo` は `slug` を bind で部分適用。
 */

import Image from "next/image";
import { useActionState, useEffect } from "react";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { IconPhotoPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
  SubmitButton,
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { updatePageSeoSchema } from "@/shared/lib/validations/page";
import { updatePageSeo } from "@/admin/actions/pages";

interface SeoData {
  title: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
}

interface ListPageSeoFormProps {
  /** ページスラッグ（'posts' / 'news' / 'faq' など） */
  slug: "posts" | "news" | "faq";
  /** 現在のSEO設定 */
  seoData: SeoData;
}

export function ListPageSeoForm({ slug, seoData }: ListPageSeoFormProps) {
  const router = useRouter();
  const boundAction = updatePageSeo.bind(null, slug);
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `list-page-seo-${slug}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updatePageSeoSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      title: seoData.title,
      metaDescription: seoData.metaDescription || "",
      metaKeywords: seoData.metaKeywords || "",
      ogpTitle: seoData.ogpTitle || "",
      ogpDescription: seoData.ogpDescription || "",
      ogpImageUrl: seoData.ogpImageUrl || "",
    },
  });

  const ogpImageUrlControl = useInputControl(fields.ogpImageUrl);
  const ogpImageUrl = ogpImageUrlControl.value ?? "";

  const ogpPicker = useSingleMediaPicker({
    accept: "image",
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
            <Label htmlFor={fields.title.id}>ページタイトル *</Label>
            <Input
              {...getInputProps(fields.title, { type: "text" })}
              placeholder="ページタイトル"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              検索結果やブラウザタブに表示されるタイトル（推奨: 30-60文字）
            </p>
            {fields.title.errors && (
              <p id={fields.title.errorId} className="text-sm text-destructive">
                {fields.title.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.metaDescription.id}>
              メタディスクリプション
            </Label>
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
            <Label htmlFor={fields.ogpTitle.id}>OGPタイトル</Label>
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
            <Label htmlFor={fields.ogpDescription.id}>OGP説明文</Label>
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
                  <IconPhotoPlus className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  id={fields.ogpImageUrl.id}
                  aria-describedby={
                    fields.ogpImageUrl.errors
                      ? fields.ogpImageUrl.errorId
                      : undefined
                  }
                  onClick={() => ogpPicker.openPicker()}
                  disabled={isPending}
                >
                  <IconPhotoPlus className="mr-1 h-3 w-3" />
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
                      onClick={() => ogpImageUrlControl.change("")}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  </>
                )}
              </div>
            </div>
            <input
              type="hidden"
              name={fields.ogpImageUrl.name}
              value={ogpImageUrl}
            />
            <p className="text-xs text-muted-foreground">
              推奨サイズ: 1200x630px
            </p>
            {fields.ogpImageUrl.errors && (
              <p
                id={fields.ogpImageUrl.errorId}
                className="text-sm text-destructive"
              >
                {fields.ogpImageUrl.errors.join(", ")}
              </p>
            )}
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
      <div className="flex justify-end">
        <SubmitButton isPending={isPending} label="保存" />
      </div>

      {/* メディアピッカーダイアログ */}
      {ogpPicker.mediaPickerDialog}
    </form>
  );
}
