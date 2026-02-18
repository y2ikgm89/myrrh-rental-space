'use client'

/**
 * タイトル・スラッグフィールド
 *
 * 汎用的なタイトルとスラッグの入力フィールド
 * スラッグの自動生成機能付き
 */

import type { FieldValues, Path } from 'react-hook-form'
import { Input, Label, Button } from '@/admin/components/ui'
import { getFieldError, getErrorMessage } from '../types'
import { setFieldString, type FieldComponentProps } from '../content-types/types'

type TitleSlugFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
  /** フィールド名マッピング */
  fields: {
    title: Path<T>
    slug?: Path<T>
  }
  /** スラッグフィールドを表示するか */
  showSlug?: boolean
  /** スラッグのURLプレビューパス */
  slugPreviewPath?: string
  /** タイトルのプレースホルダー */
  titlePlaceholder?: string
  /** スラッグのプレースホルダー */
  slugPlaceholder?: string
}

export function TitleSlugFields<T extends FieldValues>({
  register,
  errors,
  setValue,
  getValues,
  disabled,
  fields,
  showSlug = true,
  slugPreviewPath = '',
  titlePlaceholder = 'タイトルを入力',
  slugPlaceholder = 'url-slug',
}: TitleSlugFieldsProps<T>) {
  const titleError = getFieldError(errors, fields.title)
  const slugError = fields.slug ? getFieldError(errors, fields.slug) : undefined

  const generateSlug = () => {
    if (!getValues || !setValue || !fields.slug) return

    const title = getValues(fields.title)
    if (typeof title === 'string' && title) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      setFieldString(setValue, fields.slug, slug, { shouldDirty: true })
    }
  }

  const currentSlug = getValues && fields.slug ? getValues(fields.slug) : ''

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={fields.title}>タイトル</Label>
        <Input
          id={fields.title}
          {...register(fields.title)}
          placeholder={titlePlaceholder}
          disabled={disabled}
        />
        {titleError && (
          <p className="text-sm text-destructive">{getErrorMessage(titleError)}</p>
        )}
      </div>

      {showSlug && fields.slug && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={fields.slug}>スラッグ（URL）</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={generateSlug}
              disabled={disabled}
            >
              自動生成
            </Button>
          </div>
          <Input
            id={fields.slug}
            {...register(fields.slug)}
            placeholder={slugPlaceholder}
            disabled={disabled}
          />
          {slugPreviewPath && (
            <p className="text-xs text-muted-foreground">
              URL: {slugPreviewPath}/{currentSlug || slugPlaceholder}
            </p>
          )}
          {slugError && (
            <p className="text-sm text-destructive">{getErrorMessage(slugError)}</p>
          )}
        </div>
      )}
    </div>
  )
}
