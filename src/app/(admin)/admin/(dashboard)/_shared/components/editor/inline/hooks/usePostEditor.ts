"use client";

/**
 * 投稿エディター専用フック
 *
 * 本文 (Lexical contentJson) は useState で軽量管理、設定 (メタデータ・分類・SEO 等)
 * は conform `useForm` で管理する。保存はそれぞれ独立した Server Action 呼び出し:
 *
 * - 本文は EditorHeader の保存ボタンで `updatePostBody` を呼ぶ
 *   (派生 contentHtml は `renderEditorStateJsonToHtmlClient` を browser 側で実行)
 * - 設定は SettingsDialog の保存ボタンで `updatePostSettings` を呼ぶ
 * - create モードでは保存時に両方を統合して `createPost` を呼ぶ
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type DefaultValue } from "@conform-to/react";
import { parseWithZod, getZodConstraint } from "@conform-to/zod/v4";
import { toast } from "sonner";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  postSettingsFormSchema,
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

import {
  useEditorCore,
  toFormDateString,
  toFormString,
  toFormContentWidth,
  toFormNumberString,
  toNullableString,
  toSubmitContentWidth,
  toSubmitNumber,
} from "./shared";
import type { CategoryOption, TagOption } from "./shared";

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

function toSettingsFormData(data?: PostData): PostSettingsFormData {
  if (!data) {
    return {
      title: "",
      slug: "",
      excerpt: "",
      thumbnailUrl: "",
      ogpImageUrl: "",
      categoryId: "",
      tags: [],
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      status: PostStatus.DRAFT,
      publishedAt: "",
      contentWidth: null,
      contentWidthCustom: null,
    };
  }

  return {
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt,
    thumbnailUrl: data.thumbnailUrl,
    ogpImageUrl: toFormString(data.ogpImageUrl),
    categoryId: data.categoryId,
    tags: (data.postTags ?? []).map((t) => t.id),
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
    tags: Array.isArray(formData.tags) ? formData.tags : [],
    metaDescription: toNullableString(formData.metaDescription),
    metaKeywords: toNullableString(formData.metaKeywords),
    ogpTitle: toNullableString(formData.ogpTitle),
    ogpDescription: toNullableString(formData.ogpDescription),
    status: formData.status,
    contentWidth: toSubmitContentWidth(
      typeof formData.contentWidth === "string"
        ? formData.contentWidth
        : undefined,
    ),
    contentWidthCustom: toSubmitNumber(
      typeof formData.contentWidthCustom === "string"
        ? formData.contentWidthCustom
        : formData.contentWidthCustom != null
          ? String(formData.contentWidthCustom)
          : undefined,
    ),
  };
}

function toPreviewData(
  settingsData: PostSettingsFormData,
  categories: CategoryOption[],
  contentHtml: string,
): PostPreviewData {
  const tags = Array.isArray(settingsData.tags) ? settingsData.tags : [];
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

export function usePostEditor({
  post,
  mode,
  initialCategories = [],
  initialTags = [],
  onCreateCategory,
  onCreateTag,
}: UsePostEditorOptions) {
  const router = useRouter();

  const [categories, setCategories] =
    useState<CategoryOption[]>(initialCategories);
  const [tags, setTags] = useState<TagOption[]>(initialTags);

  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  const { saveAndOpenPreview } = createPreviewHandlers("post");

  // 本文 (contentJson) — 軽量 useState 管理
  const initialContentJson = post?.contentJson
    ? JSON.stringify(post.contentJson)
    : EMPTY_LEXICAL_EDITOR_STATE_JSON;

  const [contentJson, setContentJson] = useState(initialContentJson);
  const [savedContentJson, setSavedContentJson] = useState(initialContentJson);
  const [statusValue, setStatusValue] = useState<PostStatus>(
    post?.status ?? PostStatus.DRAFT,
  );

  const isBodyDirty = contentJson !== savedContentJson;

  // 設定 — conform useForm
  // documented exception §5 conform generic invariance:
  // preprocess input 型 (`tags: unknown` / `contentWidth: unknown`) は conform
  // DefaultValue<T> の string-only 制約と非互換のため境界 cast。
  const [settingsForm, settingsFields] = useForm<PostSettingsFormData>({
    id: "post-settings-form",
    constraint: getZodConstraint(postSettingsFormSchema),
    defaultValue: toSettingsFormData(
      post,
    ) as unknown as DefaultValue<PostSettingsFormData>,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: postSettingsFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const isSettingsDirty = settingsForm.dirty ?? false;
  const isDirty = isBodyDirty || isSettingsDirty;

  const core = useEditorCore({ listPath: "/admin/posts" });

  const title =
    typeof settingsFields.title.value === "string"
      ? settingsFields.title.value
      : "";
  const slug =
    typeof settingsFields.slug.value === "string"
      ? settingsFields.slug.value
      : "";

  const handleContentChange = (json: string) => {
    setContentJson(json);
  };

  const onSubmitBody = () => {
    if (!post) return;
    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const result = await updatePostBody(post.id, {
          contentJson,
          contentHtml,
        });
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        setSavedContentJson(contentJson);
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

  // 設定フォームを imperative に validate (FormData を fields から組み立て)
  const validateSettings = (): PostSettingsFormData | null => {
    const formData = new FormData();
    for (const [key, field] of Object.entries(settingsFields)) {
      const fieldValue = field.value;
      if (Array.isArray(fieldValue)) {
        formData.append(key, JSON.stringify(fieldValue));
      } else if (fieldValue != null) {
        formData.append(key, String(fieldValue));
      }
    }
    const submission = parseWithZod(formData, {
      schema: postSettingsFormSchema,
    });
    if (submission.status !== "success") {
      toast.error("入力内容に誤りがあります");
      return null;
    }
    return submission.value as unknown as PostSettingsFormData;
  };

  const onSubmitSettings = () => {
    if (!post) return;
    const settingsData = validateSettings();
    if (!settingsData) return;

    core.startTransition(async () => {
      try {
        const payload = toSettingsSubmitPayload(settingsData);
        const result = await updatePostSettings(post.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

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
    const settingsData = validateSettings();
    if (!settingsData) {
      setIsSettingsDialogOpen(true);
      return;
    }

    core.startTransition(async () => {
      const settingsPayload = toSettingsSubmitPayload(settingsData);
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const result = await createPost({
          title: settingsPayload.title,
          slug: settingsPayload.slug,
          excerpt: settingsPayload.excerpt,
          contentJson,
          contentHtml,
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

  const handleSave = () => {
    if (core.isPending) return;
    if (mode === "create") {
      onCreateBoth();
      return;
    }
    onSubmitBody();
  };

  const handleSaveSettings = () => {
    if (core.isPending) return;
    onSubmitSettings();
  };

  const closeSettingsDialog = () => {
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
      setStatusValue(PostStatus.PUBLISHED);
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
      setStatusValue(PostStatus.DRAFT);
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
      const settingsData = validateSettings();
      if (!settingsData) return;
      const identifier =
        mode === "create" ? "preview-new" : slug || "preview-new";
      const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
      const previewData = toPreviewData(settingsData, categories, contentHtml);
      saveAndOpenPreview(identifier, previewData, "/posts");
    } catch (error) {
      logger.error("プレビュー生成中にエラーが発生しました", {
        error: getErrorMessage(error),
      });
      toast.error("プレビューの生成に失敗しました");
    }
  };

  const handleBack = () => core.handleBack(isDirty);

  const handleStatusChange = (value: PostStatus) => {
    setStatusValue(value);
    settingsForm.update({ name: settingsFields.status.name, value });
  };

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

  return {
    settingsForm,
    settingsFields,
    isPending: core.isPending,
    isDirty,
    isBodyDirty,
    isSettingsDirty,

    title,
    slug,
    contentJson,
    status: statusValue,

    isSettingsDialogOpen,
    openSettingsDialog,
    closeSettingsDialog,

    isCommentsPanelOpen: core.comments.isOpen,
    toggleComments: core.comments.toggle,
    closeCommentsPanel: core.comments.close,
    activeMarkId: core.comments.activeMarkId,
    selectMark: core.comments.selectMark,
    pendingComment: core.comments.pendingComment,
    handleAddComment: core.comments.handleAddComment,
    clearPendingComment: core.comments.clearPendingComment,

    handleSave,
    handleSaveSettings,
    handlePublish,
    handleUnpublish,
    handleDelete,
    handlePreview,
    handleBack,
    handleContentChange,
    handleStatusChange,

    isDeleteDialogOpen: core.isDeleteDialogOpen,
    setIsDeleteDialogOpen: core.setIsDeleteDialogOpen,

    categories,
    tags,
    handleCreateCategory,
    handleCreateTag,
  };
}
