'use client'

/**
 * レイアウト設定フィールド
 *
 * コンテンツ幅の個別設定
 * サイドバー表示設定
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
} from '@/admin/components/ui'
import type { SidePanelSectionProps } from '../types'

interface ContentWidthOption {
  value: string
  label: string
  description: string
}

const CONTENT_WIDTH_OPTIONS: readonly ContentWidthOption[] = [
  { value: 'DEFAULT', label: 'デフォルト（サイト設定を使用）', description: '' },
  { value: 'XS', label: '極小 (640px)', description: '狭いコンテンツ向け' },
  { value: 'SM', label: '小 (768px)', description: '記事コンテンツ推奨' },
  { value: 'MD', label: '中 (1024px)', description: 'バランスの良い幅' },
  { value: 'LG', label: '大 (1280px)', description: '広めのコンテンツ' },
  { value: 'CUSTOM', label: 'カスタム', description: '任意の幅を指定' },
]

interface SidebarOption {
  value: string
  label: string
  description: string
}

const SIDEBAR_OPTIONS: readonly SidebarOption[] = [
  { value: 'default', label: 'デフォルト（非表示）', description: 'カスタムページは通常非表示' },
  { value: 'true', label: '表示', description: 'サイドバーを表示' },
  { value: 'false', label: '非表示', description: 'サイドバーを非表示' },
]

export function LayoutFields({
  register,
  control,
  errors,
  setValue,
  disabled,
}: SidePanelSectionProps) {
  const contentWidth = useWatch({ control, name: 'contentWidth' }) || 'DEFAULT'
  const showSidebarValue = useWatch({ control, name: 'showSidebar' })

  // showSidebar を文字列に変換（null → 'default', true → 'true', false → 'false'）
  const sidebarSelectValue =
    showSidebarValue === null || showSidebarValue === undefined
      ? 'default'
      : showSidebarValue
        ? 'true'
        : 'false'

  return (
    <div className="space-y-6">
      {/* コンテンツ幅設定 */}
      <div className="space-y-2">
        <Label htmlFor="contentWidth">コンテンツ幅</Label>
        <Select
          value={contentWidth}
          onValueChange={(value) => {
            setValue?.('contentWidth', value === 'DEFAULT' ? undefined : value)
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
              <SelectItem key={option.value} value={option.value}>
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
          {'contentWidthCustom' in errors && errors['contentWidthCustom'] && (
            <p className="text-sm text-destructive">
              {String(errors['contentWidthCustom'].message ?? '')}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            320px〜1920pxの範囲で入力してください
          </p>
        </div>
      )}

      {/* サイドバー表示設定 */}
      <div className="space-y-2">
        <Label htmlFor="showSidebar">サイドバー表示</Label>
        <Select
          value={sidebarSelectValue}
          onValueChange={(value) => {
            // 'default' → null, 'true' → true, 'false' → false
            const booleanValue =
              value === 'default' ? null : value === 'true'
            setValue?.('showSidebar', booleanValue)
          }}
          disabled={disabled}
        >
          <SelectTrigger id="showSidebar">
            <SelectValue placeholder="デフォルト（非表示）" />
          </SelectTrigger>
          <SelectContent>
            {SIDEBAR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
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
          ブログサイドバー（検索・新着・人気・カテゴリー・タグ）の表示設定
        </p>
      </div>
    </div>
  )
}
