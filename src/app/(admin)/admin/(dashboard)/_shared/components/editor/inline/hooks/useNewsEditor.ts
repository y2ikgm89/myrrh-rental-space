"use client";

/**
 * お知らせエディター専用フック
 *
 * NewsFormDataに特化した型安全なフック
 * 型アサーション完全排除
 */

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import {
  newsFormSchema,
  type NewsFormData,
} from "@/admin/lib/validations/news";
import {
  createNews,
  updateNews,
  deleteNews,
  publishNews,
  unpublishNews,
} from "@/admin/actions/news";
import { createPreviewHandlers } from "@/admin/hooks";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import type { NewsData } from "@/shared/domain/news/types";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { NewsPreviewData } from "@/shared/types";

// 共有ユーティリティ
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
        resource: "news",
      }),
    },
  );

  return response.html;
}

// =============================================================================
// Transforms (Type-safe)
// =============================================================================

function toFormData(data?: NewsData): NewsFormData {
  if (!data) {
    return {
      slug: "",
      title: "",
      contentJson: "",
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
    contentJson: data.contentJson ? JSON.stringify(data.contentJson) : "",
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

function toSubmitPayload(formData: NewsFormData) {
  return {
    slug: formData.slug,
    title: formData.title,
    contentJson: formData.contentJson,
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
  formData: NewsFormData,
  contentHtml: string,
): NewsPreviewData {
  return {
    title: formData.title || "無題",
    slug: formData.slug || "preview-new",
    contentHtml,
    publishedAt: formData.publishedAt || null,
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useNewsEditor({ news, mode }: UseNewsEditorOptions) {
  const router = useRouter();

  // プレビュー
  const { saveAndOpenPreview } = createPreviewHandlers("news");

  // フォーム（型アサーション不要）
  const form = useForm<NewsFormData, unknown, NewsFormData>({
    resolver: standardSchemaResolver(newsFormSchema),
    defaultValues: toFormData(news),
  });

  // コアフック
  const core = useEditorCore({
    form,
    listPath: "/admin/news",
  });

  const { handleSubmit, setValue, getValues, reset, formState, control } = form;

  // 監視値（型アサーション不要 - 具体的な型が推論される）
  const title = useWatch({ control, name: "title" }) ?? "";
  const slug = useWatch({ control, name: "slug" }) ?? "";
  const contentJson = useWatch({ control, name: "contentJson" }) ?? "";
  const isPublished = useWatch({ control, name: "isPublished" }) ?? false;

  // isDirty計算
  const isDirty = formState.isDirty || core.hasEditorChanges;

  // ==========================================================================
  // Handlers (React Compiler auto-memoizes - no useCallback needed)
  // ==========================================================================

  const handleContentChange = (json: string) => {
    setValue("contentJson", json, { shouldDirty: true });
    core.setHasEditorChanges(true);
  };

  const onSubmit = (formData: NewsFormData) => {
    core.startTransition(async () => {
      try {
        const payload = toSubmitPayload(formData);

        if (mode === "create") {
          const result = await createNews(payload);
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }

          toast.success("お知らせを作成しました");
          router.push(`/admin/news/${result.id}`);
        } else if (news) {
          const result = await updateNews(news.id, payload);
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }

          reset(formData);
          core.setHasEditorChanges(false);
          router.refresh();
          toast.success("お知らせを保存しました");
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
    if (!news || core.isPending) return;
    core.startTransition(async () => {
      const result = await publishNews(news.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`公開しました（バージョン ${result.version}）`);
      setValue("isPublished", true);
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
      setValue("isPublished", false);
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

  const handlePreview = async () => {
    try {
      const values = getValues();
      const identifier =
        mode === "create" ? "preview-new" : slug || "preview-new";
      const contentHtml = await fetchPreviewHtml(values.contentJson || "");
      const previewData = toPreviewData(values, contentHtml);
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
    // フォーム
    form,
    isPending: core.isPending,
    isDirty,
    hasEditorChanges: core.hasEditorChanges,

    // 監視値
    title,
    slug,
    contentJson,
    contentHtml: news?.contentHtml ?? "",
    isPublished,

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
  };
}
