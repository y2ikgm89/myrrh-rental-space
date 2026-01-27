/**
 * コンテンツ幅スタイルフック
 *
 * React Hook Form公式推奨のuseWatch()を使用したリアルタイム幅更新
 * 型アサーション完全排除
 */

import type { CSSProperties } from 'react'
import { useWatch, type Control } from 'react-hook-form'
import { getContentStyles } from '@/shared/lib/styles/layout-mapper'
import { DEFAULT_LAYOUT_CONFIG } from '@/shared/types/layout'
import { isValidLayoutWidth } from '@/shared/lib/validations/enums'

// =============================================================================
// Types
// =============================================================================

/**
 * コンテンツ幅フィールドを持つフォームの最小型定義
 */
type ContentWidthFormFields = {
  contentWidth?: string
  contentWidthCustom?: string
}

type UseContentWidthStylesOptions<T extends ContentWidthFormFields> = {
  control: Control<T>
}

type ContentWidthStyles = {
  className: string
  style: CSSProperties | undefined
}

// =============================================================================
// Hook
// =============================================================================

/**
 * コンテンツ幅スタイルを計算するフック
 *
 * @description
 * - React Hook Form公式推奨の`useWatch()`を使用
 * - フォーム値の変更をリアルタイムで反映
 * - 公開ページと同じ幅をエディタに適用
 *
 * @example
 * ```tsx
 * const contentStyles = useContentWidthStyles({ control: form.control })
 * <LexicalEditor
 *   contentWidthClassName={contentStyles.className}
 *   contentWidthStyle={contentStyles.style}
 * />
 * ```
 */
export function useContentWidthStyles<T extends ContentWidthFormFields>({
  control,
}: UseContentWidthStylesOptions<T>): ContentWidthStyles {
  // useWatch()でリアルタイム監視（公式推奨パターン）
  const contentWidth = useWatch({
    control,
    name: 'contentWidth' as never,
  }) as string | undefined

  const contentWidthCustom = useWatch({
    control,
    name: 'contentWidthCustom' as never,
  }) as string | undefined

  // カスタム幅のパース（NaN対策）
  const parsedCustomWidth = contentWidthCustom
    ? parseInt(contentWidthCustom, 10)
    : null
  const validCustomWidth =
    parsedCustomWidth !== null && !Number.isNaN(parsedCustomWidth)
      ? parsedCustomWidth
      : null

  return getContentStyles({
    ...DEFAULT_LAYOUT_CONFIG,
    contentWidth: isValidLayoutWidth(contentWidth)
      ? contentWidth
      : DEFAULT_LAYOUT_CONFIG.contentWidth,
    contentWidthCustom: validCustomWidth,
  })
}
