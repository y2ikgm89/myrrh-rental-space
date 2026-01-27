'use client'

/**
 * OGP設定フィールド
 *
 * SNSシェア時の表示設定
 * フィールド名をpropsで受け取ることで完全な型安全性を確保
 */

import type { FieldValues } from 'react-hook-form'
import { Input, Label, Textarea } from '@/admin/components/ui'
import { getFieldError, getErrorMessage } from '../types'
import type { OGPFieldsProps } from '../types'

export function OGPFields<T extends FieldValues>({
  register,
  errors,
  disabled,
  fields,
}: OGPFieldsProps<T>) {
  const ogpTitleError = getFieldError(errors, fields.ogpTitle)
  const ogpDescriptionError = getFieldError(errors, fields.ogpDescription)
  const ogpImageUrlError = getFieldError(errors, fields.ogpImageUrl)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ogpTitle">OGPタイトル</Label>
        <Input
          id="ogpTitle"
          {...register(fields.ogpTitle)}
          placeholder="SNSシェア時のタイトル（100文字以内推奨）"
          disabled={disabled}
        />
        {ogpTitleError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(ogpTitleError)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ogpDescription">OGP説明文</Label>
        <Textarea
          id="ogpDescription"
          {...register(fields.ogpDescription)}
          placeholder="SNSシェア時の説明文（200文字以内推奨）"
          rows={3}
          disabled={disabled}
        />
        {ogpDescriptionError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(ogpDescriptionError)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ogpImageUrl">OGP画像URL</Label>
        <Input
          id="ogpImageUrl"
          {...register(fields.ogpImageUrl)}
          placeholder="https://example.com/images/ogp.jpg"
          disabled={disabled}
        />
        {ogpImageUrlError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(ogpImageUrlError)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          推奨サイズ: 1200x630px
        </p>
      </div>
    </div>
  )
}
