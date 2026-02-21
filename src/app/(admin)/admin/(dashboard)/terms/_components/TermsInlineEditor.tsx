"use client";

/**
 * 規約インラインエディター
 *
 * Lexicalリッチテキストエディターを使用した規約編集UI
 * テンプレート選択、タイプ選択、コンテンツ編集を一画面で行う
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  EditorHeader,
  SidePanelShell,
  InlineEditorShell,
} from "@/admin/components/editor/inline";
import {
  createTermsWithVersion,
  updateTerms,
  updateTermsVersion,
  deleteTerms,
  getDefaultsForTermsType,
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { TERMS_TYPES, parseTermsType } from "@/shared/lib/validations/terms";
import {
  getTemplatesForType,
  applyBusinessInfo,
  type BusinessInfo,
} from "@/shared/lib/terms-templates";
import type { TermsType } from "@/shared/generated/prisma/client";

const LexicalEditor = dynamic(
  () =>
    import("@/admin/components/editor/lexical").then((mod) => ({
      default: mod.LexicalEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center bg-muted/50">
        <div className="animate-pulse text-muted-foreground">
          エディタを読み込み中...
        </div>
      </div>
    ),
  },
);

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

interface TermsData {
  id: string;
  title: string;
  slug: string;
  type: TermsType;
  isActive: boolean;
  currentVersionId?: string;
  currentVersionContentJson?: unknown;
  currentVersionContentHtml?: string;
}

interface TermsInlineEditorProps {
  terms?: TermsData;
  businessInfo?: BusinessInfo;
  mode?: "create" | "edit";
}

// =============================================================================
// Component
// =============================================================================

export function TermsInlineEditor({
  terms,
  businessInfo,
  mode = "edit",
}: TermsInlineEditorProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [hasEditorChanges, setHasEditorChanges] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(termsFormSchema),
    defaultValues: terms
      ? {
          title: terms.title,
          slug: terms.slug,
          type: terms.type,
          contentJson: terms.currentVersionContentJson
            ? JSON.stringify(terms.currentVersionContentJson)
            : "",
          selectedTemplate: "",
        }
      : {
          title: "",
          slug: "",
          type: "",
          contentJson: "",
          selectedTemplate: "",
        },
  });

  const title = useWatch({ control, name: "title" });
  const contentJson = useWatch({ control, name: "contentJson" });
  const slug = useWatch({ control, name: "slug" });
  const selectedTypeRaw = useWatch({ control, name: "type" });
  const selectedTemplate = useWatch({ control, name: "selectedTemplate" });

  // 型ガードでTermsTypeに変換（無効な値は空文字列扱い）
  const selectedType = parseTermsType(selectedTypeRaw);
  const templates = selectedType ? getTemplatesForType(selectedType) : [];

  const handleTypeChange = async (newType: string) => {
    setValue("type", newType, { shouldDirty: true });

    if (mode !== "create") return;

    const defaults = await getDefaultsForTermsType(newType);
    if (!defaults) return;

    setValue("title", defaults.title, { shouldDirty: true });
    setValue("slug", defaults.slug, { shouldDirty: true });
    setValue("selectedTemplate", "");
  };

  const handleTemplateChange = (templateId: string) => {
    setValue("selectedTemplate", templateId);
    if (templateId === "blank") {
      setValue("contentJson", "", { shouldDirty: true });
      setTemplateHtml("");
      setEditorKey((k) => k + 1);
      setHasEditorChanges(true);
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const appliedContent = businessInfo
        ? applyBusinessInfo(template.content, businessInfo)
        : template.content;
      setValue("contentJson", "", { shouldDirty: true });
      setTemplateHtml(appliedContent);
      setEditorKey((k) => k + 1);
      setHasEditorChanges(true);
    }
  };

  const handleJsonChange = (json: string) => {
    setValue("contentJson", json, { shouldDirty: true });
    setHasEditorChanges(true);
  };

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        // 型ガードでTermsTypeに変換
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
          if (result.success) {
            toast.success("規約を作成しました");
            router.push(`/admin/terms/${result.data.id}`);
          } else {
            toast.error(result.error);
          }
        } else if (terms) {
          const updateResult = await updateTerms(terms.id, {
            title: data.title,
            slug: data.slug,
            type: termsType,
          });
          if (!updateResult.success) {
            toast.error(updateResult.error);
            return;
          }

          if (terms.currentVersionId) {
            const versionResult = await updateTermsVersion(
              terms.currentVersionId,
              {
                contentJson: data.contentJson,
              },
            );
            if (!versionResult.success) {
              toast.error(versionResult.error);
              return;
            }
          }

          setHasEditorChanges(false);
          router.refresh();
          toast.success("規約を保存しました");
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
    if (isPending) return;
    handleSubmit(onSubmit)();
  };

  const handlePreview = () => {
    if (mode === "create") {
      toast.info("規約を作成後にプレビューできます");
      return;
    }
    const isUnsaved = isDirty || hasEditorChanges;
    if (isUnsaved) {
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

  const handleToggleSidePanel = () => {
    setIsSidePanelOpen((prev) => !prev);
  };

  const handleCloseSidePanel = () => {
    setIsSidePanelOpen(false);
  };

  const handleDelete = () => {
    if (!terms) return;
    startTransition(async () => {
      try {
        const result = await deleteTerms(terms.id);
        if (result.success) {
          toast.success("規約を削除しました");
          router.push("/admin/terms");
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        logger.error("削除中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("削除中にエラーが発生しました");
      }
    });
  };

  const isFormDirty = isDirty || hasEditorChanges;

  return (
    <InlineEditorShell
      onSubmit={handleSubmit(onSubmit)}
      onSave={handleSave}
      isDirty={isFormDirty}
      isPanelOpen={isSidePanelOpen}
      header={
        <EditorHeader
          title={title || "新規規約"}
          slug={terms ? `terms/${terms.slug}` : "terms/new"}
          isDirty={isFormDirty}
          isPending={isPending}
          isSidePanelOpen={isSidePanelOpen}
          onToggleSidePanel={handleToggleSidePanel}
          onSave={handleSave}
          onPreview={handlePreview}
          onBack={handleBack}
          extraActions={
            mode === "edit" && terms ? (
              <Dialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
              >
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
                      この操作は取り消せません。本当に削除してもよろしいですか？
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
                      onClick={handleDelete}
                      disabled={isPending}
                    >
                      {isPending ? "削除中..." : "削除"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : undefined
          }
        />
      }
      panel={
        <SidePanelShell
          isOpen={isSidePanelOpen}
          onClose={handleCloseSidePanel}
          title="規約設定"
          width="narrow"
        >
          <div className="space-y-6">
            {/* 基本情報 */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">基本情報</h3>

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
                <Label htmlFor="type">規約タイプ *</Label>
                <Select
                  value={selectedType}
                  onValueChange={handleTypeChange}
                  disabled={isPending || mode === "edit"}
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
                {errors.type && (
                  <p className="text-xs text-destructive">
                    {errors.type.message}
                  </p>
                )}
                {mode === "edit" && (
                  <p className="text-xs text-muted-foreground">
                    規約タイプは作成後に変更できません
                  </p>
                )}
              </div>
            </div>

            {/* テンプレート選択（新規作成時のみ） */}
            {mode === "create" && selectedType && templates.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium">テンプレート</h3>
                <div className="space-y-2">
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
              </div>
            )}

            {/* 操作ヒント */}
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                ショートカット: Ctrl/Cmd + S で保存
              </p>
            </div>
          </div>
        </SidePanelShell>
      }
    >
      <LexicalEditor
        key={editorKey}
        contentJson={contentJson || undefined}
        contentHtml={templateHtml ?? terms?.currentVersionContentHtml ?? ""}
        onChange={handleJsonChange}
        disabled={isPending}
        className={EDITOR_PROSE_CLASSES}
        showToolbar
        height="100%"
      />
    </InlineEditorShell>
  );
}
