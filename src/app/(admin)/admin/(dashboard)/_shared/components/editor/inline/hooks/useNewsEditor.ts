"use client";

/**
 * お知らせエディター専用フック
 *
 * 本文 (Lexical contentJson) は useState で軽量管理、設定 (メタデータ・SEO 等)
 * は conform `useForm` で管理する。usePostEditor と同型構造で isPublished
 * (boolean) を status の代わりに使う。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@conform-to/react";
import {
  asConformDefaultValue,
  asConformSubmissionValue,
} from "@/shared/lib/conform/typed-input-control";
import { parseWithZod, getZodConstraint } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  newsSettingsFormSchema,
  type NewsSettingsFormData,
} from "@/admin/lib/validations/news";
import {
  createNews,
  updateNewsBody,
  updateNewsSettings,
  deleteNews,
  updateNewsPublished,
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

type UseNewsEditorOptions = {
  news?: NewsData | undefined;
  mode: "create" | "edit";
};

function toSettingsFormData(data?: NewsData): NewsSettingsFormData {
  if (!data) {
    return {
      slug: "",
      title: "",
      isPublished: false,
      publishedAt: "",
      contentWidth: null,
      contentWidthCustom: null,
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
    isPublished: Boolean(formData.isPublished),
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
    publishedAt:
      typeof settingsData.publishedAt === "string"
        ? settingsData.publishedAt || null
        : null,
  };
}

export function useNewsEditor({ news, mode }: UseNewsEditorOptions) {
  const router = useRouter();

  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  const { saveAndOpenPreview } = createPreviewHandlers("news");

  // 本文 (contentJson) — 軽量 useState 管理
  const initialContentJson = news?.contentJson
    ? JSON.stringify(news.contentJson)
    : EMPTY_LEXICAL_EDITOR_STATE_JSON;

  const [contentJson, setContentJson] = useState(initialContentJson);
  const [savedContentJson, setSavedContentJson] = useState(initialContentJson);
  const [isPublishedValue, setIsPublishedValue] = useState<boolean>(
    news?.isPublished ?? false,
  );

  const isBodyDirty = contentJson !== savedContentJson;

  // 設定 — conform useForm
  // ledger §5 conform generic invariance — typed-input-control SSoT helper 経由
  const [settingsForm, settingsFields] = useForm<NewsSettingsFormData>({
    id: "news-settings-form",
    constraint: getZodConstraint(newsSettingsFormSchema),
    defaultValue: asConformDefaultValue<NewsSettingsFormData>(
      toSettingsFormData(news),
    ),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: newsSettingsFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const isSettingsDirty = settingsForm.dirty ?? false;
  const isDirty = isBodyDirty || isSettingsDirty;

  const core = useEditorCore({ listPath: "/admin/news" });

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
    if (!news) return;
    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const result = await updateNewsBody(news.id, {
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

  const validateSettings = (): NewsSettingsFormData | null => {
    const formData = new FormData();
    for (const [key, field] of Object.entries(settingsFields)) {
      const fieldValue = field.value;
      if (Array.isArray(fieldValue)) {
        formData.append(key, JSON.stringify(fieldValue));
      } else if (typeof fieldValue === "boolean") {
        if (fieldValue) formData.append(key, "on");
      } else if (fieldValue != null) {
        formData.append(key, String(fieldValue));
      }
    }
    const submission = parseWithZod(formData, {
      schema: newsSettingsFormSchema,
    });
    if (submission.status !== "success") {
      toast.error("入力内容に誤りがあります");
      return null;
    }
    return asConformSubmissionValue<NewsSettingsFormData>(submission.value);
  };

  const onSubmitSettings = () => {
    if (!news) return;
    const settingsData = validateSettings();
    if (!settingsData) return;

    core.startTransition(async () => {
      try {
        const payload = toSettingsSubmitPayload(settingsData);
        const result = await updateNewsSettings(news.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

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
    const settingsData = validateSettings();
    if (!settingsData) {
      setIsSettingsDialogOpen(true);
      return;
    }

    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const result = await createNews({
          slug: settingsData.slug,
          title: settingsData.title,
          contentJson,
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
    if (!news || core.isPending) return;
    core.startTransition(async () => {
      const result = await updateNewsPublished(news.id, true);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("公開しました");
      setIsPublishedValue(true);
      router.refresh();
    });
  };

  const handleUnpublish = () => {
    if (!news || core.isPending) return;
    core.startTransition(async () => {
      const result = await updateNewsPublished(news.id, false);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("下書きに戻しました");
      setIsPublishedValue(false);
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
      const settingsData = validateSettings();
      if (!settingsData) return;
      const identifier =
        mode === "create" ? "preview-new" : slug || "preview-new";
      const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
      const previewData = toPreviewData(settingsData, contentHtml);
      saveAndOpenPreview(identifier, previewData, "/news");
    } catch (error) {
      logger.error("プレビュー生成中にエラーが発生しました", {
        error: getErrorMessage(error),
      });
      toast.error("プレビューの生成に失敗しました");
    }
  };

  const handleBack = () => core.handleBack(isDirty);

  const handleIsPublishedChange = (value: boolean) => {
    setIsPublishedValue(value);
    // conform form.update の value は string 想定のため checkbox value 形式に変換
    settingsForm.update({
      name: settingsFields.isPublished.name,
      value: value ? "on" : "",
    });
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
    isPublished: isPublishedValue,

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
    handleIsPublishedChange,

    isDeleteDialogOpen: core.isDeleteDialogOpen,
    setIsDeleteDialogOpen: core.setIsDeleteDialogOpen,
  };
}
