"use client";

/**
 * TaxonomyEditor
 *
 * `useForm` (RHF + `standardSchemaResolver`) → `useActionState` + `useForm`
 * (@conform-to/react) clean break。Category / Tag は別 `useActionState` を持つ
 * 専用 impl に分離し、共通の OGP preview は内部 subcomponent として保持。
 *
 * - Server Action は `(id, prev, formData)` signature の `updatePostCategoryAction`
 *   / `updatePostTagAction` を `bind` で id 部分適用
 * - OGP 画像は `useSingleMediaPicker` + `useInputControl` で sync
 * - 文字列フィールド値の reactive preview は `useInputControl().value` で購読
 * - 成功時の toast / router.refresh は useEffect 内、`setIsDeleteDialogOpen` 等の
 *   setState は副作用と分離
 * - 削除フローは Server Action 直接呼び出し + `useTransition`（form 経由でないため
 *   conform 化対象外）
 */

import { useActionState, useEffect, useState, useTransition } from "react";
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
  IconExternalLink,
  IconDeviceFloppy,
  IconPhoto,
} from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import type { SelectedMedia } from "@/admin/types/media-picker";
import {
  updatePostCategoryAction,
  updatePostTagAction,
  deletePostCategory,
  deletePostTag,
} from "@/admin/actions/post/taxonomy";
import type {
  PostCategoryData,
  PostTagData,
} from "@/shared/domain/posts/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { generateSlug } from "@/shared/lib/slug";
import type { Route } from "next";
import { categoryFormSchema, tagFormSchema } from "./taxonomy-schema";
import { TaxonomyDeleteDialog } from "./TaxonomyDeleteDialog";

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
    urlPrefix: "/category/",
    backUrl: "/admin/posts?tab=categories",
  },
  tag: {
    label: "タグ",
    urlPrefix: "/tag/",
    backUrl: "/admin/posts?tab=tags",
  },
} satisfies Record<
  string,
  { label: string; urlPrefix: string; backUrl: Route }
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
// OGP Image Preview + Picker
// =============================================================================

type OgpImagePickerProps = {
  ogpImageUrl: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  entityName: string;
  isPending: boolean;
  onPickImage: () => void;
  onClearImage: () => void;
};

