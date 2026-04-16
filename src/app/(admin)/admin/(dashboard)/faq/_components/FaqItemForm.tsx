"use client";

/**
 * FAQ項目インラインエディター
 *
 * Lexicalリッチテキストエディターを使用したFAQ項目編集UI
 * 新規作成・編集の両方に対応
 *
 * 設定は EditorHeader の「設定」ボタンから開くモーダルダイアログで編集する。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  EditorHeader,
  InlineEditorShell,
} from "@/admin/components/editor/inline";
import {
  SEOFields,
  OGPFields,
} from "@/admin/components/editor/inline/side-panel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { useController } from "react-hook-form";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

const LexicalEditor = dynamic(
  () =>
    import("@/admin/components/editor/lexical/LexicalEditor").then((mod) => ({
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
import {
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  toggleFaqItemPublished,
} from "@/admin/actions/faq";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  question: z
    .string()
    .min(1, { error: "質問は必須です" })
    .max(500, { error: "質問は500文字以内で入力してください" }),
  answerJson: z.string().min(1, { error: "回答は必須です" }),
  categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
  order: z.number().int().min(0),
  isPublished: z.boolean(),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  ogpTitle: z.string().optional(),
  ogpDescription: z.string().optional(),
  ogpImageUrl: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// =============================================================================
// Types
// =============================================================================

type Category = {
  id: string;
  name: string;
};

type FaqItemInlineEditorProps = {
  item?: FaqItemWithCategory | undefined;
  categories: Category[];
  mode?: "create" | "edit" | undefined;
  defaultCategoryId?: string | undefined;
};

// =============================================================================
// Component
// =============================================================================

export function FaqItemInlineEditor({
  item,
  categories,
  mode = "edit",
  defaultCategoryId,
}: FaqItemInlineEditorProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [hasEditorChanges, setHasEditorChanges] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData, unknown, FormData>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: item
      ? {
          question: item.question,
          answerJson: item.answerJson
            ? JSON.stringify(item.answerJson)
            : EMPTY_LEXICAL_EDITOR_STATE_JSON,
          categoryId: item.categoryId,
          order: item.order,
          isPublished: item.isPublished,
          metaDescription: item.metaDescription ?? "",
          metaKeywords: item.metaKeywords ?? "",
          ogpTitle: item.ogpTitle ?? "",
          ogpDescription: item.ogpDescription ?? "",
          ogpImageUrl: item.ogpImageUrl ?? "",
        }
      : {
          question: "",
          answerJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
          categoryId: defaultCategoryId || "",
          order: 0,
          isPublished: true,
          metaDescription: "",
          metaKeywords: "",
          ogpTitle: "",
          ogpDescription: "",
          ogpImageUrl: "",
        },
  });

  const question = useWatch({ control, name: "question", defaultValue: "" });
  const isPublished = useWatch({
    control,
    name: "isPublished",
    defaultValue: true,
  });
  const answerJson = useWatch({
    control,
    name: "answerJson",
    defaultValue: EMPTY_LEXICAL_EDITOR_STATE_JSON,
  });
  const { field: categoryField } = useController({
    control,
    name: "categoryId",
  });

  const handleJsonChange = (json: string) => {
    setValue("answerJson", json, { shouldDirty: true });
    setHasEditorChanges(true);
  };

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const payload = {
          question: data.question,
          answerJson: data.answerJson,
          categoryId: data.categoryId,
          order: data.order,
          isPublished: data.isPublished,
          metaDescription: data.metaDescription || null,
          metaKeywords: data.metaKeywords || null,
          ogpTitle: data.ogpTitle || null,
          ogpDescription: data.ogpDescription || null,
          ogpImageUrl: data.ogpImageUrl || null,
        };

        if (mode === "create") {
          const result = await createFaqItem(payload);
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }

          toast.success("FAQ項目を作成しました");
          router.push(`/admin/faq/items/${result.id}/edit`);
        } else if (item) {
          const result = await updateFaqItem(item.id, payload);
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }

          reset(data);
          setHasEditorChanges(false);
          setIsSettingsDialogOpen(false);
          router.refresh();
          toast.success("FAQ項目を保存しました");
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

  const handlePublish = () => {
    if (!item || isPending) return;
    startTransition(async () => {
      const result = await toggleFaqItemPublished(item.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? "FAQ項目を公開しました"
          : "FAQ項目を非公開にしました",
      );
      setValue("isPublished", result.isPublished);
      router.refresh();
    });
  };

  const handleUnpublish = () => {
    if (!item || isPending) return;
    startTransition(async () => {
      const result = await toggleFaqItemPublished(item.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? "FAQ項目を公開しました"
          : "FAQ項目を非公開にしました",
      );
      setValue("isPublished", result.isPublished);
      router.refresh();
    });
  };

  const handlePreview = () => {
    if (mode === "create") {
      toast.info("FAQ項目を作成後にプレビューできます");
      return;
    }
    const isUnsaved = isDirty || hasEditorChanges;
    if (isUnsaved) {
      toast.info("プレビューには保存済みのコンテンツが表示されます");
    }
    window.open(`/faq`, "_blank");
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
    router.push("/admin/faq");
  };

  const handleDelete = () => {
    if (!item) return;
    startTransition(async () => {
      try {
        const result = await deleteFaqItem(item.id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("FAQ項目を削除しました");
        router.push("/admin/faq");
      } catch (error) {
        logger.error("削除中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("削除中にエラーが発生しました");
      }
    });
  };

  const isFormDirty = isDirty || hasEditorChanges;

  const categoryOptions = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
  }));

  const deleteTriggerButton =
    mode === "edit" && item ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={isPending}
        onClick={() => setIsDeleteDialogOpen(true)}
      >
        削除
      </Button>
    ) : undefined;

  return (
    <>
      <InlineEditorShell
        onSave={handleSave}
        isDirty={isFormDirty}
        header={
          <EditorHeader
            title={question || "新規FAQ"}
            slug={item ? `faq/items/${item.id}` : "faq/items/new"}
            isDirty={isFormDirty}
            isPending={isPending}
            onOpenSettings={() => setIsSettingsDialogOpen(true)}
            metadataPanelLabel="FAQ設定"
            onSave={handleSave}
            onPreview={handlePreview}
            onBack={handleBack}
            publishActions={
              mode === "edit" && item
                ? {
                    status: isPublished,
                    onPublish: handlePublish,
                    onUnpublish: handleUnpublish,
                  }
                : undefined
            }
            extraActions={deleteTriggerButton}
          />
        }
      >
        {/* Question Input */}
        <div className="border-b bg-background px-4 py-3">
          <Label
            htmlFor="question"
            className="text-sm font-medium text-muted-foreground"
          >
            質問
          </Label>
          <Input
            id="question"
            {...register("question")}
            placeholder="例: 予約はいつまでキャンセルできますか？"
            className="mt-1 text-lg font-medium border-none shadow-none focus-visible:ring-0 px-0"
            disabled={isPending}
          />
          {errors.question && (
            <p className="text-sm text-destructive mt-1">
              {errors.question.message}
            </p>
          )}
        </div>

        {/* Lexical Editor for Answer */}
        <div className="flex-1 overflow-auto">
          <Label className="text-sm font-medium text-muted-foreground mb-2 block px-8 pt-2">
            回答
          </Label>
          <LexicalEditor
            contentJson={answerJson || EMPTY_LEXICAL_EDITOR_STATE_JSON}
            onChange={handleJsonChange}
            disabled={isPending}
            className={EDITOR_PROSE_CLASSES}
            showToolbar
            height="calc(100vh - 300px)"
          />
        </div>
      </InlineEditorShell>

      {/* 設定ダイアログ — Radix 公式の async form 送信パターン準拠 */}
      <Dialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>FAQ設定</DialogTitle>
            <DialogDescription>
              カテゴリ・SEO・OGP などの設定を編集します。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">基本</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
              </TabsList>
              <TabsContent value="basic" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">カテゴリ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Select
                      value={categoryField.value}
                      onValueChange={categoryField.onChange}
                      disabled={isPending}
                    >
                      <SelectTrigger aria-label="カテゴリを選択">
                        <SelectValue placeholder="カテゴリを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.categoryId && (
                      <p className="text-xs text-destructive">
                        {errors.categoryId.message}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="seo" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">SEO設定</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SEOFields
                      register={register}
                      errors={errors}
                      disabled={isPending}
                      fields={{
                        metaDescription: "metaDescription",
                        metaKeywords: "metaKeywords",
                      }}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">OGP設定</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OGPFields
                      register={register}
                      control={control}
                      errors={errors}
                      setValue={setValue}
                      disabled={isPending}
                      fields={{
                        ogpTitle: "ogpTitle",
                        ogpDescription: "ogpDescription",
                        ogpImageUrl: "ogpImageUrl",
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSettingsDialogOpen(false)}
                disabled={isPending}
              >
                閉じる
              </Button>
              <SubmitButton
                isPending={isPending}
                label="保存"
                disabled={!isFormDirty}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ — プロジェクト標準の DeleteConfirmDialog */}
      {mode === "edit" && item && (
        <DeleteConfirmDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          itemName={item.question}
          onConfirm={handleDelete}
          isPending={isPending}
        />
      )}
    </>
  );
}
