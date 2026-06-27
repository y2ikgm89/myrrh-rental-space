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
import { getTermsPreviewHref } from "@/shared/lib/preview-routes";
import { openPreviewTab } from "@/admin/lib/open-external-tab";
import type { AdminTermsDetail } from "@/shared/domain/terms/admin-queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";

import { useEditorCore } from "./shared";

type UseTermsEditorOptions = {
  terms?: AdminTermsDetail | undefined;
  mode: "create" | "edit";
  initialTemplateJson?: string | undefined;
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
      scopes: [],
      changelog: null,
      showInFooter: true,
    };
  }

  return {
    type: terms.type,
    slug: terms.slug,
    title: terms.title,
    isPublished: terms.isPublished,
    scopes: terms.scopes,
    changelog: terms.changelog,
    showInFooter: terms.showInFooter,
  };
}

function initContentJson(
  terms?: AdminTermsDetail,
  initialTemplateJson?: string,
): string {
  if (!terms) {
    return initialTemplateJson ?? EMPTY_LEXICAL_EDITOR_STATE_JSON;
  }

  return terms.contentJson
    ? typeof terms.contentJson === "string"
      ? terms.contentJson
      : JSON.stringify(terms.contentJson)
    : EMPTY_LEXICAL_EDITOR_STATE_JSON;
}

