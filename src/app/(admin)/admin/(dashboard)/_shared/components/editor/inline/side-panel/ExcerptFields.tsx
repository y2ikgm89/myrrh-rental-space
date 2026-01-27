'use client'

/**
 * 抜粋/説明フィールド
 *
 * 汎用的なテキストエリア入力フィールド
 * 抜粋、説明、概要など様々な用途で使用可能
 */

import type { FieldValues, Path } from 'react-hook-form'
import { Label, Textarea } from '@/admin/components/ui'
import { getFieldError, getErrorMessage } from '../types'
import type { FieldComponentProps } from '../content-types/types'

type ExcerptFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
  /** フィールド名マッピング */
  fields: {
    excerpt: Path<T>
  }
  /** ラベル */
  label?: string
  /** プレースホルダー */
  placeholder?: string
  /** ヘルプテキスト */
  helpText?: string
  /** 行数 */
  rows?: number
}

export function ExcerptFields<T extends FieldValues>({
  register,
  errors,
  disabled,
  fields,
  label = '抜粋',
  placeholder = '抜粋を入力（一覧ページに表示）',
  helpText = '500文字以内',
  rows = 3,
}: ExcerptFieldsProps<T>) {
  const excerptError = getFieldError(errors, fields.excerpt)

  return (
    <div className="space-y-2">
      <Label htmlFor={fields.excerpt}>{label}</Label>
      <Textarea
        id={fields.excerpt}
        {...register(fields.excerpt)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
      />
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
      {excerptError && (
        <p className="text-sm text-destructive">{getErrorMessage(excerptError)}</p>
      )}
    </div>
  )
}
