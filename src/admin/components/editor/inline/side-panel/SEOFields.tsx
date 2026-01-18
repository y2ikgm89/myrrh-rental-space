'use client'

/**
 * SEO設定フィールド
 *
 * メタディスクリプション、メタキーワードの編集
 */

import { Input, Label, Textarea } from '@/admin/components/ui'
import type { SidePanelSectionProps } from '../types'

export function SEOFields({
  register,
  errors,
  disabled,
}: SidePanelSectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="metaDescription">メタディスクリプション</Label>
        <Textarea
          id="metaDescription"
          {...register('metaDescription')}
          placeholder="検索結果に表示される説明文（160文字以内推奨）"
          rows={3}
          disabled={disabled}
        />
        {errors.metaDescription && (
          <p className="text-sm text-destructive">
            {errors.metaDescription.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          検索エンジンの結果ページに表示される説明文です
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="metaKeywords">メタキーワード</Label>
        <Input
          id="metaKeywords"
          {...register('metaKeywords')}
          placeholder="キーワード1, キーワード2, キーワード3"
          disabled={disabled}
        />
        {errors.metaKeywords && (
          <p className="text-sm text-destructive">
            {errors.metaKeywords.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          カンマ区切りでキーワードを入力
        </p>
      </div>
    </div>
  )
}