export function useTermsEditor({
  terms,
  mode,
  initialTemplateJson,
  initialTitle,
}: UseTermsEditorOptions) {
  const router = useRouter();

  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  const initialContentJson = initContentJson(terms, initialTemplateJson);
  const [contentJson, setContentJson] = useState(initialContentJson);
  const [savedContentJson, setSavedContentJson] = useState(initialContentJson);

  const [isPublishedValue, setIsPublishedValue] = useState<boolean>(
    terms?.isPublished ?? false,
  );
  const [typeValue, setTypeValue] = useState<string>(
    terms?.type ?? "terms-of-use",
  );
  const [scopesValue, setScopesValue] = useState<readonly TermsScope[]>(
    terms?.scopes ?? [],
  );
  const [changelogValue, setChangelogValue] = useState<string>(
    terms?.changelog ?? "",
  );
  const [showInFooterValue, setShowInFooterValue] = useState<boolean>(
    terms?.showInFooter ?? true,
  );

  // settingsForm の外部 state (Select / Checkbox group / Textarea) は dirty を
  // form.update() 経由で伝搬しているが、初期値と一致する update を一度噛ませた
  // ケース等で dirty 検知が漏れることがあるため、外部 state ベースの差分も
  // 集約して isDirty 判定に合流させる。
  const initialType = terms?.type ?? "terms-of-use";
  const initialScopes = terms?.scopes ?? [];
  const initialChangelog = terms?.changelog ?? "";
  const initialIsPublished = terms?.isPublished ?? false;
  const initialShowInFooter = terms?.showInFooter ?? true;

  const isExternalDirty =
    typeValue !== initialType ||
    JSON.stringify([...scopesValue].sort()) !==
      JSON.stringify([...initialScopes].sort()) ||
    changelogValue !== initialChangelog ||
    isPublishedValue !== initialIsPublished ||
    showInFooterValue !== initialShowInFooter;

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

  const isSettingsDirty = settingsForm.dirty ?? isExternalDirty;
  const isDirty = isBodyDirty || isSettingsDirty || isExternalDirty;

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
        for (const v of fieldValue) {
          formData.append(key, String(v));
        }
      } else if (typeof fieldValue === "boolean") {
        // OFF も明示的に空文字を送ることで preprocess 側の dirty 検知漏れを防ぐ。
        // booleanFromCheckbox は "on" / true → true, それ以外 → false に正規化する。
        formData.append(key, fieldValue ? "on" : "");
      } else if (fieldValue != null) {
        formData.append(key, String(fieldValue));
      }
    }
    // 外部 state (Switch / multi-checkbox / Textarea) を上書き反映。form.update
    // が dirty 連動しないケースで信頼できる SSoT として外部値を最終的に勝たせる。
    formData.set("type", typeValue);
    formData.delete("scopes");
    for (const s of scopesValue) {
      formData.append("scopes", String(s));
    }
    formData.set("changelog", changelogValue);
    formData.set("isPublished", isPublishedValue ? "on" : "");
    formData.set("showInFooter", showInFooterValue ? "on" : "");

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
  const buildUpdateInput = (settingsData: TermsSettingsFormData) => ({
    type: typeValue,
    slug: settingsData.slug,
    title: settingsData.title,
    contentJson,
    isPublished: Boolean(settingsData.isPublished),
    scopes: [...scopesValue],
    changelog:
      changelogValue.trim().length === 0 ? null : changelogValue.trim(),
    showInFooter: Boolean(settingsData.showInFooter),
  });

  // create mode の下書き作成 SSoT。成功時は新規 id、失敗時は null (toast 済) を返す。
  // 「保存して作成」と「未保存プレビュー (auto-draft)」の両経路が共有する。
  const createDraftTerms = async (
    settingsData: TermsSettingsFormData,
  ): Promise<string | null> => {
    try {
      const result = await createTerms(buildUpdateInput(settingsData));
      if (isMutationError(result)) {
        toast.error(result.error);
        // slug 衝突時は設定ダイアログを開いて編集者が修正できる導線を作る。
        if (/スラッグ|slug/i.test(result.error)) {
          setIsSettingsDialogOpen(true);
        }
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

  const handleSave = () => {
    if (core.isPending) return;

    if (mode === "create") {
      const settingsData = validateSettings();
      if (!settingsData) {
        setIsSettingsDialogOpen(true);
        return;
      }
      core.startTransition(async () => {
        const id = await createDraftTerms(settingsData);
        if (!id) return;
        toast.success("規約を作成しました");
        router.push(`/admin/terms/${id}/edit`);
      });
      return;
    }

    if (!terms) return;
    const settingsData = validateSettings();
    if (!settingsData) return;
    core.startTransition(async () => {
      try {
        const result = await updateTerms(
          terms.id,
          buildUpdateInput(settingsData),
        );
        if (isMutationError(result)) {
          toast.error(result.error);
          if (/スラッグ|slug/i.test(result.error)) {
            setIsSettingsDialogOpen(true);
          }
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
        const result = await updateTerms(
          terms.id,
          buildUpdateInput(settingsData),
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

  // プレビューは Next.js Draft Mode 相当の server-side fetch パターン
  // (preview route が published filter なし + cache なしで未公開データを表示)。
  const handlePreview = () => {
    if (mode === "create" || !terms) {
      const settingsData = validateSettings();
      if (!settingsData) {
        setIsSettingsDialogOpen(true);
        return;
      }
      core.startTransition(async () => {
        const id = await createDraftTerms(settingsData);
        if (!id) return;
        openPreviewTab(getTermsPreviewHref(id));
        router.push(`/admin/terms/${id}/edit`);
      });
      return;
    }

    const settingsData = validateSettings();
    if (!settingsData) return;

    core.startTransition(async () => {
      try {
        const result = await updateTerms(
          terms.id,
          buildUpdateInput(settingsData),
        );
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        setSavedContentJson(contentJson);
        router.refresh();
        openPreviewTab(getTermsPreviewHref(terms.id));
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

  const handleScopesChange = (next: readonly TermsScope[]) => {
    setScopesValue(next);
    // scopes は外部 state (scopesValue) で SSoT 管理し、validateSettings の
    // FormData 再構築段階で SetMultiple として送信する。conform `form.update`
    // は array fields に対する型互換性が string-literal union 配列で破綻する
    // (DefaultValue<TermsScope[]> != string[]) ため、Checkbox group は外部
    // state を直接参照し、dirty 検知は isExternalDirty に委ねる。
  };

  const handleChangelogChange = (value: string) => {
    setChangelogValue(value);
    settingsForm.update({
      name: settingsFields.changelog.name,
      value,
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
    scopes: scopesValue,
    changelog: changelogValue,
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
    handleScopesChange,
    handleChangelogChange,
    handleShowInFooterChange,

    isDeleteDialogOpen: core.isDeleteDialogOpen,
    setIsDeleteDialogOpen: core.setIsDeleteDialogOpen,
  };
}
