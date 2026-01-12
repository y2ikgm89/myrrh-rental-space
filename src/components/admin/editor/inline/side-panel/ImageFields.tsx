'use client'

/**
 * 画像フィールド
 *
 * サムネイル・OGP画像の設定
 * ブログ記事用
 */

import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { Input, Label } from '@/components/admin/ui'
import type { BlogEditorFormData } from '../types'

type ImageFieldsProps = {
  register: UseFormRegister<BlogEditorFormData>
  errors: FieldErrors<BlogEditorFormData>
  disabled?: boolean
}

export function ImageFields({
  register,
  errors,
  disabled,
}: ImageFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="thumbnailUrl">サムネイルURL</Label>
        <Input
          id="thumbnailUrl"
          {...register('thumbnailUrl')}
          placeholder="/images/blog/thumbnail.jpg"
          disabled={disabled}
        />
        {errors.thumbnailUrl && (
          <p className="text-sm text-destructive">{errors.thumbnailUrl.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ogpImageUrl">OGP画像URL</Label>
        <Input
          id="ogpImageUrl"
          {...register('ogpImageUrl')}
          placeholder="/images/blog/ogp.jpg"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          空欄の場合、サムネイルが使用されます
        </p>
      </div>
    </div>
  )
}
