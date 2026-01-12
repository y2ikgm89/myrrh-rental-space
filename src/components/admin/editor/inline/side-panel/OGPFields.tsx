'use client'

/**
 * OGP設定フィールド
 *
 * SNSシェア時の表示設定
 */

import { Input, Label, Textarea } from '@/components/admin/ui'
import type { SidePanelSectionProps } from '../types'

export function OGPFields({
  register,
  errors,
  disabled,
}: SidePanelSectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ogpTitle">OGPタイトル</Label>
        <Input
          id="ogpTitle"
          {...register('ogpTitle')}
          placeholder="SNSシェア時のタイトル（100文字以内推奨）"
          disabled={disabled}
        />
        {errors.ogpTitle && (
          <p className="text-sm text-destructive">
            {errors.ogpTitle.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ogpDescription">OGP説明文</Label>
        <Textarea
          id="ogpDescription"
          {...register('ogpDescription')}
          placeholder="SNSシェア時の説明文（200文字以内推奨）"
          rows={3}
          disabled={disabled}
        />
        {errors.ogpDescription && (
          <p className="text-sm text-destructive">
            {errors.ogpDescription.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ogpImageUrl">OGP画像URL</Label>
        <Input
          id="ogpImageUrl"
          {...register('ogpImageUrl')}
          placeholder="https://example.com/images/ogp.jpg"
          disabled={disabled}
        />
        {errors.ogpImageUrl && (
          <p className="text-sm text-destructive">
            {errors.ogpImageUrl.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          推奨サイズ: 1200x630px
        </p>
      </div>
    </div>
  )
}