function OgpImagePicker({
  ogpImageUrl,
  metaTitle,
  metaDescription,
  description,
  entityName,
  isPending,
  onPickImage,
  onClearImage,
}: OgpImagePickerProps) {
  return (
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
                      onClick={onPickImage}
                      disabled={isPending}
                    >
                      変更
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={onClearImage}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onPickImage}
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
              <p className="line-clamp-1 font-medium">
                {metaTitle || entityName}
              </p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {metaDescription || description || `${entityName}の記事一覧`}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// CategoryEditorImpl
// =============================================================================

function CategoryEditorImpl({ data }: { data: PostCategoryData }) {
  const config = CONFIG.category;
  const router = useRouter();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const boundAction = updatePostCategoryAction.bind(null, data.id);
  const [lastResult, formAction, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `post-category-${data.id}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: categoryFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? "",
      metaTitle: data.metaTitle ?? "",
      metaDescription: data.metaDescription ?? "",
      ogpImageUrl: data.ogpImageUrl ?? "",
    },
  });

  const nameControl = useInputControl(fields.name);
  const slugControl = useInputControl(fields.slug);
  const descriptionControl = useInputControl(fields.description);
  const metaTitleControl = useInputControl(fields.metaTitle);
  const metaDescriptionControl = useInputControl(fields.metaDescription);
  const ogpImageUrlControl = useInputControl(fields.ogpImageUrl);

  const slugValue = slugControl.value ?? "";
  const descriptionValue = descriptionControl.value ?? "";
  const metaTitleValue = metaTitleControl.value ?? "";
  const metaDescriptionValue = metaDescriptionControl.value ?? "";
  const ogpImageUrlValue = ogpImageUrlControl.value ?? "";

  const ogpPicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "POST",
    onSelect: (media: SelectedMedia[]) => {
      const selected = media[0];
      if (selected) {
        ogpImageUrlControl.change(selected.url);
      }
    },
  });

  const handleGenerateSlug = () => {
    const name = nameControl.value ?? "";
    if (name) {
      slugControl.change(generateSlug(name, "category"));
    }
  };

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(`${config.label}を更新しました`);
      router.refresh();
    }
  }, [lastResult, router, config.label]);

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deletePostCategory(data.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`${config.label}を削除しました`);
      router.push(config.backUrl);
    });
  };

  const archiveUrl = `${config.urlPrefix}${slugValue}`;
  const postCount = data._count.posts;
  const formErrors = form.errors;
  const isBusy = isPending || isDeletePending;

  return (
    <div className="space-y-6">
      {/* アクションバー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{postCount}件の投稿</span>
          <span>·</span>
          <span>{archiveUrl}</span>
          <a
            href={archiveUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
            aria-label={`${archiveUrl} を新しいタブで開く`}
          >
            <IconExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <TaxonomyDeleteDialog
            label={config.label}
            postCount={postCount}
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onDelete={handleDelete}
            isPending={isDeletePending}
          />
          <SubmitButton
            form={form.id}
            isPending={isPending}
            label="保存"
            pendingLabel="保存中..."
            disabled={isBusy}
          >
            <>
              <IconDeviceFloppy className="mr-2 h-4 w-4" />
              保存
            </>
          </SubmitButton>
        </div>
      </div>

      <form
        {...getFormProps(form)}
        action={formAction}
        className="grid gap-6 lg:grid-cols-2"
      >
        <input
          type="hidden"
          name={fields.ogpImageUrl.name}
          value={ogpImageUrlValue}
        />

        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={fields.name.id}>カテゴリ名 *</Label>
              <Input
                {...getInputProps(fields.name, { type: "text" })}
                placeholder="カテゴリ名"
                disabled={isPending}
              />
              {fields.name.errors && (
                <p
                  id={fields.name.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.name.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={fields.slug.id}>スラッグ *</Label>
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
                {...getInputProps(fields.slug, { type: "text" })}
                placeholder="slug"
                disabled={isPending}
              />
              {fields.slug.errors && (
                <p
                  id={fields.slug.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.slug.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.description.id}>説明</Label>
              <Textarea
                {...getTextareaProps(fields.description)}
                placeholder="カテゴリの説明"
                rows={3}
                disabled={isPending}
              />
              {fields.description.errors && (
                <p
                  id={fields.description.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.description.errors.join(", ")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* SEO設定 */}
          <Card>
            <CardHeader>
              <CardTitle>SEO設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={fields.metaTitle.id}>SEOタイトル</Label>
                <Input
                  {...getInputProps(fields.metaTitle, { type: "text" })}
                  placeholder="検索結果に表示されるタイトル"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">70文字以内推奨</p>
                {fields.metaTitle.errors && (
                  <p
                    id={fields.metaTitle.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.metaTitle.errors.join(", ")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.metaDescription.id}>
                  メタディスクリプション
                </Label>
                <Textarea
                  {...getTextareaProps(fields.metaDescription)}
                  placeholder="検索結果に表示される説明文"
                  rows={3}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">160文字以内推奨</p>
                {fields.metaDescription.errors && (
                  <p
                    id={fields.metaDescription.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.metaDescription.errors.join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <OgpImagePicker
            ogpImageUrl={ogpImageUrlValue}
            metaTitle={metaTitleValue}
            metaDescription={metaDescriptionValue}
            description={descriptionValue}
            entityName={data.name}
            isPending={isPending}
            onPickImage={() => ogpPicker.openPicker()}
            onClearImage={() => ogpImageUrlControl.change("")}
          />
          {fields.ogpImageUrl.errors && (
            <p
              id={fields.ogpImageUrl.errorId}
              className="text-sm text-destructive"
            >
              {fields.ogpImageUrl.errors.join(", ")}
            </p>
          )}
        </div>

        {formErrors && formErrors.length > 0 && (
          <div
            id={form.errorId}
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive lg:col-span-2"
          >
            {formErrors.join(", ")}
          </div>
        )}
      </form>

      {ogpPicker.mediaPickerDialog}
    </div>
  );
}

// =============================================================================
// TagEditorImpl
// =============================================================================

function TagEditorImpl({ data }: { data: PostTagData }) {
  const config = CONFIG.tag;
  const router = useRouter();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const boundAction = updatePostTagAction.bind(null, data.id);
  const [lastResult, formAction, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `post-tag-${data.id}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: tagFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? "",
      metaTitle: data.metaTitle ?? "",
      metaDescription: data.metaDescription ?? "",
      ogpImageUrl: data.ogpImageUrl ?? "",
    },
  });

  const nameControl = useInputControl(fields.name);
  const slugControl = useInputControl(fields.slug);
  const descriptionControl = useInputControl(fields.description);
  const metaTitleControl = useInputControl(fields.metaTitle);
  const metaDescriptionControl = useInputControl(fields.metaDescription);
  const ogpImageUrlControl = useInputControl(fields.ogpImageUrl);

  const slugValue = slugControl.value ?? "";
  const descriptionValue = descriptionControl.value ?? "";
  const metaTitleValue = metaTitleControl.value ?? "";
  const metaDescriptionValue = metaDescriptionControl.value ?? "";
  const ogpImageUrlValue = ogpImageUrlControl.value ?? "";

  const ogpPicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "POST",
    onSelect: (media: SelectedMedia[]) => {
      const selected = media[0];
      if (selected) {
        ogpImageUrlControl.change(selected.url);
      }
    },
  });

  const handleGenerateSlug = () => {
    const name = nameControl.value ?? "";
    if (name) {
      slugControl.change(generateSlug(name, "tag"));
    }
  };

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(`${config.label}を更新しました`);
      router.refresh();
    }
  }, [lastResult, router, config.label]);

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deletePostTag(data.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`${config.label}を削除しました`);
      router.push(config.backUrl);
    });
  };

  const archiveUrl = `${config.urlPrefix}${slugValue}`;
  const postCount = data._count.posts;
  const formErrors = form.errors;
  const isBusy = isPending || isDeletePending;

  return (
    <div className="space-y-6">
      {/* アクションバー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{postCount}件の投稿</span>
          <span>·</span>
          <span>{archiveUrl}</span>
          <a
            href={archiveUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
            aria-label={`${archiveUrl} を新しいタブで開く`}
          >
            <IconExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <TaxonomyDeleteDialog
            label={config.label}
            postCount={postCount}
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onDelete={handleDelete}
            isPending={isDeletePending}
          />
          <SubmitButton
            form={form.id}
            isPending={isPending}
            label="保存"
            pendingLabel="保存中..."
            disabled={isBusy}
          >
            <>
              <IconDeviceFloppy className="mr-2 h-4 w-4" />
              保存
            </>
          </SubmitButton>
        </div>
      </div>

      <form
        {...getFormProps(form)}
        action={formAction}
        className="grid gap-6 lg:grid-cols-2"
      >
        <input
          type="hidden"
          name={fields.ogpImageUrl.name}
          value={ogpImageUrlValue}
        />

        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={fields.name.id}>タグ名 *</Label>
              <Input
                {...getInputProps(fields.name, { type: "text" })}
                placeholder="タグ名"
                disabled={isPending}
              />
              {fields.name.errors && (
                <p
                  id={fields.name.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.name.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={fields.slug.id}>スラッグ *</Label>
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
                {...getInputProps(fields.slug, { type: "text" })}
                placeholder="slug"
                disabled={isPending}
              />
              {fields.slug.errors && (
                <p
                  id={fields.slug.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.slug.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.description.id}>説明</Label>
              <Textarea
                {...getTextareaProps(fields.description)}
                placeholder="タグの説明"
                rows={3}
                disabled={isPending}
              />
              {fields.description.errors && (
                <p
                  id={fields.description.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.description.errors.join(", ")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* SEO設定 */}
          <Card>
            <CardHeader>
              <CardTitle>SEO設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={fields.metaTitle.id}>SEOタイトル</Label>
                <Input
                  {...getInputProps(fields.metaTitle, { type: "text" })}
                  placeholder="検索結果に表示されるタイトル"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">70文字以内推奨</p>
                {fields.metaTitle.errors && (
                  <p
                    id={fields.metaTitle.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.metaTitle.errors.join(", ")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.metaDescription.id}>
                  メタディスクリプション
                </Label>
                <Textarea
                  {...getTextareaProps(fields.metaDescription)}
                  placeholder="検索結果に表示される説明文"
                  rows={3}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">160文字以内推奨</p>
                {fields.metaDescription.errors && (
                  <p
                    id={fields.metaDescription.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.metaDescription.errors.join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <OgpImagePicker
            ogpImageUrl={ogpImageUrlValue}
            metaTitle={metaTitleValue}
            metaDescription={metaDescriptionValue}
            description={descriptionValue}
            entityName={data.name}
            isPending={isPending}
            onPickImage={() => ogpPicker.openPicker()}
            onClearImage={() => ogpImageUrlControl.change("")}
          />
          {fields.ogpImageUrl.errors && (
            <p
              id={fields.ogpImageUrl.errorId}
              className="text-sm text-destructive"
            >
              {fields.ogpImageUrl.errors.join(", ")}
            </p>
          )}
        </div>

        {formErrors && formErrors.length > 0 && (
          <div
            id={form.errorId}
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive lg:col-span-2"
          >
            {formErrors.join(", ")}
          </div>
        )}
      </form>

      {ogpPicker.mediaPickerDialog}
    </div>
  );
}
