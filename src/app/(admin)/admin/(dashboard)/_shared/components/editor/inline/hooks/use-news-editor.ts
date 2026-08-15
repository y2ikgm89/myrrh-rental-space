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
import { parseWithZod, getZodConstraint } from "@conform-to/zod/v4";
import type { z } from "zod";
import { toast } from "sonner";
import { newsSettingsFormSchema } from "@/admin/lib/validations/news";
import {
  createNews,
  updateNewsBody,
  updateNewsSettings,
  deleteNews,
  updateNewsPublished,
} from "@/admin/actions/news";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { clearDraft } from "@/admin/components/editor/lexical/plugins/AutoSavePlugin";
import { useDraftRecovery } from "@/admin/components/editor/lexical/use-draft-recovery";
import { getNewsPreviewHref } from "@/shared/lib/preview-routes";
import { openPreviewTab } from "@/admin/lib/open-external-tab";
import type { NewsData } from "@/shared/domain/news/types";
import { logger } from "@/shared/lib/errors/logger-core";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";

import {
  useEditorCore,
  toFormDateString,
  toFormString,
  toFormContentWidth,
  toFormNumberString,
  toNullableString,
} from "./shared";
import { buildNewsSettingsFormData } from "./news-settings-form-data";

type UseNewsEditorOptions = {
  news?: NewsData | undefined;
  mode: "create" | "edit";
};

export type NewsSettingsFormState = {
  slug: string;
  title: string;
  isPublished: boolean;
  publishedAt: string;
  contentWidth: string;
  contentWidthCustom: string;
  metaDescription: string;
  metaKeywords: string;
  ogpTitle: string;
  ogpDescription: string;
  ogpImageUrl: string;
};

