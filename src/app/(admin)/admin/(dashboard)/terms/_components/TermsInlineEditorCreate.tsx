"use client";

/**
 * 規約インラインエディター — create 専用
 *
 * create モード: 規約新規作成（タイプ・テンプレートはダイアログで選択済み、props で受け取る）
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
import { createTermsWithVersion } from "@/admin/actions/terms";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import { parseTermsType } from "@/shared/lib/validations/terms";
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

interface TermsInlineEditorCreateProps {
  initialType: string;
  initialTitle: string;
  initialSlug: string;
  /** サーバーから渡されたテンプレート HTML。クライアント初回マウント時に Lexical JSON へ変換。 */
  initialTemplateHtml: string | null;
}

// =============================================================================
// Component
// =============================================================================

export function TermsInlineEditorCreate({
  initialType,
  initialTitle,
  initialSlug,
  initialTemplateHtml,
}: TermsInlineEditorCreateProps) {
  // SSR では DOMParser が存在しないため typeof window ガードで回避。
  // 初回マウント時に 1 回だけ HTML → Lexical JSON へ変換する（遅延初期化）。
  const [resolvedContentJson] = useState(() => {
    if (typeof window === "undefined") return null;
    if (!initialTemplateHtml) return null;
    const converted =
      tryConvertHtmlStringToLexicalJsonString(initialTemplateHtml);
    return converted.ok ? converted.json : null;
  });
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [hasEditorChanges, setHasEditorChanges] = useState(false);
  const [editorKey] = useState(0);

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

  // =============================================================================
  // Handlers
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
    toast.info("規約を作成後にプレビューできます");
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

  const handleSettingsSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const termsType = parseTermsType(data.type);
        if (!termsType) {
          toast.error("無効な規約タイプです");
          return;
        }

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

        reset(data);
        setHasEditorChanges(false);
        setIsSettingsDialogOpen(false);
        toast.success("規約を作成しました");
        router.push(`/admin/terms/${result.id}/edit`);
      } catch (error) {
        logger.error("保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("保存中にエラーが発生しました");
      }
    });
  };

  const isFormDirty = isDirty || hasEditorChanges;

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <>
      <InlineEditorShell
        onSave={handleSave}
        isDirty={isFormDirty}
        header={
          <EditorHeader
            title={title || "新規規約"}
            slug="terms/new"
            isDirty={isFormDirty}
            isPending={isPending}
            onOpenSettings={() => setIsSettingsDialogOpen(true)}
            metadataPanelLabel="規約設定"
            onSave={handleSave}
            onPreview={handlePreview}
            onBack={handleBack}
          />
        }
      >
        <LazyLexicalEditor
          key={editorKey}
          contentJson={contentJson || EMPTY_LEXICAL_EDITOR_STATE_JSON}
          onChange={handleJsonChange}
          disabled={isPending}
          className={EDITOR_PROSE_CLASSES}
          showToolbar
          height="100%"
          contentWidth={TERMS_CONTENT_WIDTH_PX}
        />
      </InlineEditorShell>

      <TermsSettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        mode="create"
        register={register}
        control={control}
        errors={errors}
        isPending={isPending}
        isFormDirty={isFormDirty}
        onSubmit={handleSubmit(handleSettingsSubmit)}
      />
    </>
  );
}
