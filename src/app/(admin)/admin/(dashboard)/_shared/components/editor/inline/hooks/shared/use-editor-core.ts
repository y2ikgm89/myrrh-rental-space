"use client";

/**
 * エディターコアフック
 *
 * 全エディターで共通のstate管理とパネル管理を提供
 * React Compiler対応
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  UseFormReturn,
  FieldValues,
  FieldPathByValue,
} from "react-hook-form";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { useCommentPanel } from "../../hooks";
import type { EditorCoreConfig, EditorCoreReturn } from "./types";

// =============================================================================
// Hook
// =============================================================================

/**
 * エディターコアフック
 *
 * 共通のstate管理を提供:
 * - isPending/startTransition（非同期処理）
 * - hasEditorChanges（エディター変更検出）
 * - isDeleteDialogOpen（削除ダイアログ）
 * - panels（パネル管理）
 * - handleBack（戻るボタン）
 */
export function useEditorCore<TFormData extends FieldValues>({
  form,
  listPath,
}: EditorCoreConfig<TFormData>): EditorCoreReturn {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [hasEditorChanges, setHasEditorChanges] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // コメントパネル管理（記事設定はダイアログで独立管理）
  const comments = useCommentPanel();

  // isDirty計算
  const isDirty = form.formState.isDirty || hasEditorChanges;

  // 戻るボタンハンドラー
  const handleBack = async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: "変更を破棄しますか？",
        description:
          "保存されていない変更があります。破棄してもよろしいですか？",
        confirmLabel: "破棄",
        variant: "destructive",
      });
      if (!confirmed) return;
    }
    router.push(toAppRoute(listPath));
  };

  // startTransitionを非同期対応でラップ
  const wrappedStartTransition = (callback: () => void | Promise<void>) => {
    startTransition(async () => {
      await callback();
    });
  };

  return {
    isPending,
    startTransition: wrappedStartTransition,
    hasEditorChanges,
    setHasEditorChanges,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    comments,
    handleBack,
  };
}

// =============================================================================
// Utility functions for derived state
// =============================================================================

/**
 * isDirtyを計算するユーティリティ
 */
export function computeIsDirty<TFormData extends FieldValues>(
  form: UseFormReturn<TFormData>,
  hasEditorChanges: boolean,
): boolean {
  return form.formState.isDirty || hasEditorChanges;
}

/**
 * コンテンツ変更ハンドラーを生成するファクトリ
 */
export function createContentChangeHandler<
  TFormData extends FieldValues,
  TFieldName extends FieldPathByValue<TFormData, string | null | undefined>,
>(
  form: UseFormReturn<TFormData>,
  setHasEditorChanges: (value: boolean) => void,
  fieldName: TFieldName,
) {
  const field = form.register(fieldName);

  return (html: string) => {
    field.onChange({
      target: { name: field.name, value: html },
      type: "change",
    });
    setHasEditorChanges(true);
  };
}

/**
 * フォームリセットハンドラーを生成するファクトリ
 */
export function createResetHandler<TFormData extends FieldValues>(
  form: UseFormReturn<TFormData>,
  setHasEditorChanges: (value: boolean) => void,
) {
  return (formData: TFormData) => {
    form.reset(formData);
    setHasEditorChanges(false);
  };
}