function toSettingsFormData(data?: NewsData): NewsSettingsFormState {
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

type ParsedNewsSettingsFormData = z.output<typeof newsSettingsFormSchema>;

function toSettingsSubmitPayload(formData: ParsedNewsSettingsFormData) {
  return {
    slug: formData.slug,
    title: formData.title,
    isPublished: Boolean(formData.isPublished),
    publishedAt: formData.publishedAt || null,
    contentWidth: formData.contentWidth ?? null,
    contentWidthCustom: formData.contentWidthCustom ?? null,
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

  // LocalStorage 下書き自動保存のキー（AutoSavePlugin が `lexical-draft:` prefix を付与）
  const autoSaveKey = news ? `news-${news.id}` : "news-new";

  const [contentJson, setContentJson] = useState(initialContentJson);
  const [savedContentJson, setSavedContentJson] = useState(initialContentJson);
  const [isPublishedValue, setIsPublishedValue] = useState<boolean>(
    news?.isPublished ?? false,
  );
  const [settingsSnapshot, setSettingsSnapshot] =
    useState<ParsedNewsSettingsFormData | null>(null);

  // Lexical エディタは非制御コンポーネント（初期値のみ使用）のため、下書き復元を
  // 画面に反映するには key 変更によるアンマウント/リマウントが必要
  const [editorResetKey, setEditorResetKey] = useState(0);
  const draftRecovery = useDraftRecovery({
    autoSaveKey,
    initialContentJson,
    onRestore: (json) => {
      setContentJson(json);
      setEditorResetKey((prev) => prev + 1);
    },
  });

  const isBodyDirty = contentJson !== savedContentJson;

  // 設定 — conform useForm
  // conform generic invariance — typed-input-control SSoT helper 経由
  const [settingsForm, settingsFields] = useForm<
    NewsSettingsFormState,
    ParsedNewsSettingsFormData
  >({
    id: "news-settings-form",
    constraint: getZodConstraint(newsSettingsFormSchema),
    defaultValue: toSettingsFormData(news),
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
    settingsSnapshot?.title ??
    (typeof settingsFields.title.value === "string"
      ? settingsFields.title.value
      : "");
  const slug =
    settingsSnapshot?.slug ??
    (typeof settingsFields.slug.value === "string"
      ? settingsFields.slug.value
      : "");

  const handleContentChange = (json: string) => {
    setContentJson(json);
  };

  const onSubmitBody = () => {
    if (!news) return;
    core.startTransition(async () => {
      try {
        const result = await updateNewsBody(news.id, {
          contentJson,
        });
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        setSavedContentJson(contentJson);
        clearDraft(autoSaveKey);
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

  const validateSettings = (): ParsedNewsSettingsFormData | null => {
    const settingsContainer = document.querySelector<HTMLElement>(
      `[data-settings-form-container="${settingsForm.id}"]`,
    );

    const formData = buildNewsSettingsFormData(settingsContainer, {
      slug,
      title,
      isPublished: isPublishedValue,
      publishedAt:
        typeof settingsFields.publishedAt.value === "string"
          ? settingsFields.publishedAt.value
          : "",
      contentWidth:
        typeof settingsFields.contentWidth.value === "string"
          ? settingsFields.contentWidth.value
          : "",
      contentWidthCustom:
        typeof settingsFields.contentWidthCustom.value === "string"
          ? settingsFields.contentWidthCustom.value
          : "",
      metaDescription:
        typeof settingsFields.metaDescription.value === "string"
          ? settingsFields.metaDescription.value
          : "",
      metaKeywords:
        typeof settingsFields.metaKeywords.value === "string"
          ? settingsFields.metaKeywords.value
          : "",
      ogpTitle:
        typeof settingsFields.ogpTitle.value === "string"
          ? settingsFields.ogpTitle.value
          : "",
      ogpDescription:
        typeof settingsFields.ogpDescription.value === "string"
          ? settingsFields.ogpDescription.value
          : "",
      ogpImageUrl:
        typeof settingsFields.ogpImageUrl.value === "string"
          ? settingsFields.ogpImageUrl.value
          : "",
    });

    const submission = parseWithZod(formData, {
      schema: newsSettingsFormSchema,
    });
    if (submission.status !== "success") {
      toast.error("入力内容に誤りがあります");
      return null;
    }
    return submission.value;
  };

  const getSettingsDataForSubmit = (): ParsedNewsSettingsFormData | null => {
    if (!isSettingsDialogOpen && settingsSnapshot) {
      return settingsSnapshot;
    }

    return validateSettings();
  };

  const onSubmitSettings = () => {
    const settingsData = validateSettings();
    if (!settingsData) return;

    if (mode === "create" || !news) {
      setSettingsSnapshot(settingsData);
      setIsSettingsDialogOpen(false);
      toast.success("お知らせ設定を保存しました");
      return;
    }

    core.startTransition(async () => {
      try {
        const payload = toSettingsSubmitPayload(settingsData);
        const result = await updateNewsSettings(news.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        setSettingsSnapshot(settingsData);
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

  // create mode の作成 SSoT。成功時は新規 id、失敗時は null (toast 済) を返す。
  // 「保存して作成」は設定の公開状態を尊重し、プレビュー auto-create は常に下書き強制。
  const createDraftNews = async (
    settingsData: ParsedNewsSettingsFormData,
    options?: { forceDraft?: boolean },
  ): Promise<string | null> => {
    const settingsPayload = toSettingsSubmitPayload(settingsData);
    const forceDraft = options?.forceDraft === true;
    try {
      const result = await createNews({
        slug: settingsPayload.slug,
        title: settingsPayload.title,
        contentJson,
        isPublished: forceDraft ? false : settingsPayload.isPublished,
        publishedAt: forceDraft ? null : settingsPayload.publishedAt,
        contentWidth: settingsPayload.contentWidth,
        contentWidthCustom: settingsPayload.contentWidthCustom,
        metaDescription: settingsPayload.metaDescription,
        metaKeywords: settingsPayload.metaKeywords,
        ogpTitle: settingsPayload.ogpTitle,
        ogpDescription: settingsPayload.ogpDescription,
        ogpImageUrl: settingsPayload.ogpImageUrl,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return null;
      }
      // create mode の下書きキー ("news-new") は id 確定後に不要になるため明示的に破棄する
      clearDraft(autoSaveKey);
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
    const settingsData = getSettingsDataForSubmit();
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
  // - edit mode: 設定と本文を保存 → preview。
  // 別タブ起動は `openPreviewTab` (anchor.click) で popup blocker + noreferrer を両立。
  const handlePreview = () => {
    if (mode === "create" || !news) {
      const settingsData = getSettingsDataForSubmit();
      if (!settingsData) {
        setIsSettingsDialogOpen(true);
        return;
      }
      core.startTransition(async () => {
        // プレビュー経路は設定の公開フラグを無視し、誤公開を防ぐ
        const id = await createDraftNews(settingsData, { forceDraft: true });
        if (!id) return;
        openPreviewTab(getNewsPreviewHref(id));
        router.push(`/admin/news/${id}`);
      });
      return;
    }

    const settingsData = getSettingsDataForSubmit();
    if (!settingsData) {
      setIsSettingsDialogOpen(true);
      return;
    }

    core.startTransition(async () => {
      try {
        const settingsResult = await updateNewsSettings(
          news.id,
          toSettingsSubmitPayload(settingsData),
        );
        if (isMutationError(settingsResult)) {
          toast.error(settingsResult.error);
          if (/スラッグ|slug/i.test(settingsResult.error)) {
            setIsSettingsDialogOpen(true);
          }
          return;
        }

        const bodyResult = await updateNewsBody(news.id, {
          contentJson,
        });
        if (isMutationError(bodyResult)) {
          toast.error(bodyResult.error);
          return;
        }
        setSavedContentJson(contentJson);
        clearDraft(autoSaveKey);
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

    autoSaveKey,
    editorResetKey,
    draftRecovery,

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
