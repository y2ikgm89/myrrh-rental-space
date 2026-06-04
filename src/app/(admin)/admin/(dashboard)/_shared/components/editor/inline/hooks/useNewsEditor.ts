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
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { getNewsPreviewHref } from "@/shared/lib/preview-routes";
import { openPreviewTab } from "@/admin/lib/open-external-tab";
import type { NewsData } from "@/shared/domain/news/types";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";

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

export function useNewsEditor({ news, mode }: UseNewsEditorOptions) {
  const router = useRouter();

  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

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

  // create mode の下書き作成 SSoT。成功時は新規 id、失敗時は null (toast 済) を返す。
  // 「保存して作成」と「未保存プレビュー (auto-draft)」の両経路が共有する。
  const createDraftNews = async (
    settingsData: NewsSettingsFormData,
  ): Promise<string | null> => {
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
        return null;
      }
      return result.id;
    } catch (error) {
      logger.error("作成中にエラーが発生しました", {
        error: getErrorMessage(error),
      });
      toast.error("作成中にエラーが発生しました");
      return null;
    }
  };

  const onCreateBoth = () => {
    const settingsData = validateSettings();
    if (!settingsData) {
      setIsSettingsDialogOpen(true);
      return;
    }
    core.startTransition(async () => {
      const id = await createDraftNews(settingsData);
      if (!id) return;
      toast.success("お知らせを作成しました");
      router.push(`/admin/news/${id}`);
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

  // プレビューは Next.js Draft Mode 相当の server-side fetch パターン
  // (preview route が published filter なし + cache なしで未公開データを表示)。
  // WordPress auto-draft 整合:
  // - create mode: 入力済み内容を下書き (非公開) として自動保存 → preview → edit へ遷移
  //   (以降の保存は更新)。title / slug 未入力なら設定ダイアログを開く。
  // - edit mode: 本文を保存 → preview。
  // 別タブ起動は `openPreviewTab` (anchor.click) で popup blocker + noreferrer を両立。
  const handlePreview = () => {
    if (mode === "create" || !news) {
      const settingsData = validateSettings();
      if (!settingsData) {
        setIsSettingsDialogOpen(true);
        return;
      }
      core.startTransition(async () => {
        const id = await createDraftNews(settingsData);
        if (!id) return;
        openPreviewTab(getNewsPreviewHref(id));
        router.push(`/admin/news/${id}`);
      });
      return;
    }

    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const bodyResult = await updateNewsBody(news.id, {
          contentJson,
          contentHtml,
        });
        if (isMutationError(bodyResult)) {
          toast.error(bodyResult.error);
          return;
        }
        setSavedContentJson(contentJson);
        router.refresh();
        openPreviewTab(getNewsPreviewHref(news.id));
      } catch (error) {
        logger.error("プレビュー生成中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("プレビューの生成に失敗しました");
      }
    });
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
