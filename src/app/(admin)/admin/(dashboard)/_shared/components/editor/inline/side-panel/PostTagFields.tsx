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
import type { FieldComponentProps } from '../content-types/types'

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
  const tagsString = useWatch({ control, name: fields.tags }) as string | undefined
  const tagsError = getFieldError(errors, fields.tags)

  // カンマ区切り文字列を配列に変換
  const tagsArray = tagsString
    ? tagsString.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  // 配列をカンマ区切り文字列に変換してフォームに設定
  const handleChange = (newTags: string[]) => {
    const newValue = newTags.join(', ')
    setValue(fields.tags, newValue as T[Path<T>], { shouldDirty: true })
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
