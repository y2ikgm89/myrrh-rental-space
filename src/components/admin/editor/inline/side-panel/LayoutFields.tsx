'use client'

/**
 * レイアウト設定フィールド
 *
 * コンテンツ幅の個別設定
 * デフォルト（サイト設定）または個別指定を選択可能
 */

import { useWatch } from 'react-hook-form'
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui'
import type { SidePanelSectionProps } from '../types'

const CONTENT_WIDTH_OPTIONS = [
  { value: '', label: 'デフォルト（サイト設定を使用）', description: '' },
  { value: 'XS', label: '極小 (640px)', description: '狭いコンテンツ向け' },
  { value: 'SM', label: '小 (768px)', description: '記事コンテンツ推奨' },
  { value: 'MD', label: '中 (1024px)', description: 'バランスの良い幅' },
  { value: 'LG', label: '大 (1280px)', description: '広めのコンテンツ' },
  { value: 'CUSTOM', label: 'カスタム', description: '任意の幅を指定' },
] as const

export function LayoutFields({
  register,
  control,
  errors,
  setValue,
  disabled,
}: SidePanelSectionProps) {
  const contentWidth = useWatch({ control, name: 'contentWidth' }) || ''

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contentWidth">コンテンツ幅</Label>
        <Select
          value={contentWidth}
          onValueChange={(value) => {
            setValue?.('contentWidth', value || undefined)
            if (value !== 'CUSTOM') {
              setValue?.('contentWidthCustom', undefined)
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger id="contentWidth">
            <SelectValue placeholder="デフォルト（サイト設定を使用）" />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_WIDTH_OPTIONS.map((option) => (
              <SelectItem key={option.value || 'default'} value={option.value}>
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  {option.description && (
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          この記事のコンテンツ表示幅を個別に設定できます
        </p>
      </div>

      {contentWidth === 'CUSTOM' && (
        <div className="space-y-2">
          <Label htmlFor="contentWidthCustom">カスタム幅 (px)</Label>
          <Input
            id="contentWidthCustom"
            type="number"
            min="320"
            max="1920"
            {...register('contentWidthCustom')}
            placeholder="例: 900"
            disabled={disabled}
          />
          {errors.contentWidthCustom && (
            <p className="text-sm text-destructive">
              {errors.contentWidthCustom.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            320px〜1920pxの範囲で入力してください
          </p>
        </div>
      )}
    </div>
  )
}
