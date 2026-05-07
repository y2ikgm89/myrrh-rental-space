"use client";

/**
 * TaxonomyEditor - カテゴリ・タグ共通エディター
 *
 * 通常の管理画面内で表示されるシンプルなフォーム
 * ヘッダー（戻るボタン・タイトル）は AdminDetailLayout に委譲済み
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { IconExternalLink, IconDeviceFloppy } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  updatePostCategory,
  updatePostTag,
  deletePostCategory,
  deletePostTag,
} from "@/admin/actions/post/taxonomy";
import type {
  PostCategoryData,
  PostTagData,
} from "@/shared/domain/posts/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { generateSlug } from "@/shared/lib/slug";
import type { AppRoute } from "@/shared/lib/typed-routes";
import {
  categoryFormSchema,
  tagFormSchema,
  type CategoryFormData,
  type TagFormData,
} from "./taxonomy-schema";
import { CategoryFormFields, TagFormFields } from "./TaxonomyFormFields";
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
  { label: string; urlPrefix: string; backUrl: AppRoute }
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

  const currentSlug = useWatch({ control, name: "slug" });
  const postCount = data._count.posts;

  const handleGenerateSlug = () => {
    const name = getValues("name");
    if (name) {
      const slug = generateSlug(name, "category");
      setValue("slug", slug, { shouldDirty: true });
    }
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
      {/* アクションバー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{postCount}件の投稿</span>
          <span>·</span>
          <span>{archiveUrl}</span>
          <a
            href={archiveUrl}
            target="_blank"
            className="hover:text-foreground"
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
            isPending={isPending}
          />
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
        <CategoryFormFields
          control={control}
          register={register}
          errors={errors}
          isPending={isPending}
          entityName={data.name}
          onSetOgpImageUrl={(url) =>
            setValue("ogpImageUrl", url, { shouldDirty: true })
          }
          onGenerateSlug={handleGenerateSlug}
        />
      </form>
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

  const currentSlug = useWatch({ control, name: "slug" });
  const postCount = data._count.posts;

  const handleGenerateSlug = () => {
    const name = getValues("name");
    if (name) {
      const slug = generateSlug(name, "tag");
      setValue("slug", slug, { shouldDirty: true });
    }
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
      {/* アクションバー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{postCount}件の投稿</span>
          <span>·</span>
          <span>{archiveUrl}</span>
          <a
            href={archiveUrl}
            target="_blank"
            className="hover:text-foreground"
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
            isPending={isPending}
          />
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
        <TagFormFields
          control={control}
          register={register}
          errors={errors}
          isPending={isPending}
          entityName={data.name}
          onSetOgpImageUrl={(url) =>
            setValue("ogpImageUrl", url, { shouldDirty: true })
          }
          onGenerateSlug={handleGenerateSlug}
        />
      </form>
    </div>
  );
}
