"use client";

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
  termsSettingsFormSchema,
  type TermsSettingsFormData,
} from "@/admin/lib/validations/terms";
import {
  createTerms,
  updateTerms,
  updateTermsPublished,
  deleteTerms,
} from "@/admin/actions/terms";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
import { tryConvertHtmlStringToLexicalJsonString } from "@/admin/components/editor/lexical/html-to-lexical-json";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { getTermsPreviewHref } from "@/shared/lib/preview-routes";
import type { AdminTermsDetail } from "@/shared/domain/terms/admin-queries";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";

import { useEditorCore } from "./shared";

type UseTermsEditorOptions = {
  terms?: AdminTermsDetail | undefined;
  mode: "create" | "edit";
  initialTemplateHtml?: string | undefined;
  initialTitle?: string | undefined;
};

function toSettingsFormData(
  terms?: AdminTermsDetail,
  initialTitle?: string,
): TermsSettingsFormData {
  if (!terms) {
    return {
      type: "terms-of-use",
      slug: "",
      title: initialTitle ?? "",
      isPublished: false,
      requiredAtReservation: false,
      requiredAtInquiry: false,
      requiredAtSignup: false,
      showInFooter: true,
    };
  }

  return {
    type: terms.type,
    slug: terms.slug,
    title: terms.title,
    isPublished: terms.isPublished,
    requiredAtReservation: terms.requiredAtReservation,
    requiredAtInquiry: terms.requiredAtInquiry,
    requiredAtSignup: terms.requiredAtSignup,
    showInFooter: terms.showInFooter,
  };
}

function initContentJson(
  terms?: AdminTermsDetail,
  initialTemplateHtml?: string,
): string {
  if (terms?.contentJson) {
    return typeof terms.contentJson === "string"
      ? terms.contentJson
      : JSON.stringify(terms.contentJson);
  }
  if (initialTemplateHtml && typeof window !== "undefined") {
    const result = tryConvertHtmlStringToLexicalJsonString(initialTemplateHtml);
    if (result.ok) return result.json;
  }
  return EMPTY_LEXICAL_EDITOR_STATE_JSON;
}

