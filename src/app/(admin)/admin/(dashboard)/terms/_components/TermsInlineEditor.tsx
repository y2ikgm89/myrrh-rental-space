"use client";

/**
 * 規約インラインエディター
 *
 * create モード: 規約新規作成（テンプレート選択あり）
 * edit モード: バージョン選択・公開フロー・バージョン管理を統合
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import {
  EditorHeader,
  SidePanelShell,
  InlineEditorShell,
} from "@/admin/components/editor/inline";
import {
  LazyLexicalEditor,
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  tryConvertHtmlStringToLexicalJsonString,
} from "@/admin/components/editor/lexical";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  createTermsWithVersion,
  updateTerms,
  updateTermsVersion,
  deleteTerms,
  createTermsVersion,
  publishTermsVersion,
  archiveTermsVersion,
  deleteTermsVersion,
} from "@/admin/actions/terms";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import { TERMS_TYPES, parseTermsType } from "@/shared/lib/validations/terms";
import {
  getTemplatesForType,
  applyBusinessInfo,
  type BusinessInfo,
} from "@/shared/lib/terms-templates";
import { TermsStatus, type TermsType } from "@/shared/db/enums";
import type {
  TermsVersionDetail,
  TermsAgreementItem,
} from "@/shared/lib/validations/terms";
import type { Serialized } from "@/shared/lib/serialize";
import { TermsAgreementsTab } from "./TermsAgreementsTab";

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
  selectedTemplate: z.string().optional(),
});

type FormData = z.infer<typeof termsFormSchema>;

// =============================================================================
// Types
// =============================================================================

interface TermsVersionSummary {
  id: string;
  version: number;
  status: TermsStatus;
  isCurrentVersion: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface TermsData {
  id: string;
  title: string;
  slug: string;
  type: TermsType;
  isActive: boolean;
  versions: TermsVersionSummary[];
}

interface TermsInlineEditorProps {
  terms?: TermsData;
  initialVersion?: Serialized<TermsVersionDetail> | null;
  businessInfo?: BusinessInfo;
  mode?: "create" | "edit";
  initialAgreements?: TermsAgreementItem[];
  initialTotal?: number;
}

async function fetchTermsDefaultsForType(type: string): Promise<{
  title: string;
  slug: string;
} | null> {
  return fetchAdminJson(
    `/admin/api/terms/defaults/${encodeURIComponent(type)}`,
  );
}

async function fetchTermsVersionById(
  versionId: string,
): Promise<Serialized<TermsVersionDetail>> {
  return fetchAdminJson(`/admin/api/terms/versions/${versionId}`);
}

// =============================================================================
// Helpers
// =============================================================================

function versionLabel(v: TermsVersionSummary): string {
  return `v${v.version} ${
    v.status === TermsStatus.DRAFT
      ? "（下書き）"
      : v.status === TermsStatus.PUBLISHED
        ? v.isCurrentVersion
          ? "（公開中・現行）"
          : "（公開済み）"
        : "（アーカイブ）"
  }`;
}

function statusBadgeVariant(
  status: TermsStatus,
): "default" | "secondary" | "outline" {
  if (status === TermsStatus.PUBLISHED) return "default";
  if (status === TermsStatus.DRAFT) return "secondary";
  return "outline";
}

function statusLabel(status: TermsStatus): string {
  if (status === TermsStatus.PUBLISHED) return "公開中";
  if (status === TermsStatus.DRAFT) return "下書き";
  return "アーカイブ";
}

// =============================================================================
// Component
// =============================================================================

export function TermsInlineEditor({
  terms,
  initialVersion,
  businessInfo,
  mode = "edit",
  initialAgreements = [],
  initialTotal = 0,
}: TermsInlineEditorProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [hasEditorChanges, setHasEditorChanges] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  // Version management state (edit mode only)
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    initialVersion?.id ?? "",
  );
  const [selectedVersionContent, setSelectedVersionContent] =
    useState<Serialized<TermsVersionDetail> | null>(initialVersion ?? null);
  const [localVersions, setLocalVersions] = useState<TermsVersionSummary[]>(
    terms?.versions ?? [],
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
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: standardSchemaResolver(termsFormSchema),
    defaultValues: terms
      ? {
          title: terms.title,
          slug: terms.slug,
          type: terms.type,
          contentJson: initialVersion?.contentJson
            ? JSON.stringify(initialVersion.contentJson)
            : EMPTY_LEXICAL_EDITOR_STATE_JSON,
          selectedTemplate: "",
        }
      : {
          title: "",
          slug: "",
          type: "",
          contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
          selectedTemplate: "",
        },
  });

  const title = useWatch({ control, name: "title" });
  const contentJson = useWatch({ control, name: "contentJson" });
  const slug = useWatch({ control, name: "slug" });
  const selectedTypeRaw = useWatch({ control, name: "type" });
  const selectedTemplate = useWatch({ control, name: "selectedTemplate" });

  const selectedType = parseTermsType(selectedTypeRaw);
  const templates = selectedType ? getTemplatesForType(selectedType) : [];

  // =============================================================================
  // Create mode handlers
  // =============================================================================

  const handleTypeChange = async (newType: string) => {
    setValue("type", newType, { shouldDirty: true });
    if (mode !== "create") return;
    const defaults = await fetchTermsDefaultsForType(newType);
    if (!defaults) return;
    setValue("title", defaults.title, { shouldDirty: true });
    setValue("slug", defaults.slug, { shouldDirty: true });
    setValue("selectedTemplate", "");
  };

  const handleTemplateChange = (templateId: string) => {
    setValue("selectedTemplate", templateId);
    if (templateId === "blank") {
      setValue("contentJson", EMPTY_LEXICAL_EDITOR_STATE_JSON, {
        shouldDirty: true,
      });
      setEditorKey((k) => k + 1);
      setHasEditorChanges(true);
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const appliedContent = businessInfo
        ? applyBusinessInfo(template.content, businessInfo)
        : template.content;
      const converted = tryConvertHtmlStringToLexicalJsonString(appliedContent);
      if (!converted.ok) {
        toast.error(converted.error);
        return;
      }
      setValue("contentJson", converted.json, { shouldDirty: true });
      setEditorKey((k) => k + 1);
      setHasEditorChanges(true);
    }
  };

  // =============================================================================
  // Version management handlers (edit mode only)
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
    if (!terms || isPending) return;
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
        const termsType = parseTermsType(data.type);
        if (!termsType) {
          toast.error("無効な規約タイプです");
          return;
        }

        if (mode === "create") {
          const result = await createTermsWithVersion({
            title: data.title,
            slug: data.slug,
            type: termsType,
            isActive: true,
            contentJson: data.contentJson,
          });
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }

          toast.success("規約を作成しました");
          router.push(`/admin/terms/${result.id}/edit`);
          return;
        }

        if (!terms) return;

        // 基本情報の更新（title/slug が変更されている場合）
        if (isDirty) {
          const updateResult = await updateTerms(terms.id, {
            title: data.title,
            slug: data.slug,
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

        setHasEditorChanges(false);
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
    if (mode === "create") {
      toast.info("規約を作成後にプレビューできます");
      return;
    }
    if (isDirty || hasEditorChanges) {
      toast.info("プレビューには保存済みのコンテンツが表示されます");
    }
    if (terms) {
      window.open(`/terms/${terms.slug}`, "_blank");
    }
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
    if (!terms) return;
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

  const deleteDialog =
    mode === "edit" && terms ? (
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
    ) : undefined;

  return (
    <InlineEditorShell
      onSubmit={handleSubmit(onSubmit)}
      onSave={handleSave}
      isDirty={isFormDirty}
      isPanelOpen={isSidePanelOpen}
      header={
        <EditorHeader
          title={
            title || (mode === "create" ? "新規規約" : (terms?.title ?? ""))
          }
          slug={
            mode === "create"
              ? "terms/new"
              : `terms/${(slug || terms?.slug) ?? ""}`
          }
          isDirty={isFormDirty}
          isPending={isPending || isLoadingVersion}
          isSidePanelOpen={isSidePanelOpen}
          onToggleSidePanel={() => setIsSidePanelOpen((prev) => !prev)}
          onSave={handleSave}
          onPreview={handlePreview}
          onBack={handleBack}
          extraActions={deleteDialog}
        />
      }
      panel={
        <SidePanelShell
          isOpen={isSidePanelOpen}
          onClose={() => setIsSidePanelOpen(false)}
          title="規約設定"
          width="default"
        >
          <Tabs
            defaultValue={mode === "edit" ? "version" : "settings"}
            className="w-full"
          >
            <TabsList
              className={`grid w-full ${mode === "edit" ? "grid-cols-3" : "grid-cols-1"}`}
            >
              {mode === "edit" && (
                <TabsTrigger value="version">バージョン</TabsTrigger>
              )}
              <TabsTrigger value="settings">設定</TabsTrigger>
              {mode === "edit" && (
                <TabsTrigger value="agreements">
                  同意
                  {initialTotal > 0 && (
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                      {initialTotal}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {/* バージョン管理タブ（edit モードのみ） */}
            {mode === "edit" && (
              <TabsContent value="version" className="mt-4 space-y-4">
                {localVersions.length > 0 ? (
                  <div className="space-y-3">
                    {/* 選択中バージョンのバッジ */}
                    {selectedVersionContent && (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={statusBadgeVariant(
                            selectedVersionContent.status,
                          )}
                        >
                          v{selectedVersionContent.version}{" "}
                          {statusLabel(selectedVersionContent.status)}
                        </Badge>
                        {selectedVersionContent.isCurrentVersion && (
                          <span className="text-xs text-muted-foreground">
                            現行
                          </span>
                        )}
                      </div>
                    )}

                    {/* バージョン選択ドロップダウン */}
                    <Select
                      value={selectedVersionId}
                      onValueChange={(id) => void handleVersionSwitch(id)}
                      disabled={isPending || isLoadingVersion}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="バージョンを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {localVersions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {versionLabel(v)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* バージョン別アクション */}
                    {selectedVersionContent?.status === TermsStatus.DRAFT && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handlePublishVersion}
                          disabled={isPending}
                          className="flex-1"
                        >
                          公開する
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={handleDeleteVersion}
                          disabled={isPending}
                        >
                          削除
                        </Button>
                      </div>
                    )}

                    {selectedVersionContent?.status === TermsStatus.PUBLISHED &&
                      !selectedVersionContent.isCurrentVersion && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleArchiveVersion}
                          disabled={isPending}
                          className="w-full"
                        >
                          アーカイブ
                        </Button>
                      )}

                    {selectedVersionContent?.status ===
                      TermsStatus.ARCHIVED && (
                      <p className="text-xs text-muted-foreground">
                        アーカイブ済み（参照のみ）
                      </p>
                    )}

                    {/* 新しいバージョンを作成 */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCreateNewVersion}
                      disabled={
                        isPending || isLoadingVersion || hasDraftVersion
                      }
                      title={
                        hasDraftVersion
                          ? "下書きを先に公開または削除してください"
                          : undefined
                      }
                      className="w-full"
                    >
                      新しいバージョンを作成
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    バージョンがありません
                  </p>
                )}
              </TabsContent>
            )}

            {/* 設定タブ */}
            <TabsContent value="settings" className="mt-4 space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">タイトル *</Label>
                  <Input
                    id="title"
                    placeholder="規約のタイトル"
                    {...register("title")}
                    disabled={isPending}
                  />
                  {errors.title && (
                    <p className="text-xs text-destructive">
                      {errors.title.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">スラッグ *</Label>
                  <Input
                    id="slug"
                    placeholder="terms-of-use"
                    {...register("slug")}
                    disabled={isPending}
                  />
                  {errors.slug && (
                    <p className="text-xs text-destructive">
                      {errors.slug.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    URLに使用されます: /terms/{slug || "slug"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>規約タイプ</Label>
                  {mode === "edit" ? (
                    <p className="text-sm text-muted-foreground">
                      {TERMS_TYPES.find((t) => t.value === selectedTypeRaw)
                        ?.label ?? selectedTypeRaw}
                    </p>
                  ) : (
                    <Select
                      value={selectedType ?? ""}
                      onValueChange={(v) => void handleTypeChange(v)}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="規約タイプを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {TERMS_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {errors.type && (
                    <p className="text-xs text-destructive">
                      {errors.type.message}
                    </p>
                  )}
                </div>
              </div>

              {/* テンプレート選択（create モードのみ） */}
              {mode === "create" && selectedType && templates.length > 0 && (
                <div className="space-y-3 border-t pt-4">
                  <Label>テンプレートから作成</Label>
                  <Select
                    value={selectedTemplate || ""}
                    onValueChange={handleTemplateChange}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="テンプレートを選択..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blank">空白から作成</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate && selectedTemplate !== "blank" && (
                    <p className="text-xs text-muted-foreground">
                      {
                        templates.find((t) => t.id === selectedTemplate)
                          ?.description
                      }
                    </p>
                  )}
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  ショートカット: Ctrl/Cmd + S で保存
                </p>
              </div>
            </TabsContent>

            {/* 同意記録タブ（edit モードのみ） */}
            {mode === "edit" && terms && (
              <TabsContent value="agreements" className="mt-4">
                <TermsAgreementsTab
                  termsId={terms.id}
                  initialAgreements={initialAgreements}
                  initialTotal={initialTotal}
                />
              </TabsContent>
            )}
          </Tabs>
        </SidePanelShell>
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
      />
    </InlineEditorShell>
  );
}
