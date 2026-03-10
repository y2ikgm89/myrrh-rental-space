"use client";

/**
 * useFormAction - フォーム送信の統一フック
 *
 * react-hook-form + Zod 4 + useTransition + toast を統合
 * 公式ベストプラクティス: standardSchemaResolver 使用（Zod 4 の Standard Schema 対応）
 *
 * @see https://github.com/react-hook-form/resolvers/issues/768
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  useForm,
  type FieldValues,
  type UseFormReturn,
  type DefaultValues,
  type Path,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { toast } from "sonner";
import {
  isMutationError,
  type MutationResult,
  type MutationError,
} from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

/**
 * useFormAction のオプション
 */
type UseFormActionOptions<TInput extends FieldValues, TOutput> = {
  /** フォームの初期値 */
  defaultValues?: DefaultValues<TInput>;
  /** 成功時のコールバック（data を直接受け取る） */
  onSuccess?: (data: TOutput) => void;
  /** エラー時のコールバック */
  onError?: (error: string, fieldErrors?: Record<string, string[]>) => void;
  /** 成功時のリダイレクト先 */
  redirectTo?: string;
  /** 成功時にページをリフレッシュ */
  refresh?: boolean;
  /** 成功メッセージのカスタマイズ */
  successMessage?: string;
  /** エラーメッセージのカスタマイズ */
  errorMessage?: string;
  /** トースト通知を無効化 */
  disableToast?: boolean;
};

type UseFormActionReturn<TInput extends FieldValues, TOutput> = {
  /** react-hook-form の form オブジェクト */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<TInput, any>;
  /** 送信中かどうか */
  isPending: boolean;
  /** フォーム送信ハンドラ（form の onSubmit に渡す） */
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  /** 手動でアクションを実行（form の handleSubmit を通さない場合） */
  execute: (data: TInput) => Promise<MutationResult<TOutput>>;
};

function hasTopLevelField<TInput extends FieldValues>(
  values: TInput,
  field: string,
): field is Path<TInput> {
  return field in values;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * フォーム送信を統一的に処理するフック
 *
 * @example
 * // 基本的な使い方
 * const { form, isPending, onSubmit } = useFormAction(
 *   categorySchema,
 *   createCategory,
 *   { redirectTo: '/admin/categories' }
 * )
 *
 * // 編集モード（defaultValues あり）
 * const { form, isPending, onSubmit } = useFormAction(
 *   categorySchema,
 *   (data) => updateCategory(categoryId, data),
 *   {
 *     defaultValues: existingCategory,
 *     refresh: true,
 *   }
 * )
 */
export function useFormAction<TInput extends FieldValues, TOutput = null>(
  schema: StandardSchemaV1<TInput, TInput>,
  action: (data: TInput) => Promise<MutationResult<TOutput>>,
  options?: UseFormActionOptions<TInput, TOutput>,
): UseFormActionReturn<TInput, TOutput> {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Zod 4 は Standard Schema 仕様を実装しているため、standardSchemaResolver を使用
  const form = useForm<TInput>({
    resolver: standardSchemaResolver(schema),
    ...(options?.defaultValues !== undefined && {
      defaultValues: options.defaultValues,
    }),
  });

  const execute = async (data: TInput): Promise<MutationResult<TOutput>> => {
    const result = await action(data);

    if (isMutationError(result)) {
      // エラー時
      if (!options?.disableToast) {
        toast.error(
          options?.errorMessage || result.error || "エラーが発生しました",
        );
      }

      // フィールドエラーをフォームに設定
      if (result.fieldErrors) {
        const currentValues = form.getValues();
        for (const [field, errors] of Object.entries(result.fieldErrors)) {
          if (
            errors &&
            errors.length > 0 &&
            hasTopLevelField(currentValues, field)
          ) {
            const registeredField = form.register(field);
            const firstError = errors[0];
            form.setError(registeredField.name, {
              type: "server",
              ...(firstError !== undefined && { message: firstError }),
            });
          }
        }
      }

      // コールバック
      options?.onError?.(result.error, result.fieldErrors);
    } else {
      // 成功時
      if (!options?.disableToast) {
        toast.success(options?.successMessage || "保存しました");
      }

      // コールバック（data を直接渡す）
      options?.onSuccess?.(result);

      // リダイレクト or リフレッシュ
      if (options?.redirectTo) {
        router.push(options.redirectTo);
      } else if (options?.refresh) {
        router.refresh();
      }
    }

    return result;
  };

  const onSubmit = form.handleSubmit((data: TInput) => {
    startTransition(async () => {
      await execute(data);
    });
  });

  return {
    form,
    isPending,
    onSubmit,
    execute,
  };
}

// =============================================================================
// Re-export types
// =============================================================================

export type { UseFormActionOptions, UseFormActionReturn, MutationError };
