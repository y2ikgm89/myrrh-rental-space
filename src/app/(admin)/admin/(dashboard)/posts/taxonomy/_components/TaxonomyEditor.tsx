"use client";

/**
 * TaxonomyEditor - カテゴリ・タグ共通エディター
 *
 * 通常の管理画面内で表示されるシンプルなフォーム
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import { IconArrowLeft, IconExternalLink, IconPhoto, IconDeviceFloppy, IconTrash } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import {
  updatePostCategory,
  updatePostTag,
  deletePostCategory,
  deletePostTag,
} from "@/admin/actions/post";
import type {
  PostCategoryData,
  PostTagData,
} from "@/shared/domain/posts/types";
import type { SelectedMedia } from "@/admin/types/media-picker";
import { isMutationError } from "@/shared/lib/mutation-result";
import { generateSlug } from "@/shared/lib/utils";

// =============================================================================
// Schema
// =============================================================================

const baseTaxonomySchema = z.object({
  name: z.string().min(1).max(50),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
  description: z.string().max(500).optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  ogpImageUrl: z.string().optional(),
});

const categoryFormSchema = baseTaxonomySchema.extend({
  name: z
    .string()
    .min(1, { error: "カテゴリ名は必須です" })
    .max(50, { error: "カテゴリ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
  order: z.number().int().min(0),
});

const tagFormSchema = baseTaxonomySchema.extend({
  name: z
    .string()
    .min(1, { error: "タグ名は必須です" })
    .max(50, { error: "タグ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
});

type CategoryFormData = z.infer<typeof categoryFormSchema>;
type TagFormData = z.infer<typeof tagFormSchema>;

// =============================================================================
// Types
// =============================================================================

type CategoryEditorProps = {
  type: "category";
  data: PostCategoryData;
};

type TagEditorProps = {
  type: "tag";
  data: PostTagData;
};

type TaxonomyEditorProps = CategoryEditorProps | TagEditorProps;

// =============================================================================
// Config
// =============================================================================

const CONFIG = {
  category: {
    label: "カテゴリ",
    urlPrefix: "/posts/category/",
    backUrl: "/admin/posts?tab=categories",
  },
  tag: {
    label: "タグ",
    urlPrefix: "/posts/tag/",
    backUrl: "/admin/posts?tab=tags",
  },
} satisfies Record<
  string,
  { label: string; urlPrefix: string; backUrl: string }
>;

// =============================================================================
// Component
// =============================================================================

export function TaxonomyEditor(props: TaxonomyEditorProps) {
  if (props.type === "category") {
    return <CategoryEditorImpl data={props.data} />;
  }
  return <TagEditorImpl data={props.data} />;
}

// =============================================================================
// CategoryEditorImpl
// =============================================================================

function CategoryEditorImpl({ data }: { data: PostCategoryData }) {
  const config = CONFIG.category;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<CategoryFormData>({
    resolver: standardSchemaResolver(categoryFormSchema),
    defaultValues: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? "",
      order: data.order,
      metaTitle: data.metaTitle ?? "",
      metaDescription: data.metaDescription ?? "",
      ogpImageUrl: data.ogpImageUrl ?? "",
    },
  });

  const ogpImageUrl = useWatch({ control, name: "ogpImageUrl" });
  const currentSlug = useWatch({ control, name: "slug" });
  const metaTitle = useWatch({ control, name: "metaTitle" });
  const metaDescription = useWatch({ control, name: "metaDescription" });
  const description = useWatch({ control, name: "description" });
  const postCount = data._count.posts;

  const mediaPicker = useSingleMediaPicker({
    defaultUsage: "POST",
    onSelect: (media: SelectedMedia[]) => {
      const selected = media[0];
      if (selected) {
        setValue("ogpImageUrl", selected.url, { shouldDirty: true });
      }
    },
  });

  const handleClearOgpImage = () => {
    setValue("ogpImageUrl", "", { shouldDirty: true });
  };

  const handleGenerateSlug = () => {
    const name = getValues("name");
    if (name) {
      const slug = generateSlug(name, "category");
      setValue("slug", slug, { shouldDirty: true });
    }
  };

  const handleBack = () => {
    router.push(config.backUrl);
  };

  const onSubmit = (formData: CategoryFormData) => {
    startTransition(async () => {
      const result = await updatePostCategory(data.id, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        order: formData.order,
        metaTitle: formData.metaTitle || null,
        metaDescription: formData.metaDescription || null,
        ogpImageUrl: formData.ogpImageUrl || null,
      });

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      reset(formData);
      router.refresh();
      toast.success(`${config.label}を更新しました`);
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePostCategory(data.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`${config.label}を削除しました`);
      router.push(config.backUrl);
    });
  };

  const archiveUrl = `${config.urlPrefix}${currentSlug}`;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="sm" onClick={handleBack}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {data.name}
              </h1>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {postCount}件の投稿
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{archiveUrl}</span>
              <a
                href={archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                <IconExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <IconTrash className="mr-2 h-4 w-4" />
                削除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{config.label}を削除しますか？</DialogTitle>
                <DialogDescription>
                  {postCount > 0 ? (
                    <>
                      この{config.label}には{postCount}
                      件の投稿が紐づいています。
                      削除すると、投稿との紐づけが解除されます。
                    </>
                  ) : (
                    <>この操作は取り消せません。</>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  {isPending ? "削除中..." : "削除"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={isPending || !isDirty}
          >
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-2"
      >
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{config.label}名 *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder={`${config.label}名`}
                disabled={isPending}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="slug">スラッグ *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateSlug}
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
                <p className="text-sm text-destructive">
                  {errors.slug.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder={`${config.label}の説明`}
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

        {/* SEO・OGP設定 */}
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

          <Card>
            <CardHeader>
              <CardTitle>OGP設定</CardTitle>
              <p className="text-sm text-muted-foreground">
                SNSでシェアされた時の表示設定
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* OGPプレビュー */}
              <div className="space-y-2">
                <Label>プレビュー</Label>
                <div className="overflow-hidden rounded-lg border bg-card">
                  {/* 画像エリア (1.91:1 アスペクト比) */}
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
                            onClick={handleClearOgpImage}
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
                  {/* テキストエリア */}
                  <div className="space-y-1 p-3">
                    <p className="text-xs text-muted-foreground">example.com</p>
                    <p className="font-medium line-clamp-1">
                      {metaTitle || data.name}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {metaDescription ||
                        description ||
                        `${data.name}の記事一覧`}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      {mediaPicker.mediaPickerDialog}
    </div>
  );
}

