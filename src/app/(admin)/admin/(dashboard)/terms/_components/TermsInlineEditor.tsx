"use client";

/**
 * 規約インラインエディター（オーケストレーター）
 *
 * create モード: 規約新規作成（タイプ・テンプレートはダイアログで選択済み、props で受け取る）
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
  InlineEditorShell,
} from "@/admin/components/editor/inline";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { tryConvertHtmlStringToLexicalJsonString } from "@/admin/components/editor/lexical/html-to-lexical-json";
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
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import { parseTermsType } from "@/shared/lib/validations/terms";
import { TermsStatus } from "@generated/prisma/enums";
import type {
  TermsVersionDetail,
  TermsAgreementItem,
} from "@/shared/lib/validations/terms";
import type { Serialized } from "@/shared/lib/serialize";
import { TermsAgreementsTab } from "./TermsAgreementsTab";
import { TermsVersionTab } from "./TermsVersionTab";
import { TermsSettingsFields } from "./TermsSettingsTab";
import { fetchTermsVersionById } from "./terms-helpers";
import type { TermsVersionSummary, TermsData } from "./terms-helpers";

// =============================================================================
// Constants
// =============================================================================

/**
 * 規約コンテンツの幅（px）
 *
 * 公開ページ /terms/[slug] は Container variant="narrow" (max-w-3xl = 768px) で表示。
 * エディタ側も同じ幅に合わせて WYSIWYG 体験を提供する。
 */
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
// Types
// =============================================================================

/** TermsInlineEditor の公開 props（page.tsx から渡される） */
export interface TermsInlineEditorProps {
  terms?: TermsData;
  initialVersion?: Serialized<TermsVersionDetail> | null;
  mode?: "create" | "edit";
  initialAgreements?: TermsAgreementItem[];
  initialTotal?: number;
  /** create モード: サーバーで解決済みのタイプ */
  initialType?: string;
  /** create モード: サーバーで解決済みのタイトル */
  initialTitle?: string;
  /** create モード: サーバーで解決済みのスラッグ */
  initialSlug?: string;
  /** create モード: テンプレート HTML（クライアントで Lexical JSON に変換） */
  initialTemplateHtml?: string | null;
}

/**
 * テンプレート HTML → Lexical JSON 変換ラッパー
 *
 * DOM が必要な tryConvertHtmlStringToLexicalJsonString をクライアント側で実行し、
 * 変換済み contentJson を本体エディタに渡す。
 * useState 遅延初期化で初回マウント時に1回だけ変換。
 */
export function TermsInlineEditor(props: TermsInlineEditorProps) {
  // useState 遅延初期化でテンプレート HTML → Lexical JSON 変換
  // SSR では DOMParser が存在しないため typeof window ガードで回避
  const [resolvedContentJson] = useState(() => {
    if (typeof window === "undefined") return null;
    if (!props.initialTemplateHtml) return null;
    const converted = tryConvertHtmlStringToLexicalJsonString(
      props.initialTemplateHtml,
    );
    return converted.ok ? converted.json : null;
  });

  return (
    <TermsInlineEditorInner
      {...props}
      resolvedContentJson={resolvedContentJson}
    />
  );
}

/** 内部コンポーネントの props（変換済み contentJson を追加） */
interface TermsInlineEditorInnerProps extends TermsInlineEditorProps {
  resolvedContentJson: string | null;
}

// =============================================================================
// Component
// =============================================================================

function TermsInlineEditorInner({
  terms,
  initialVersion,
  mode = "edit",
  initialAgreements = [],
  initialTotal = 0,
  initialType = "",
  initialTitle = "",
  initialSlug = "",
  resolvedContentJson,
}: TermsInlineEditorInnerProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
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
    reset,
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
          requiredAtReservation: terms.requiredAtReservation,
          showInFooter: terms.showInFooter,
        }
      : {
          title: initialTitle,
          slug: initialSlug,
          type: initialType,
          contentJson: resolvedContentJson ?? EMPTY_LEXICAL_EDITOR_STATE_JSON,
          requiredAtReservation: false,
          showInFooter: false,
        },
  });

  const title = useWatch({ control, name: "title" });
  const contentJson = useWatch({ control, name: "contentJson" });
  const slug = useWatch({ control, name: "slug" });

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
            requiredAtReservation: data.requiredAtReservation,
            showInFooter: data.showInFooter,
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
    <>
      <InlineEditorShell
        onSave={handleSave}
        isDirty={isFormDirty}
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

      {/* 設定ダイアログ — Radix 公式の async form 送信パターン準拠 */}
      <Dialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>規約設定</DialogTitle>
            <DialogDescription>
              タイトル・スラッグ・バージョン・同意記録などを管理します。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {mode === "edit" ? (
              <Tabs defaultValue="settings" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="version">バージョン</TabsTrigger>
                  <TabsTrigger value="settings">設定</TabsTrigger>
                  <TabsTrigger value="agreements">
                    同意
                    {initialTotal > 0 && (
                      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                        {initialTotal}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TermsVersionTab
                  localVersions={localVersions}
                  selectedVersionId={selectedVersionId}
                  selectedVersionContent={selectedVersionContent}
                  hasDraftVersion={hasDraftVersion}
                  isPending={isPending}
                  isLoadingVersion={isLoadingVersion}
                  onVersionSwitch={(id) => void handleVersionSwitch(id)}
                  onCreateNewVersion={handleCreateNewVersion}
                  onPublishVersion={handlePublishVersion}
                  onArchiveVersion={handleArchiveVersion}
                  onDeleteVersion={handleDeleteVersion}
                />

                <TabsContent value="settings" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">規約情報</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TermsSettingsFields
                        isPending={isPending}
                        control={control}
                        register={register}
                        errors={errors}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                {terms && (
                  <TabsContent value="agreements" className="mt-4">
                    <TermsAgreementsTab
                      termsId={terms.id}
                      initialAgreements={initialAgreements}
                      initialTotal={initialTotal}
                    />
                  </TabsContent>
                )}
              </Tabs>
            ) : (
              <TermsSettingsFields
                isPending={isPending}
                control={control}
                register={register}
                errors={errors}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSettingsDialogOpen(false)}
                disabled={isPending}
              >
                閉じる
              </Button>
              <Button type="submit" disabled={isPending || !isFormDirty}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
