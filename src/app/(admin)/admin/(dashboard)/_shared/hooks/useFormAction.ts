'use client'

/**
 * useFormAction - フォーム送信の統一フック
 *
 * react-hook-form + Zod + useTransition + toast を統合
 * 公式ベストプラクティスに準拠
 */

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import {
  useForm,
  type FieldValues,
  type UseFormReturn,
  type DefaultValues,
  type Path,
  type Resolver,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { ActionResult } from '@/shared/types/server-actions'

// =============================================================================
// Types
// =============================================================================

/** Zod スキーマの最小型（Zod 4 互換） */
type ZodSchema<T> = {
  _output: T
  parse: (data: unknown) => T
  safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown }
}

type UseFormActionOptions<TInput extends FieldValues, TOutput> = {
  /** フォームの初期値 */
  defaultValues?: DefaultValues<TInput>
  /** 成功時のコールバック */
  onSuccess?: (result: Extract<ActionResult<TOutput>, { success: true }>) => void
  /** エラー時のコールバック */
  onError?: (error: string, fieldErrors?: Record<string, string[]>) => void
  /** 成功時のリダイレクト先 */
  redirectTo?: string
  /** 成功時にページをリフレッシュ */
  refresh?: boolean
  /** 成功メッセージのカスタマイズ（デフォルト: result.message） */
  successMessage?: string
  /** エラーメッセージのカスタマイズ（デフォルト: result.error） */
  errorMessage?: string
  /** トースト通知を無効化 */
  disableToast?: boolean
}

type UseFormActionReturn<TInput extends FieldValues, TOutput> = {
  /** react-hook-form の form オブジェクト */
  form: UseFormReturn<TInput>
  /** 送信中かどうか */
  isPending: boolean
  /** フォーム送信ハンドラ（form の onSubmit に渡す） */
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>
  /** 手動でアクションを実行（form の handleSubmit を通さない場合） */
  execute: (data: TInput) => Promise<ActionResult<TOutput>>
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
export function useFormAction<
  TInput extends FieldValues,
  TOutput = void,
>(
  schema: ZodSchema<TInput>,
  action: (data: TInput) => Promise<ActionResult<TOutput>>,
  options?: UseFormActionOptions<TInput, TOutput>
): UseFormActionReturn<TInput, TOutput> {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // zodResolver に渡すために unknown キャスト（Zod 4 型互換性のため）
  const form = useForm<TInput>({
    resolver: zodResolver(schema as unknown as Parameters<typeof zodResolver>[0]) as Resolver<TInput>,
    defaultValues: options?.defaultValues,
  })

  const execute = async (data: TInput): Promise<ActionResult<TOutput>> => {
    const result = await action(data)

    if (result.success) {
      // 成功時
      if (!options?.disableToast) {
        toast.success(options?.successMessage || result.message || '保存しました')
      }

      // コールバック
      options?.onSuccess?.(result as Extract<ActionResult<TOutput>, { success: true }>)

      // リダイレクト or リフレッシュ
      if (options?.redirectTo) {
        router.push(options.redirectTo)
      } else if (options?.refresh) {
        router.refresh()
      }
    } else {
      // エラー時
      if (!options?.disableToast) {
        toast.error(options?.errorMessage || result.error || 'エラーが発生しました')
      }

      // フィールドエラーをフォームに設定
      if (result.fieldErrors) {
        for (const [field, errors] of Object.entries(result.fieldErrors)) {
          if (errors && errors.length > 0) {
            form.setError(field as Path<TInput>, {
              type: 'server',
              message: errors[0],
            })
          }
        }
      }

      // コールバック
      options?.onError?.(result.error, result.fieldErrors)
    }

    return result
  }

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      await execute(data)
    })
  })

  return {
    form,
    isPending,
    onSubmit,
    execute,
  }
}

// =============================================================================
// Re-export types
// =============================================================================

export type { UseFormActionOptions, UseFormActionReturn }
