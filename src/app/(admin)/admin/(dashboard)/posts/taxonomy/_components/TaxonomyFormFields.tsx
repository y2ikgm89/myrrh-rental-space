"use client";

import type { Control, UseFormRegister, FieldErrors } from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/admin/components/ui";
import { IconPhoto } from "@tabler/icons-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import type { SelectedMedia } from "@/admin/types/media-picker";
import type { CategoryFormData, TagFormData } from "./taxonomy-schema";

// =============================================================================
// OGP image preview + picker (shared, display-only)
// =============================================================================

type OgpImagePickerProps = {
  ogpImageUrl: string | undefined;
  metaTitle: string | undefined;
  metaDescription: string | undefined;
  description: string | undefined;
  entityName: string;
  isPending: boolean;
  onSetUrl: (url: string) => void;
};

function OgpImagePicker({
  ogpImageUrl,
  metaTitle,
  metaDescription,
  description,
  entityName,
  isPending,
  onSetUrl,
}: OgpImagePickerProps) {
  const mediaPicker = useSingleMediaPicker({
    defaultUsage: "POST",
    onSelect: (media: SelectedMedia[]) => {
      const selected = media[0];
      if (selected) {
        onSetUrl(selected.url);
      }
    },
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>OGP設定</CardTitle>
          <p className="text-sm text-muted-foreground">
            SNSでシェアされた時の表示設定
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>プレビュー</Label>
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="relative aspect-[1.91/1] bg-muted">
                {ogpImageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ogpImageUrl}
                      alt="OGP画像プレビュー"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-all hover:bg-overlay hover:opacity-100">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => mediaPicker.openPicker()}
                        disabled={isPending}
                      >
                        変更
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onSetUrl("")}
                        disabled={isPending}
                      >
                        削除
                      </Button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => mediaPicker.openPicker()}
                    disabled={isPending}
                    className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IconPhoto className="h-8 w-8" />
                    <span className="text-sm">クリックして画像を選択</span>
                    <span className="text-xs">推奨: 1200 × 630px</span>
                  </button>
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="text-xs text-muted-foreground">example.com</p>
                <p className="font-medium line-clamp-1">
                  {metaTitle || entityName}
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {metaDescription || description || `${entityName}の記事一覧`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {mediaPicker.mediaPickerDialog}
    </>
  );
}

// =============================================================================
// Category Form Fields
// =============================================================================

type CategoryFormFieldsProps = {
  control: Control<CategoryFormData>;
  register: UseFormRegister<CategoryFormData>;
  errors: FieldErrors<CategoryFormData>;
  isPending: boolean;
  entityName: string;
  onSetOgpImageUrl: (url: string) => void;
  onGenerateSlug: () => void;
};

export function CategoryFormFields({
  control,
  register,
  errors,
  isPending,
  entityName,
  onSetOgpImageUrl,
  onGenerateSlug,
}: CategoryFormFieldsProps) {
  const ogpImageUrl = useWatch({ control, name: "ogpImageUrl" });
  const metaTitle = useWatch({ control, name: "metaTitle" });
  const metaDescription = useWatch({ control, name: "metaDescription" });
  const description = useWatch({ control, name: "description" });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">カテゴリ名 *</Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="カテゴリ名"
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="slug">スラッグ *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onGenerateSlug}
                disabled={isPending}
              >
                名前から生成
              </Button>
            </div>
            <Input
              id="slug"
              {...register("slug")}
              placeholder="slug"
              disabled={isPending}
            />
            {errors.slug && (
              <p className="text-sm text-destructive">{errors.slug.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="カテゴリの説明"
              rows={3}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order">表示順</Label>
            <Input
              id="order"
              type="number"
              {...register("order", { valueAsNumber: true })}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              小さい数字が先に表示されます
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>SEO設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="metaTitle">SEOタイトル</Label>
              <Input
                id="metaTitle"
                {...register("metaTitle")}
                placeholder="検索結果に表示されるタイトル"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">70文字以内推奨</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaDescription">メタディスクリプション</Label>
              <Textarea
                id="metaDescription"
                {...register("metaDescription")}
                placeholder="検索結果に表示される説明文"
                rows={3}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">160文字以内推奨</p>
            </div>
          </CardContent>
        </Card>
        <OgpImagePicker
          ogpImageUrl={ogpImageUrl}
          metaTitle={metaTitle}
          metaDescription={metaDescription}
          description={description}
          entityName={entityName}
          isPending={isPending}
          onSetUrl={onSetOgpImageUrl}
        />
      </div>
    </>
  );
}

// =============================================================================
// Tag Form Fields
// =============================================================================

type TagFormFieldsProps = {
  control: Control<TagFormData>;
  register: UseFormRegister<TagFormData>;
  errors: FieldErrors<TagFormData>;
  isPending: boolean;
  entityName: string;
  onSetOgpImageUrl: (url: string) => void;
  onGenerateSlug: () => void;
};

export function TagFormFields({
  control,
  register,
  errors,
  isPending,
  entityName,
  onSetOgpImageUrl,
  onGenerateSlug,
}: TagFormFieldsProps) {
  const ogpImageUrl = useWatch({ control, name: "ogpImageUrl" });
  const metaTitle = useWatch({ control, name: "metaTitle" });
  const metaDescription = useWatch({ control, name: "metaDescription" });
  const description = useWatch({ control, name: "description" });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">タグ名 *</Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="タグ名"
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="slug">スラッグ *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onGenerateSlug}
                disabled={isPending}
              >
                名前から生成
              </Button>
            </div>
            <Input
              id="slug"
              {...register("slug")}
              placeholder="slug"
              disabled={isPending}
            />
            {errors.slug && (
              <p className="text-sm text-destructive">{errors.slug.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="タグの説明"
              rows={3}
              disabled={isPending}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>SEO設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="metaTitle">SEOタイトル</Label>
              <Input
                id="metaTitle"
                {...register("metaTitle")}
                placeholder="検索結果に表示されるタイトル"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">70文字以内推奨</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaDescription">メタディスクリプション</Label>
              <Textarea
                id="metaDescription"
                {...register("metaDescription")}
                placeholder="検索結果に表示される説明文"
                rows={3}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">160文字以内推奨</p>
            </div>
          </CardContent>
        </Card>
        <OgpImagePicker
          ogpImageUrl={ogpImageUrl}
          metaTitle={metaTitle}
          metaDescription={metaDescription}
          description={description}
          entityName={entityName}
          isPending={isPending}
          onSetUrl={onSetOgpImageUrl}
        />
      </div>
    </>
  );
}