// =============================================================================
// TagEditorImpl
// =============================================================================

function TagEditorImpl({ data }: { data: PostTagData }) {
  const config = CONFIG.tag;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<TagFormData>({
    resolver: standardSchemaResolver(tagFormSchema),
    defaultValues: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? "",
      metaTitle: data.metaTitle ?? "",
      metaDescription: data.metaDescription ?? "",
      ogpImageUrl: data.ogpImageUrl ?? "",
    },
  });

  const ogpImageUrl = useWatch({ control, name: "ogpImageUrl" });
  const currentSlug = useWatch({ control, name: "slug" });
  const metaTitle = useWatch({ control, name: "metaTitle" });
  const metaDescription = useWatch({ control, name: "metaDescription" });
  const description = useWatch({ control, name: "description" });
  const postCount = data._count.posts;

  const mediaPicker = useSingleMediaPicker({
    defaultUsage: "POST",
    onSelect: (media: SelectedMedia[]) => {
      const selected = media[0];
      if (selected) {
        setValue("ogpImageUrl", selected.url, { shouldDirty: true });
      }
    },
  });

  const handleClearOgpImage = () => {
    setValue("ogpImageUrl", "", { shouldDirty: true });
  };

  const handleGenerateSlug = () => {
    const name = getValues("name");
    if (name) {
      const slug = generateSlug(name, "tag");
      setValue("slug", slug, { shouldDirty: true });
    }
  };

  const handleBack = () => {
    router.push(config.backUrl);
  };

  const onSubmit = (formData: TagFormData) => {
    startTransition(async () => {
      const result = await updatePostTag(data.id, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        metaTitle: formData.metaTitle || null,
        metaDescription: formData.metaDescription || null,
        ogpImageUrl: formData.ogpImageUrl || null,
      });

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      reset(formData);
      router.refresh();
      toast.success(`${config.label}を更新しました`);
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePostTag(data.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`${config.label}を削除しました`);
      router.push(config.backUrl);
    });
  };

  const archiveUrl = `${config.urlPrefix}${currentSlug}`;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="sm" onClick={handleBack}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {data.name}
              </h1>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {postCount}件の投稿
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{archiveUrl}</span>
              <a
                href={archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                <IconExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <IconTrash className="mr-2 h-4 w-4" />
                削除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{config.label}を削除しますか？</DialogTitle>
                <DialogDescription>
                  {postCount > 0 ? (
                    <>
                      この{config.label}には{postCount}
                      件の投稿が紐づいています。
                      削除すると、投稿との紐づけが解除されます。
                    </>
                  ) : (
                    <>この操作は取り消せません。</>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  {isPending ? "削除中..." : "削除"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={isPending || !isDirty}
          >
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-2"
      >
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{config.label}名 *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder={`${config.label}名`}
                disabled={isPending}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="slug">スラッグ *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateSlug}
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
                <p className="text-sm text-destructive">
                  {errors.slug.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder={`${config.label}の説明`}
                rows={3}
                disabled={isPending}
              />
            </div>
          </CardContent>
        </Card>

        {/* SEO・OGP設定 */}
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

          <Card>
            <CardHeader>
              <CardTitle>OGP設定</CardTitle>
              <p className="text-sm text-muted-foreground">
                SNSでシェアされた時の表示設定
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* OGPプレビュー */}
              <div className="space-y-2">
                <Label>プレビュー</Label>
                <div className="overflow-hidden rounded-lg border bg-card">
                  {/* 画像エリア (1.91:1 アスペクト比) */}
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
                            onClick={handleClearOgpImage}
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
                  {/* テキストエリア */}
                  <div className="space-y-1 p-3">
                    <p className="text-xs text-muted-foreground">example.com</p>
                    <p className="font-medium line-clamp-1">
                      {metaTitle || data.name}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {metaDescription ||
                        description ||
                        `${data.name}の記事一覧`}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      {mediaPicker.mediaPickerDialog}
    </div>
  );
}
