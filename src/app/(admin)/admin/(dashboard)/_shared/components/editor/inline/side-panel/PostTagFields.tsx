'use client'

/**
 * 投稿タグ入力フィールド
 *
 * TagInputコンポーネントをreact-hook-formと統合
 * フォームのカンマ区切り文字列と配列形式を変換
 */

import type { FieldValues, Path } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import { TagInput, type TagOption } from './TagInput'
import { getFieldError, getErrorMessage } from '../types'
import { setFieldString, type FieldComponentProps } from '../content-types/types'

type PostTagFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
  /** フィールド名マッピング */
  fields: {
    tags: Path<T>
  }
  /** 利用可能なタグのリスト */
  availableTags?: TagOption[]
  /** 新規タグ作成時のコールバック */
  onCreateTag?: (name: string) => Promise<TagOption | null>
  /** ラベル */
  label?: string
  /** プレースホルダー */
  placeholder?: string
}

export function PostTagFields<T extends FieldValues>({
  control,
  setValue,
  errors,
  disabled,
  fields,
  availableTags = [],
  onCreateTag,
  label = 'タグ',
  placeholder = 'タグを入力...',
}: PostTagFieldsProps<T>) {
  // フォームのカンマ区切り文字列を監視
  // 型注釈 unknown で受け取り、typeof で string に絞り込む（as 不使用）
  const rawTags: unknown = useWatch({ control, name: fields.tags })
  const tagsString = typeof rawTags === 'string' ? rawTags : undefined
  const tagsError = getFieldError(errors, fields.tags)

  // カンマ区切り文字列を配列に変換
  const tagsArray = tagsString
    ? tagsString.split(',').map((t: string) => t.trim()).filter(Boolean)
    : []

  // 配列をカンマ区切り文字列に変換してフォームに設定
  const handleChange = (newTags: string[]) => {
    const newValue = newTags.join(', ')
    setFieldString(setValue, fields.tags, newValue, { shouldDirty: true })
  }

  return (
    <TagInput
      value={tagsArray}
      onChange={handleChange}
      availableTags={availableTags}
      onCreateTag={onCreateTag}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      error={tagsError ? getErrorMessage(tagsError) : undefined}
    />
  )
}
