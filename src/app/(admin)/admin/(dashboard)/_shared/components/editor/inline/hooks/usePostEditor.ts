"use client";

/**
 * 投稿エディター専用フック
 *
 * 本文（contentJson）と設定（メタデータ・分類・SEO 等）を独立した
 * RHF フォームとして管理し、保存も独立して実行する。
 *
 * - 本文は EditorHeader の保存ボタンで `updatePostBody` を呼ぶ
 * - 設定は SettingsDialog の保存ボタンで `updatePostSettings` を呼ぶ
 * - create モードでは保存時に両フォームを統合して `createPost` を呼ぶ
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { PostStatus } from "@generated/prisma/enums";
import {
  postBodyFormSchema,
  postSettingsFormSchema,
  type PostBodyFormData,
  type PostSettingsFormData,
} from "@/admin/lib/validations/post";
import {
  createPost,
  updatePostBody,
  updatePostSettings,
  deletePost,
  publishPost,
  unpublishPost,
} from "@/admin/actions/post/mutations";
import { createPreviewHandlers } from "@/admin/hooks";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
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

// =============================================================================
// Transforms
// =============================================================================

function toBodyFormData(data?: PostData): PostBodyFormData {
  return {
    contentJson: data?.contentJson
      ? JSON.stringify(data.contentJson)
      : EMPTY_LEXICAL_EDITOR_STATE_JSON,
  };
}

function toSettingsFormData(data?: PostData): PostSettingsFormData {
  if (!data) {
    return {
      title: "",
      slug: "",
      excerpt: "",
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

function toSettingsSubmitPayload(formData: PostSettingsFormData) {
  return {
    title: formData.title,
    slug: formData.slug,
    excerpt: formData.excerpt,
    thumbnailUrl: formData.thumbnailUrl,
    ogpImageUrl: toNullableString(formData.ogpImageUrl),
    categoryId: formData.categoryId,
    tags: parseTagsString(formData.tags),
    metaDescription: toNullableString(formData.metaDescription),
    metaKeywords: toNullableString(formData.metaKeywords),
    ogpTitle: toNullableString(formData.ogpTitle),
    ogpDescription: toNullableString(formData.ogpDescription),
    status: formData.status,
    contentWidth: toSubmitContentWidth(formData.contentWidth),
    contentWidthCustom: toSubmitNumber(formData.contentWidthCustom),
  };
}

function toPreviewData(
  bodyData: PostBodyFormData,
  settingsData: PostSettingsFormData,
  categories: CategoryOption[],
  contentHtml: string,
): PostPreviewData {
  const tags = parseTagsString(settingsData.tags);
  const selectedCategory = categories.find(
    (c) => c.id === settingsData.categoryId,
  );

  return {
    title: settingsData.title || "無題",
    slug: settingsData.slug || "preview-new",
    excerpt: settingsData.excerpt || "",
    contentHtml,
    thumbnailUrl: settingsData.thumbnailUrl || "",
    publishedAt: settingsData.publishedAt || null,
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

  // 設定ダイアログ開閉
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  // プレビュー
  const { saveAndOpenPreview } = createPreviewHandlers("post");

  // 本文フォーム（contentJson のみ）
  const bodyForm = useForm<PostBodyFormData, unknown, PostBodyFormData>({
    resolver: standardSchemaResolver(postBodyFormSchema),
    defaultValues: toBodyFormData(post),
  });

  // 設定フォーム（メタデータ・分類・SEO/OGP・公開状態・レイアウト）
  const settingsForm = useForm<
    PostSettingsFormData,
    unknown,
    PostSettingsFormData
  >({
    resolver: standardSchemaResolver(postSettingsFormSchema),
    defaultValues: toSettingsFormData(post),
  });

  // コアフック（dirty/transition は両フォームをまたぐので bodyForm を渡しつつ独自集計）
  const core = useEditorCore({
    form: bodyForm,
    listPath: "/admin/posts",
  });

  // 監視値（EditorHeader の表示用）
  const title =
    useWatch({ control: settingsForm.control, name: "title" }) ?? "";
  const slug = useWatch({ control: settingsForm.control, name: "slug" }) ?? "";
  const status =
    useWatch({ control: settingsForm.control, name: "status" }) ??
    PostStatus.DRAFT;
  const contentJson =
    useWatch({ control: bodyForm.control, name: "contentJson" }) ??
    EMPTY_LEXICAL_EDITOR_STATE_JSON;

  // dirty 計算（本文・設定どちらかが dirty なら未保存扱い）
  const isBodyDirty = bodyForm.formState.isDirty || core.hasEditorChanges;
  const isSettingsDirty = settingsForm.formState.isDirty;
  const isDirty = isBodyDirty || isSettingsDirty;

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleContentChange = (json: string) => {
    bodyForm.setValue("contentJson", json, { shouldDirty: true });
    core.setHasEditorChanges(true);
  };

  const onSubmitBody = (bodyData: PostBodyFormData) => {
    if (!post) return;
    core.startTransition(async () => {
      try {
        const result = await updatePostBody(post.id, {
          contentJson: bodyData.contentJson,
        });
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        bodyForm.reset(bodyData);
        core.setHasEditorChanges(false);
        router.refresh();
        toast.success("本文を保存しました");
      } catch (error) {
        logger.error("本文の保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("本文の保存中にエラーが発生しました");
      }
    });
  };

  const onSubmitSettings = (settingsData: PostSettingsFormData) => {
    if (!post) return;
    core.startTransition(async () => {
      try {
        const payload = toSettingsSubmitPayload(settingsData);
        const result = await updatePostSettings(post.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        settingsForm.reset(settingsData);
        setIsSettingsDialogOpen(false);
        router.refresh();
        toast.success("記事設定を保存しました");
      } catch (error) {
        logger.error("記事設定の保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("記事設定の保存中にエラーが発生しました");
      }
    });
  };

  const onCreateBoth = () => {
    core.startTransition(async () => {
      // 両フォームを並行 validate
      const [bodyValid, settingsValid] = await Promise.all([
        bodyForm.trigger(),
        settingsForm.trigger(),
      ]);

      if (!bodyValid || !settingsValid) {
        if (!settingsValid) setIsSettingsDialogOpen(true);
        toast.error("入力内容に誤りがあります");
        return;
      }

      const bodyData = bodyForm.getValues();
      const settingsData = settingsForm.getValues();
      const settingsPayload = toSettingsSubmitPayload(settingsData);

      try {
        const result = await createPost({
          title: settingsPayload.title,
          slug: settingsPayload.slug,
          excerpt: settingsPayload.excerpt,
          contentJson: bodyData.contentJson,
          thumbnailUrl: settingsPayload.thumbnailUrl,
          categoryId: settingsPayload.categoryId,
          tags: settingsPayload.tags,
          metaDescription: settingsPayload.metaDescription,
          metaKeywords: settingsPayload.metaKeywords,
          ogpTitle: settingsPayload.ogpTitle,
          ogpDescription: settingsPayload.ogpDescription,
        });

        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("投稿記事を作成しました");
        router.push(`/admin/posts/${result.id}`);
      } catch (error) {
        logger.error("作成中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("作成中にエラーが発生しました");
      }
    });
  };

  /** EditorHeader の保存ボタン: 本文保存（create モードでは新規作成） */
  const handleSave = () => {
    if (core.isPending) return;
    if (mode === "create") {
      onCreateBoth();
      return;
    }
    bodyForm.handleSubmit(onSubmitBody)();
  };

  /** SettingsDialog の保存ボタン: 設定保存 */
  const handleSaveSettings = () => {
    if (core.isPending) return;
    settingsForm.handleSubmit(onSubmitSettings)();
  };

  /** SettingsDialog のキャンセル/閉じる: 設定フォームをリセット */
  const closeSettingsDialog = () => {
    settingsForm.reset(toSettingsFormData(post));
    setIsSettingsDialogOpen(false);
  };

  const openSettingsDialog = () => {
    setIsSettingsDialogOpen(true);
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
      settingsForm.setValue("status", PostStatus.PUBLISHED);
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
      settingsForm.setValue("status", PostStatus.DRAFT);
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

  const handlePreview = () => {
    try {
      const bodyValues = bodyForm.getValues();
      const settingsValues = settingsForm.getValues();
      const identifier =
        mode === "create" ? "preview-new" : slug || "preview-new";
      const contentHtml = renderEditorStateJsonToHtmlClient(
        bodyValues.contentJson,
      );
      const previewData = toPreviewData(
        bodyValues,
        settingsValues,
        categories,
        contentHtml,
      );
      saveAndOpenPreview(identifier, previewData, "/posts");
    } catch (error) {
      logger.error("プレビュー生成中にエラーが発生しました", {
        error: getErrorMessage(error),
      });
      toast.error("プレビューの生成に失敗しました");
    }
  };

  // ==========================================================================
  // カテゴリ/タグ操作
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
    bodyForm,
    settingsForm,
    isPending: core.isPending,
    isDirty,
    isBodyDirty,
    isSettingsDirty,
    hasEditorChanges: core.hasEditorChanges,

    // 監視値
    title,
    slug,
    contentJson,
    status,

    // 設定ダイアログ
    isSettingsDialogOpen,
    openSettingsDialog,
    closeSettingsDialog,

    // コメントパネル
    isCommentsPanelOpen: core.comments.isOpen,
    toggleComments: core.comments.toggle,
    closeCommentsPanel: core.comments.close,
    activeMarkId: core.comments.activeMarkId,
    selectMark: core.comments.selectMark,
    pendingComment: core.comments.pendingComment,
    handleAddComment: core.comments.handleAddComment,
    clearPendingComment: core.comments.clearPendingComment,

    // ハンドラー
    handleSave,
    handleSaveSettings,
    handlePublish,
    handleUnpublish,
    handleDelete,
    handlePreview,
    handleBack: core.handleBack,
    handleContentChange,

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
