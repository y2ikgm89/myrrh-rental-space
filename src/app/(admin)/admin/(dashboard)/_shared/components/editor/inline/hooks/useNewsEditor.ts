"use client";

/**
 * お知らせエディター専用フック
 *
 * 本文（contentJson）と設定（メタデータ・SEO 等）を独立した
 * RHF フォームとして管理し、保存も独立して実行する。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import {
  newsBodyFormSchema,
  newsSettingsFormSchema,
  type NewsBodyFormData,
  type NewsSettingsFormData,
} from "@/admin/lib/validations/news";
import {
  createNews,
  updateNewsBody,
  updateNewsSettings,
  deleteNews,
  publishNews,
  unpublishNews,
} from "@/admin/actions/news";
import { createPreviewHandlers } from "@/admin/hooks";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import type { NewsData } from "@/shared/domain/news/types";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { NewsPreviewData } from "@/shared/types";

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

// =============================================================================
// Types
// =============================================================================

type UseNewsEditorOptions = {
  news?: NewsData | undefined;
  mode: "create" | "edit";
};

// =============================================================================
// Transforms
// =============================================================================

function toBodyFormData(data?: NewsData): NewsBodyFormData {
  return {
    contentJson: data?.contentJson
      ? JSON.stringify(data.contentJson)
      : EMPTY_LEXICAL_EDITOR_STATE_JSON,
  };
}

function toSettingsFormData(data?: NewsData): NewsSettingsFormData {
  if (!data) {
    return {
      slug: "",
      title: "",
      isPublished: false,
      publishedAt: "",
      contentWidth: "",
      contentWidthCustom: "",
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      ogpImageUrl: "",
    };
  }

  return {
    slug: data.slug,
    title: data.title,
    isPublished: data.isPublished,
    publishedAt: toFormDateString(data.publishedAt),
    contentWidth: toFormContentWidth(data.contentWidth),
    contentWidthCustom: toFormNumberString(data.contentWidthCustom),
    metaDescription: toFormString(data.metaDescription),
    metaKeywords: toFormString(data.metaKeywords),
    ogpTitle: toFormString(data.ogpTitle),
    ogpDescription: toFormString(data.ogpDescription),
    ogpImageUrl: toFormString(data.ogpImageUrl),
  };
}

function toSettingsSubmitPayload(formData: NewsSettingsFormData) {
  return {
    slug: formData.slug,
    title: formData.title,
    isPublished: formData.isPublished,
    contentWidth: toSubmitContentWidth(formData.contentWidth),
    contentWidthCustom: toSubmitNumber(formData.contentWidthCustom),
    metaDescription: toNullableString(formData.metaDescription),
    metaKeywords: toNullableString(formData.metaKeywords),
    ogpTitle: toNullableString(formData.ogpTitle),
    ogpDescription: toNullableString(formData.ogpDescription),
    ogpImageUrl: toNullableString(formData.ogpImageUrl),
  };
}

function toPreviewData(
  settingsData: NewsSettingsFormData,
  contentHtml: string,
): NewsPreviewData {
  return {
    title: settingsData.title || "無題",
    slug: settingsData.slug || "preview-new",
    contentHtml,
    publishedAt: settingsData.publishedAt || null,
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useNewsEditor({ news, mode }: UseNewsEditorOptions) {
  const router = useRouter();

  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  // プレビュー
  const { saveAndOpenPreview } = createPreviewHandlers("news");

  // 本文フォーム
  const bodyForm = useForm<NewsBodyFormData, unknown, NewsBodyFormData>({
    resolver: standardSchemaResolver(newsBodyFormSchema),
    defaultValues: toBodyFormData(news),
  });

  // 設定フォーム
  const settingsForm = useForm<
    NewsSettingsFormData,
    unknown,
    NewsSettingsFormData
  >({
    resolver: standardSchemaResolver(newsSettingsFormSchema),
    defaultValues: toSettingsFormData(news),
  });

  // コアフック
  const core = useEditorCore({
    form: bodyForm,
    listPath: "/admin/news",
  });

  // 監視値
  const title =
    useWatch({ control: settingsForm.control, name: "title" }) ?? "";
  const slug = useWatch({ control: settingsForm.control, name: "slug" }) ?? "";
  const isPublished =
    useWatch({ control: settingsForm.control, name: "isPublished" }) ?? false;
  const contentJson =
    useWatch({ control: bodyForm.control, name: "contentJson" }) ??
    EMPTY_LEXICAL_EDITOR_STATE_JSON;

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

  const onSubmitBody = (bodyData: NewsBodyFormData) => {
    if (!news) return;
    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(
          bodyData.contentJson,
        );
        const result = await updateNewsBody(news.id, {
          contentJson: bodyData.contentJson,
          contentHtml,
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

  const onSubmitSettings = (settingsData: NewsSettingsFormData) => {
    if (!news) return;
    core.startTransition(async () => {
      try {
        const payload = toSettingsSubmitPayload(settingsData);
        const result = await updateNewsSettings(news.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        settingsForm.reset(settingsData);
        setIsSettingsDialogOpen(false);
        router.refresh();
        toast.success("お知らせ設定を保存しました");
      } catch (error) {
        logger.error("お知らせ設定の保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("お知らせ設定の保存中にエラーが発生しました");
      }
    });
  };

  const onCreateBoth = () => {
    core.startTransition(async () => {
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

      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(
          bodyData.contentJson,
        );
        const result = await createNews({
          slug: settingsData.slug,
          title: settingsData.title,
          contentJson: bodyData.contentJson,
          contentHtml,
        });

        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("お知らせを作成しました");
        router.push(`/admin/news/${result.id}`);
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
    bodyForm.handleSubmit(onSubmitBody)();
  };

  const handleSaveSettings = () => {
    if (core.isPending) return;
    settingsForm.handleSubmit(onSubmitSettings)();
  };

  const closeSettingsDialog = () => {
    settingsForm.reset(toSettingsFormData(news));
    setIsSettingsDialogOpen(false);
  };

  const openSettingsDialog = () => {
    setIsSettingsDialogOpen(true);
  };

  const handlePublish = () => {
    if (!news || core.isPending) return;
    core.startTransition(async () => {
      const result = await publishNews(news.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`公開しました（バージョン ${result.version}）`);
      settingsForm.setValue("isPublished", true);
      router.refresh();
    });
  };

  const handleUnpublish = () => {
    if (!news || core.isPending) return;
    core.startTransition(async () => {
      const result = await unpublishNews(news.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("下書きに戻しました");
      settingsForm.setValue("isPublished", false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!news) return;
    core.startTransition(async () => {
      try {
        const result = await deleteNews(news.id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("お知らせを削除しました");
        router.push("/admin/news");
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
      const previewData = toPreviewData(settingsValues, contentHtml);
      saveAndOpenPreview(identifier, previewData, "/news");
    } catch (error) {
      logger.error("プレビュー生成中にエラーが発生しました", {
        error: getErrorMessage(error),
      });
      toast.error("プレビューの生成に失敗しました");
    }
  };

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    bodyForm,
    settingsForm,
    isPending: core.isPending,
    isDirty,
    isBodyDirty,
    isSettingsDirty,
    hasEditorChanges: core.hasEditorChanges,

    title,
    slug,
    contentJson,
    isPublished,

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
    handleBack: core.handleBack,
    handleContentChange,

    isDeleteDialogOpen: core.isDeleteDialogOpen,
    setIsDeleteDialogOpen: core.setIsDeleteDialogOpen,
  };
}