export function useTermsEditor({
  terms,
  mode,
  initialTemplateHtml,
  initialTitle,
}: UseTermsEditorOptions) {
  const router = useRouter();

  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  const initialContentJson = initContentJson(terms, initialTemplateHtml);
  const [contentJson, setContentJson] = useState(initialContentJson);
  const [savedContentJson, setSavedContentJson] = useState(initialContentJson);

  const [isPublishedValue, setIsPublishedValue] = useState<boolean>(
    terms?.isPublished ?? false,
  );
  const [typeValue, setTypeValue] = useState<string>(
    terms?.type ?? "terms-of-use",
  );
  const [requiredAtReservationValue, setRequiredAtReservationValue] =
    useState<boolean>(terms?.requiredAtReservation ?? false);
  const [requiredAtInquiryValue, setRequiredAtInquiryValue] = useState<boolean>(
    terms?.requiredAtInquiry ?? false,
  );
  const [requiredAtSignupValue, setRequiredAtSignupValue] = useState<boolean>(
    terms?.requiredAtSignup ?? false,
  );
  const [showInFooterValue, setShowInFooterValue] = useState<boolean>(
    terms?.showInFooter ?? true,
  );

  const isBodyDirty = contentJson !== savedContentJson;

  const [settingsForm, settingsFields] = useForm<TermsSettingsFormData>({
    id: "terms-settings-form",
    constraint: getZodConstraint(termsSettingsFormSchema),
    defaultValue: asConformDefaultValue<TermsSettingsFormData>(
      toSettingsFormData(terms, initialTitle),
    ),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: termsSettingsFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const isSettingsDirty = settingsForm.dirty ?? false;
  const isDirty = isBodyDirty || isSettingsDirty;

  const core = useEditorCore({ listPath: "/admin/terms" });

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

  const validateSettings = (): TermsSettingsFormData | null => {
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
      schema: termsSettingsFormSchema,
    });
    if (submission.status !== "success") {
      toast.error("入力内容に誤りがあります");
      return null;
    }
    return asConformSubmissionValue<TermsSettingsFormData>(submission.value);
  };

  // 規約は本文 + 設定を単一 `updateTerms` で保存する (Post / News のような
  // body / settings 分割を持たない)。edit 系 3 経路 (本文保存 / 設定保存 /
  // プレビュー) が同一 payload を組むため SSoT helper に集約する。
  const buildUpdateInput = (
    settingsData: TermsSettingsFormData,
    contentHtml: string,
  ) => ({
    type: typeValue,
    slug: settingsData.slug,
    title: settingsData.title,
    contentJson,
    contentHtml,
    isPublished: Boolean(settingsData.isPublished),
    requiredAtReservation: Boolean(settingsData.requiredAtReservation),
    requiredAtInquiry: Boolean(settingsData.requiredAtInquiry),
    requiredAtSignup: Boolean(settingsData.requiredAtSignup),
    showInFooter: Boolean(settingsData.showInFooter),
  });

  const handleSave = () => {
    if (core.isPending) return;

    if (mode === "create") {
      const settingsData = validateSettings();
      if (!settingsData) {
        setIsSettingsDialogOpen(true);
        return;
      }
      core.startTransition(async () => {
        try {
          const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
          const result = await createTerms({
            type: typeValue,
            slug: settingsData.slug,
            title: settingsData.title,
            contentJson,
            contentHtml,
            isPublished: Boolean(settingsData.isPublished),
            requiredAtReservation: Boolean(settingsData.requiredAtReservation),
            requiredAtInquiry: Boolean(settingsData.requiredAtInquiry),
            requiredAtSignup: Boolean(settingsData.requiredAtSignup),
            showInFooter: Boolean(settingsData.showInFooter),
          });
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }
          toast.success("規約を作成しました");
          router.push("/admin/terms");
        } catch (error) {
          logger.error("作成中にエラーが発生しました", {
            error: getErrorMessage(error),
          });
          toast.error("作成中にエラーが発生しました");
        }
      });
      return;
    }

    if (!terms) return;
    const settingsData = validateSettings();
    if (!settingsData) return;
    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const result = await updateTerms(
          terms.id,
          buildUpdateInput(settingsData, contentHtml),
        );
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        setSavedContentJson(contentJson);
        router.refresh();
        toast.success("規約を保存しました");
      } catch (error) {
        logger.error("保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("保存中にエラーが発生しました");
      }
    });
  };

  const handleSaveSettings = () => {
    if (!terms || core.isPending) return;
    const settingsData = validateSettings();
    if (!settingsData) return;
    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const result = await updateTerms(
          terms.id,
          buildUpdateInput(settingsData, contentHtml),
        );
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        setIsSettingsDialogOpen(false);
        router.refresh();
        toast.success("規約設定を保存しました");
      } catch (error) {
        logger.error("設定の保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("設定の保存中にエラーが発生しました");
      }
    });
  };

  const handlePublish = () => {
    if (!terms || core.isPending) return;
    core.startTransition(async () => {
      const result = await updateTermsPublished(terms.id, true);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("公開しました");
      setIsPublishedValue(true);
      settingsForm.update({
        name: settingsFields.isPublished.name,
        value: "on",
      });
      router.refresh();
    });
  };

  const handleUnpublish = () => {
    if (!terms || core.isPending) return;
    core.startTransition(async () => {
      const result = await updateTermsPublished(terms.id, false);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("下書きに戻しました");
      setIsPublishedValue(false);
      settingsForm.update({
        name: settingsFields.isPublished.name,
        value: "",
      });
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!terms) return;
    core.startTransition(async () => {
      try {
        const result = await deleteTerms(terms.id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("規約を削除しました");
        router.push("/admin/terms");
      } catch (error) {
        logger.error("削除中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("削除中にエラーが発生しました");
      }
    });
  };

  // プレビューは Next.js 16 公式推奨の server-side fetch パターン。
  // 設計原則 (WordPress / Notion / Ghost 標準):
  // - 現在の本文 + 設定を save → 新タブで preview URL を開く (preview 先は DB を fetch)
  // - create mode は id がないので「先に保存してください」toast
  //
  // popup blocker 対策: 動的に `<a target="_blank" rel="noreferrer">` を生成し
  // `.click()` で navigation。user gesture context 内のため popup blocker を通過する。
  // `window.open` の noreferrer 指定時の戻り値 null + silent fail を回避する
  // anchor.click() パターン (usePostEditor / useNewsEditor と統一)。
  const handlePreview = () => {
    if (mode === "create" || !terms) {
      toast.error("プレビューには規約の保存が必要です。先に保存してください。");
      return;
    }
    const settingsData = validateSettings();
    if (!settingsData) return;

    core.startTransition(async () => {
      try {
        const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
        const result = await updateTerms(
          terms.id,
          buildUpdateInput(settingsData, contentHtml),
        );
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        setSavedContentJson(contentJson);
        router.refresh();

        const url = getTermsPreviewHref(terms.id);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.click();
      } catch (error) {
        logger.error("プレビュー生成中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("プレビューの生成に失敗しました");
      }
    });
  };

  const closeSettingsDialog = () => {
    setIsSettingsDialogOpen(false);
  };

  const openSettingsDialog = () => {
    setIsSettingsDialogOpen(true);
  };

  const handleBack = () => core.handleBack(isDirty);

  const handleIsPublishedChange = (value: boolean) => {
    setIsPublishedValue(value);
    settingsForm.update({
      name: settingsFields.isPublished.name,
      value: value ? "on" : "",
    });
  };

  const handleTypeChange = (value: string) => {
    setTypeValue(value);
    settingsForm.update({
      name: settingsFields.type.name,
      value,
    });
  };

  const handleRequiredAtReservationChange = (value: boolean) => {
    setRequiredAtReservationValue(value);
    settingsForm.update({
      name: settingsFields.requiredAtReservation.name,
      value: value ? "on" : "",
    });
  };

  const handleRequiredAtInquiryChange = (value: boolean) => {
    setRequiredAtInquiryValue(value);
    settingsForm.update({
      name: settingsFields.requiredAtInquiry.name,
      value: value ? "on" : "",
    });
  };

  const handleRequiredAtSignupChange = (value: boolean) => {
    setRequiredAtSignupValue(value);
    settingsForm.update({
      name: settingsFields.requiredAtSignup.name,
      value: value ? "on" : "",
    });
  };

  const handleShowInFooterChange = (value: boolean) => {
    setShowInFooterValue(value);
    settingsForm.update({
      name: settingsFields.showInFooter.name,
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
    type: typeValue,
    requiredAtReservation: requiredAtReservationValue,
    requiredAtInquiry: requiredAtInquiryValue,
    requiredAtSignup: requiredAtSignupValue,
    showInFooter: showInFooterValue,

    isSettingsDialogOpen,
    openSettingsDialog,
    closeSettingsDialog,

    handleSave,
    handleSaveSettings,
    handlePublish,
    handleUnpublish,
    handleDelete,
    handlePreview,
    handleBack,
    handleContentChange,
    handleIsPublishedChange,
    handleTypeChange,
    handleRequiredAtReservationChange,
    handleRequiredAtInquiryChange,
    handleRequiredAtSignupChange,
    handleShowInFooterChange,

    isDeleteDialogOpen: core.isDeleteDialogOpen,
    setIsDeleteDialogOpen: core.setIsDeleteDialogOpen,
  };
}
