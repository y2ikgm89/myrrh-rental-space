"use client";

/**
 * 投稿エディター専用フック
 *
 * PostFormDataに特化した型安全なフック
 * 型アサーション完全排除
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PostStatus } from "@/shared/db/enums";
import {
  postFormSchema,
  type PostFormData,
} from "@/admin/lib/validations/post";
import {
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
} from "@/admin/actions/post";
import { createPreviewHandlers } from "@/admin/hooks";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import type { PostData } from "@/shared/domain/posts/types";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { PostPreviewData } from "@/shared/types";

// 共有ユーティリティ
import {
  useEditorCore,
  toFormDateString,
  toFormString,
  toFormContentWidth,
  toFormNumberString,
  toTagsString,
  toNullableString,
  toSubmitContentWidth,
  toSubmitNumber,
  parseTagsString,
} from "./shared";
import type { CategoryOption, TagOption } from "./shared";

// =============================================================================
// Types
// =============================================================================

type UsePostEditorOptions = {
  post?: PostData | undefined;
  mode: "create" | "edit";
  initialCategories?: CategoryOption[] | undefined;
  initialTags?: TagOption[] | undefined;
  onCreateCategory?:
    | ((name: string) => Promise<CategoryOption | null>)
    | undefined;
  onCreateTag?: ((name: string) => Promise<TagOption | null>) | undefined;
};

async function fetchPreviewHtml(contentJson: string): Promise<string> {
  const response = await fetchAdminJson<{ html: string }>(
    "/admin/api/preview/html",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contentJson,
        resource: "post",
      }),
    },
  );

  return response.html;
}

// =============================================================================
// Transforms (Type-safe)
// =============================================================================

function toFormData(data?: PostData): PostFormData {
  if (!data) {
    return {
      title: "",
      slug: "",
      excerpt: "",
      contentJson: "",
      thumbnailUrl: "",
      ogpImageUrl: "",
      categoryId: "",
      tags: "",
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      status: PostStatus.DRAFT,
      publishedAt: "",
      contentWidth: "",
      contentWidthCustom: "",
    };
  }

  return {
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt,
    contentJson: data.contentJson ? JSON.stringify(data.contentJson) : "",
    thumbnailUrl: data.thumbnailUrl,
    ogpImageUrl: toFormString(data.ogpImageUrl),
    categoryId: data.categoryId,
    tags: toTagsString(data.postTags?.map((t) => t.name)),
    metaDescription: toFormString(data.metaDescription),
    metaKeywords: toFormString(data.metaKeywords),
    ogpTitle: toFormString(data.ogpTitle),
    ogpDescription: toFormString(data.ogpDescription),
    status: data.status,
    publishedAt: toFormDateString(data.publishedAt),
    contentWidth: toFormContentWidth(data.contentWidth),
    contentWidthCustom: toFormNumberString(data.contentWidthCustom),
  };
}

function toSubmitPayload(formData: PostFormData) {
  return {
    title: formData.title,
    slug: formData.slug,
    excerpt: formData.excerpt,
    contentJson: formData.contentJson,
    thumbnailUrl: formData.thumbnailUrl,
    ogpImageUrl: toNullableString(formData.ogpImageUrl),
    categoryId: formData.categoryId,
    tags: parseTagsString(formData.tags),
    metaDescription: toNullableString(formData.metaDescription),
    metaKeywords: toNullableString(formData.metaKeywords),
    ogpTitle: toNullableString(formData.ogpTitle),
    ogpDescription: toNullableString(formData.ogpDescription),
    contentWidth: toSubmitContentWidth(formData.contentWidth),
    contentWidthCustom: toSubmitNumber(formData.contentWidthCustom),
  };
}

function toPreviewData(
  formData: PostFormData,
  categories: CategoryOption[],
  contentHtml: string,
): PostPreviewData {
  const tags = parseTagsString(formData.tags);
  const selectedCategory = categories.find((c) => c.id === formData.categoryId);

  return {
    title: formData.title || "無題",
    slug: formData.slug || "preview-new",
    excerpt: formData.excerpt || "",
    contentHtml,
    thumbnailUrl: formData.thumbnailUrl || "",
    publishedAt: formData.publishedAt || null,
    tags,
    category: {
      name: selectedCategory?.name || "カテゴリなし",
      slug: selectedCategory?.slug || "uncategorized",
    },
  };
}

// =============================================================================
// Hook
// =============================================================================

export function usePostEditor({
  post,
  mode,
  initialCategories = [],
  initialTags = [],
  onCreateCategory,
  onCreateTag,
}: UsePostEditorOptions) {
  const router = useRouter();

  // カテゴリ/タグの状態管理
  const [categories, setCategories] =
    useState<CategoryOption[]>(initialCategories);
  const [tags, setTags] = useState<TagOption[]>(initialTags);

  // プレビュー
  const { saveAndOpenPreview } = createPreviewHandlers("post");

  // フォーム（型アサーション不要）
  const form = useForm<PostFormData, unknown, PostFormData>({
    resolver: zodResolver(postFormSchema),
    defaultValues: toFormData(post),
  });

  // コアフック
  const core = useEditorCore({
    form,
    listPath: "/admin/posts",
  });

  const { handleSubmit, setValue, getValues, reset, formState, control } = form;

  // 監視値（型アサーション不要 - 具体的な型が推論される）
  const title = useWatch({ control, name: "title" }) ?? "";
  const slug = useWatch({ control, name: "slug" }) ?? "";
  const contentJson = useWatch({ control, name: "contentJson" }) ?? "";
  const status = useWatch({ control, name: "status" }) ?? PostStatus.DRAFT;

  // isDirty計算
  const isDirty = formState.isDirty || core.hasEditorChanges;

  // ==========================================================================
  // Handlers (React Compiler auto-memoizes - no useCallback needed)
  // ==========================================================================

  const handleContentChange = (json: string) => {
    setValue("contentJson", json, { shouldDirty: true });
    core.setHasEditorChanges(true);
  };

  const onSubmit = (formData: PostFormData) => {
    core.startTransition(async () => {
      try {
        const payload = toSubmitPayload(formData);

        if (mode === "create") {
          const result = await createPost(payload);
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }

          toast.success("投稿記事を作成しました");
          router.push(`/admin/posts/${result.id}`);
        } else if (post) {
          const result = await updatePost(post.id, payload);
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }

          reset(formData);
          core.setHasEditorChanges(false);
          router.refresh();
          toast.success("投稿記事を保存しました");
        }
      } catch (error) {
        logger.error("保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("保存中にエラーが発生しました");
      }
    });
  };

  const handleSave = () => {
    if (core.isPending) return;
    handleSubmit(onSubmit)();
  };

  const handlePublish = () => {
    if (!post || core.isPending) return;
    core.startTransition(async () => {
      const result = await publishPost(post.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`公開しました（バージョン ${result.version}）`);
      setValue("status", PostStatus.PUBLISHED);
      router.refresh();
    });
  };

  const handleUnpublish = () => {
    if (!post || core.isPending) return;
    core.startTransition(async () => {
      const result = await unpublishPost(post.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("下書きに戻しました");
      setValue("status", PostStatus.DRAFT);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!post) return;
    core.startTransition(async () => {
      try {
        const result = await deletePost(post.id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("投稿記事を削除しました");
        router.push("/admin/posts");
      } catch (error) {
        logger.error("削除中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("削除中にエラーが発生しました");
      }
    });
  };

  const handlePreview = async () => {
    try {
      const values = getValues();
      const identifier =
        mode === "create" ? "preview-new" : slug || "preview-new";
      const contentHtml = await fetchPreviewHtml(values.contentJson || "");
      const previewData = toPreviewData(values, categories, contentHtml);
      saveAndOpenPreview(identifier, previewData, "/posts");
    } catch (error) {
      logger.error("プレビュー生成中にエラーが発生しました", {
        error: getErrorMessage(error),
      });
      toast.error("プレビューの生成に失敗しました");
    }
  };

  // ==========================================================================
  // カテゴリ/タグ操作 (React Compiler auto-memoizes)
  // ==========================================================================

  const handleCreateCategory = async (name: string) => {
    if (!onCreateCategory) return null;
    const result = await onCreateCategory(name);
    if (result) {
      setCategories((prev) => [...prev, result]);
    }
    return result;
  };

  const handleCreateTag = async (name: string) => {
    if (!onCreateTag) return null;
    const result = await onCreateTag(name);
    if (result) {
      setTags((prev) => [...prev, result]);
    }
    return result;
  };

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    // フォーム
    form,
    isPending: core.isPending,
    isDirty,
    hasEditorChanges: core.hasEditorChanges,

    // 監視値
    title,
    slug,
    contentJson,
    contentHtml: post?.contentHtml ?? "",
    status,

    // パネル管理
    isSettingsPanelOpen: core.panels.isSettingsPanelOpen,
    isCommentsPanelOpen: core.panels.isCommentsPanelOpen,
    isPanelOpen:
      core.panels.isSettingsPanelOpen || core.panels.isCommentsPanelOpen,
    toggleSettings: core.panels.toggleSettings,
    toggleComments: core.panels.toggleComments,
    closePanel: core.panels.closePanel,
    activeMarkId: core.panels.activeMarkId,
    selectMark: core.panels.selectMark,
    pendingComment: core.panels.pendingComment,
    handleAddComment: core.panels.handleAddComment,
    clearPendingComment: core.panels.clearPendingComment,

    // ハンドラー
    handleSave,
    handlePublish,
    handleUnpublish,
    handleDelete,
    handlePreview,
    handleBack: core.handleBack,
    handleContentChange,
    onSubmit,

    // 削除ダイアログ
    isDeleteDialogOpen: core.isDeleteDialogOpen,
    setIsDeleteDialogOpen: core.setIsDeleteDialogOpen,

    // カテゴリ/タグ
    categories,
    tags,
    handleCreateCategory,
    handleCreateTag,
  };
}
