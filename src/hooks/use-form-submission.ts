'use client'

/**
 * React 19 フォーム送信フック
 *
 * useActionStateをラップし、Server Actionの状態管理を簡略化
 */

import { useActionState } from 'react'
import type { ActionResult } from '@/types/server-actions'

/**
 * フォーム送信状態
 */
type FormSubmissionState<TData = void> = {
  /** Server Actionの結果 */
  result: ActionResult<TData> | null
  /** 送信中かどうか */
  isPending: boolean
  /** フィールドエラー（バリデーションエラー時） */
  fieldErrors: Record<string, string[]>
  /** エラーメッセージ（失敗時） */
  error: string | undefined
  /** 成功メッセージ（成功時） */
  message: string | undefined
  /** 成功したかどうか */
  isSuccess: boolean
  /** 失敗したかどうか */
  isError: boolean
  /** フォームアクション（form action属性に渡す） */
  formAction: (formData: FormData) => void
}

/**
 * フォーム送信用カスタムフック
 *
 * React 19のuseActionStateを使用してServer Actionの状態を管理
 *
 * @param action - Server Action関数
 * @param options - オプション
 *
 * @remarks
 * 型安全性のため、`transformFormData`オプションを使用してFormDataから
 * 適切な型への変換を行うことを推奨します。省略した場合、Object.fromEntriesで
 * 変換され、型チェックはバイパスされます（Zodバリデーションで検証されます）。
 *
 * 状態のリセットには、フォームのkey属性を変更するか、form.reset()を使用してください。
 *
 * @example
 * // 基本的な使用法（transformFormData推奨）
 * const { formAction, isPending, error, fieldErrors } = useFormSubmission(
 *   submitContact,
 *   {
 *     transformFormData: (formData) => ({
 *       email: formData.get('email') as string,
 *       message: formData.get('message') as string,
 *     })
 *   }
 * )
 *
 * return (
 *   <form action={formAction}>
 *     <input name="email" />
 *     {fieldErrors.email && <span>{fieldErrors.email[0]}</span>}
 *     <SubmitButton />
 *   </form>
 * )
 *
 * @example
 * // 成功時のコールバック
 * const { formAction } = useFormSubmission(submitContact, {
 *   onSuccess: (message) => {
 *     toast.success(message)
 *     router.push('/success')
 *   }
 * })
 */
export function useFormSubmission<TInput, TData = void>(
  action: (input: TInput) => Promise<ActionResult<TData>>,
  options?: {
    /** 成功時のコールバック */
    onSuccess?: (message: string, data?: TData) => void
    /** 失敗時のコールバック */
    onError?: (error: string, fieldErrors?: Record<string, string[]>) => void
    /** FormDataからinputへの変換関数（デフォルト: Object.fromEntries） */
    transformFormData?: (formData: FormData) => TInput
  }
): FormSubmissionState<TData> {
  const { onSuccess, onError, transformFormData } = options ?? {}

  const [state, formAction, isPending] = useActionState(
    async (
      _prevState: ActionResult<TData> | null,
      formData: FormData
    ): Promise<ActionResult<TData>> => {
      const input = transformFormData
        ? transformFormData(formData)
        : (Object.fromEntries(formData) as TInput)

      const result = await action(input)

      if (result.success) {
        onSuccess?.(result.message, 'data' in result ? result.data : undefined)
      } else {
        onError?.(result.error, result.fieldErrors)
      }

      return result
    },
    null
  )

  const isSuccess = state?.success === true
  const isError = state?.success === false

  return {
    result: state,
    isPending,
    fieldErrors: isError && state.fieldErrors ? state.fieldErrors : {},
    error: isError ? state.error : undefined,
    message: isSuccess ? state.message : undefined,
    isSuccess,
    isError,
    formAction,
  }
}

/**
 * フォーム送信ボタン用フック
 *
 * useFormStatusをラップし、送信中の状態を取得
 * 注意: このフックは<form>内のコンポーネントでのみ使用可能
 *
 * @example
 * function SubmitButton() {
 *   const { pending } = useFormPending()
 *   return (
 *     <button type="submit" disabled={pending}>
 *       {pending ? '送信中...' : '送信する'}
 *     </button>
 *   )
 * }
 */
export { useFormStatus as useFormPending } from 'react-dom'
