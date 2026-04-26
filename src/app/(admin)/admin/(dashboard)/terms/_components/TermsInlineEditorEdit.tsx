"use client";

/**
 * 規約インラインエディター — edit 専用
 *
 * edit モード: バージョン選択・公開フロー・バージョン管理を統合
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import { openExternalTab } from "@/admin/lib/open-external-tab";
import {
  EditorHeader,
  InlineEditorShell,
} from "@/admin/components/editor/inline";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import {
  updateTerms,
  updateTermsVersion,
  deleteTerms,
  createTermsVersion,
  publishTermsVersion,
  archiveTermsVersion,
  deleteTermsVersion,
} from "@/admin/actions/terms";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import { TermsStatus } from "@/shared/lib/validations/enums/prisma-types";
import type {
  TermsVersionDetail,
  TermsAgreementItem,
} from "@/shared/lib/validations/terms";
import type { Serialized } from "@/shared/lib/serialize";
import { fetchTermsVersionById } from "./terms-helpers";
import type { TermsVersionSummary, TermsData } from "./terms-helpers";
import { TermsSettingsDialog } from "./TermsSettingsDialog";

// =============================================================================
// Constants
// =============================================================================

const TERMS_CONTENT_WIDTH_PX = 768;

// =============================================================================
// Schema
// =============================================================================

const termsFormSchema = z.object({
  title: z.string().min(1, { error: "タイトルを入力してください" }).max(100),
  slug: z
    .string()
    .min(1, { error: "スラッグを入力してください" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "小文字英数字とハイフンのみ" }),
  type: z.string().min(1, { error: "規約タイプを選択してください" }),
  contentJson: z.string().min(1, { error: "コンテンツを入力してください" }),
  requiredAtReservation: z.boolean(),
  showInFooter: z.boolean(),
});

type FormData = z.infer<typeof termsFormSchema>;

// =============================================================================
// Props
// =============================================================================

interface TermsInlineEditorEditProps {
  terms: TermsData;
  initialVersion: Serialized<TermsVersionDetail> | null;
  initialAgreements: TermsAgreementItem[];
  initialTotal: number;
}

// =============================================================================
// Component
// =============================================================================

export function TermsInlineEditorEdit({
  terms,
  initialVersion,
  initialAgreements,
  initialTotal,
}: TermsInlineEditorEditProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [hasEditorChanges, setHasEditorChanges] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // Version management state
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    initialVersion?.id ?? "",
  );
  const [selectedVersionContent, setSelectedVersionContent] =
    useState<Serialized<TermsVersionDetail> | null>(initialVersion ?? null);
  const [localVersions, setLocalVersions] = useState<TermsVersionSummary[]>(
    terms.versions,
  );
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);

  const hasDraftVersion = localVersions.some(
    (v) => v.status === TermsStatus.DRAFT,
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: standardSchemaResolver(termsFormSchema),
    defaultValues: {
      title: terms.title,
      slug: terms.slug,
      type: terms.type,
      contentJson: initialVersion?.contentJson
        ? JSON.stringify(initialVersion.contentJson)
        : EMPTY_LEXICAL_EDITOR_STATE_JSON,
      requiredAtReservation: terms.requiredAtReservation,
      showInFooter: terms.showInFooter,
    },
  });

  const title = useWatch({ control, name: "title" });
  const contentJson = useWatch({ control, name: "contentJson" });
  const slug = useWatch({ control, name: "slug" });

  // =============================================================================
  // Version management handlers
  // =============================================================================

  const handleVersionSwitch = async (newVersionId: string) => {
    if (isPending || isLoadingVersion || newVersionId === selectedVersionId)
      return;

    if (isDirty || hasEditorChanges) {
      const confirmed = await confirm({
        title: "変更を破棄して切り替えますか？",
        description: "保存されていない変更は失われます。",
        confirmLabel: "切り替える",
        variant: "destructive",
      });
      if (!confirmed) return;
    }

    setIsLoadingVersion(true);
    try {
      const version = await fetchTermsVersionById(newVersionId);
      setValue(
        "contentJson",
        version.contentJson
          ? JSON.stringify(version.contentJson)
          : EMPTY_LEXICAL_EDITOR_STATE_JSON,
        { shouldDirty: false },
      );
      setSelectedVersionContent(version);
      setSelectedVersionId(newVersionId);
      setEditorKey((k) => k + 1);
      setHasEditorChanges(false);
    } catch (error) {
      logger.error("バージョン切り替えに失敗しました", {
        error: getErrorMessage(error),
      });
      toast.error("バージョンの切り替えに失敗しました");
    } finally {
      setIsLoadingVersion(false);
    }
  };

  const handleCreateNewVersion = () => {
    if (isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "新しいバージョンを作成しますか？",
        description: "現在の内容から新しい下書きバージョンを作成します。",
        confirmLabel: "作成する",
      });
      if (!confirmed) return;

      try {
        const result = await createTermsVersion({
          termsId: terms.id,
          contentJson: contentJson || EMPTY_LEXICAL_EDITOR_STATE_JSON,
        });
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        const newVersionSummary: TermsVersionSummary = {
          id: result.id,
          version: result.version,
          status: TermsStatus.DRAFT,
          isCurrentVersion: false,
          publishedAt: null,
          createdAt: new Date().toISOString(),
        };
        setLocalVersions((prev) => [newVersionSummary, ...prev]);
        await handleVersionSwitch(result.id);
        toast.success(`v${result.version} を作成しました`);
      } catch (error) {
        logger.error("バージョン作成に失敗しました", {
          error: getErrorMessage(error),
        });
        toast.error("バージョンの作成に失敗しました");
      }
    });
  };

  const handlePublishVersion = () => {
    if (!selectedVersionId || isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "このバージョンを公開しますか？",
        description: "公開すると現在の公開バージョンが置き換えられます。",
        confirmLabel: "公開する",
      });
      if (!confirmed) return;

      try {
        const result = await publishTermsVersion(selectedVersionId);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        setLocalVersions((prev) =>
          prev.map((v) => ({
            ...v,
            status:
              v.id === selectedVersionId ? TermsStatus.PUBLISHED : v.status,
            isCurrentVersion: v.id === selectedVersionId,
          })),
        );
        setSelectedVersionContent((prev) =>
          prev
            ? {
                ...prev,
                status: TermsStatus.PUBLISHED,
                isCurrentVersion: true,
              }
            : null,
        );
        toast.success("バージョンを公開しました");
        router.refresh();
      } catch (error) {
        logger.error("公開に失敗しました", { error: getErrorMessage(error) });
        toast.error("公開に失敗しました");
      }
    });
  };

  const handleArchiveVersion = () => {
    if (!selectedVersionId || isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "このバージョンをアーカイブしますか？",
        description:
          "アーカイブすると現在のバージョンとして使用できなくなります。",
        confirmLabel: "アーカイブ",
        variant: "destructive",
      });
      if (!confirmed) return;

      try {
        const result = await archiveTermsVersion(selectedVersionId);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        setLocalVersions((prev) =>
          prev.map((v) =>
            v.id === selectedVersionId
              ? {
                  ...v,
                  status: TermsStatus.ARCHIVED,
                  isCurrentVersion: false,
                }
              : v,
          ),
        );
        setSelectedVersionContent((prev) =>
          prev
            ? {
                ...prev,
                status: TermsStatus.ARCHIVED,
                isCurrentVersion: false,
              }
            : null,
        );
        toast.success("バージョンをアーカイブしました");
      } catch (error) {
        logger.error("アーカイブに失敗しました", {
          error: getErrorMessage(error),
        });
        toast.error("アーカイブに失敗しました");
      }
    });
  };

  const handleDeleteVersion = () => {
    if (!selectedVersionId || isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "このバージョンを削除しますか？",
        description: "この操作は取り消せません。",
        confirmLabel: "削除",
        variant: "destructive",
      });
      if (!confirmed) return;

      try {
        const result = await deleteTermsVersion(selectedVersionId);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        const newVersions = localVersions.filter(
          (v) => v.id !== selectedVersionId,
        );
        setLocalVersions(newVersions);
        const firstVersion = newVersions[0];
        if (firstVersion) {
          await handleVersionSwitch(firstVersion.id);
        } else {
          setSelectedVersionId("");
          setSelectedVersionContent(null);
          setEditorKey((k) => k + 1);
        }
        toast.success("バージョンを削除しました");
      } catch (error) {
        logger.error("バージョン削除に失敗しました", {
          error: getErrorMessage(error),
        });
        toast.error("バージョンの削除に失敗しました");
      }
    });
  };

  // =============================================================================
  // Common handlers
  // =============================================================================

  const handleJsonChange = (json: string) => {
    setValue("contentJson", json, { shouldDirty: true });
    setHasEditorChanges(true);
  };

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        // 基本情報の更新（title/slug が変更されている場合）
        if (isDirty) {
          const updateResult = await updateTerms(terms.id, {
            title: data.title,
            slug: data.slug,
            requiredAtReservation: data.requiredAtReservation,
            showInFooter: data.showInFooter,
          });
          if (isMutationError(updateResult)) {
            toast.error(updateResult.error);
            return;
          }
        }

        // DRAFT バージョンのコンテンツ更新
        if (
          hasEditorChanges &&
          selectedVersionContent?.status === TermsStatus.DRAFT
        ) {
          const versionResult = await updateTermsVersion(selectedVersionId, {
            contentJson: data.contentJson,
          });
          if (isMutationError(versionResult)) {
            toast.error(versionResult.error);
            return;
          }
        }

        // PUBLISHED バージョン選択中でコンテンツ変更あり → 新バージョン作成を提案
        if (
          hasEditorChanges &&
          selectedVersionContent &&
          selectedVersionContent.status !== TermsStatus.DRAFT
        ) {
          const confirmed = await confirm({
            title: "新しいバージョンを作成しますか？",
            description:
              "公開済みバージョンは直接編集できません。新しい下書きバージョンを作成して変更を保存します。",
            confirmLabel: "作成する",
          });
          if (!confirmed) return;

          const versionResult = await createTermsVersion({
            termsId: terms.id,
            contentJson: data.contentJson,
          });
          if (isMutationError(versionResult)) {
            toast.error(versionResult.error);
            return;
          }

          const newVersionSummary: TermsVersionSummary = {
            id: versionResult.id,
            version: versionResult.version,
            status: TermsStatus.DRAFT,
            isCurrentVersion: false,
            publishedAt: null,
            createdAt: new Date().toISOString(),
          };
          setLocalVersions((prev) => [newVersionSummary, ...prev]);
          await handleVersionSwitch(versionResult.id);
          toast.success(`v${versionResult.version} として保存しました`);
          return;
        }

        reset(data);
        setHasEditorChanges(false);
        setIsSettingsDialogOpen(false);
        router.refresh();
        toast.success("保存しました");
      } catch (error) {
        logger.error("保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("保存中にエラーが発生しました");
      }
    });
  };

  const handleSave = () => {
    if (isPending) return;
    handleSubmit(onSubmit)();
  };

  const handlePreview = () => {
    if (isDirty || hasEditorChanges) {
      toast.info("プレビューには保存済みのコンテンツが表示されます");
    }
    openExternalTab(`/terms/${terms.slug}`);
  };

  const handleBack = async () => {
    const isUnsaved = isDirty || hasEditorChanges;
    if (isUnsaved) {
      const confirmed = await confirm({
        title: "変更を破棄しますか？",
        description:
          "保存されていない変更があります。破棄してもよろしいですか？",
        confirmLabel: "破棄",
        variant: "destructive",
      });
      if (!confirmed) return;
    }
    router.push("/admin/terms");
  };

  const handleDeleteTerms = () => {
    startTransition(async () => {
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

  const isFormDirty = isDirty || hasEditorChanges;

  // =============================================================================
  // Render
  // =============================================================================

  const deleteDialog = (
    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
        >
          削除
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>規約を削除しますか？</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。すべてのバージョンが削除されます。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsDeleteDialogOpen(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteTerms}
            disabled={isPending}
          >
            {isPending ? "削除中..." : "削除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <InlineEditorShell
        onSave={handleSave}
        isDirty={isFormDirty}
        header={
          <EditorHeader
            title={title || terms.title}
            slug={`terms/${(slug || terms.slug) ?? ""}`}
            isDirty={isFormDirty}
            isPending={isPending || isLoadingVersion}
            onOpenSettings={() => setIsSettingsDialogOpen(true)}
            metadataPanelLabel="規約設定"
            onSave={handleSave}
            onPreview={handlePreview}
            onBack={handleBack}
            extraActions={deleteDialog}
          />
        }
      >
        <LazyLexicalEditor
          key={editorKey}
          contentJson={contentJson || EMPTY_LEXICAL_EDITOR_STATE_JSON}
          onChange={handleJsonChange}
          disabled={isPending || isLoadingVersion}
          className={EDITOR_PROSE_CLASSES}
          showToolbar
          height="100%"
          contentWidth={TERMS_CONTENT_WIDTH_PX}
        />
      </InlineEditorShell>

      <TermsSettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        mode="edit"
        register={register}
        control={control}
        errors={errors}
        isPending={isPending}
        isFormDirty={isFormDirty}
        onSubmit={handleSubmit(onSubmit)}
        termsId={terms.id}
        initialAgreements={initialAgreements}
        initialTotal={initialTotal}
        localVersions={localVersions}
        selectedVersionId={selectedVersionId}
        selectedVersionContent={selectedVersionContent}
        hasDraftVersion={hasDraftVersion}
        isLoadingVersion={isLoadingVersion}
        onVersionSwitch={(id) => void handleVersionSwitch(id)}
        onCreateNewVersion={handleCreateNewVersion}
        onPublishVersion={handlePublishVersion}
        onArchiveVersion={handleArchiveVersion}
        onDeleteVersion={handleDeleteVersion}
      />
    </>
  );
}
