'use client'

/**
 * ニュース用サイドパネル
 *
 * お知らせの編集設定パネル
 * タイトルとレイアウト設定
 * 公開/非公開はヘッダーのボタンで操作
 */

import type { UseFormRegister, Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'
import { SidePanelShell } from './SidePanelShell'
import type { NewsEditorFormData } from './types'

interface ContentWidthOption {
  value: string
  label: string
}

const CONTENT_WIDTH_OPTIONS: readonly ContentWidthOption[] = [
  { value: 'DEFAULT', label: 'デフォルト' },
  { value: 'XS', label: '極小 (640px)' },
  { value: 'SM', label: '小 (768px)' },
  { value: 'MD', label: '中 (1024px)' },
  { value: 'LG', label: '大 (1280px)' },
  { value: 'XL', label: '特大 (1536px)' },
  { value: 'FULL', label: '全幅' },
  { value: 'CUSTOM', label: 'カスタム' },
]

type NewsSidePanelProps = {
  isOpen: boolean
  onClose: () => void
  register: UseFormRegister<NewsEditorFormData>
  control: Control<NewsEditorFormData>
  errors: FieldErrors<NewsEditorFormData>
  setValue: UseFormSetValue<NewsEditorFormData>
  disabled?: boolean
}

export function NewsSidePanel({
  isOpen,
  onClose,
  register,
  control,
  errors,
  setValue,
  disabled,
}: NewsSidePanelProps) {
  const contentWidth = useWatch({ control, name: 'contentWidth' })

  return (
    <SidePanelShell isOpen={isOpen} onClose={onClose} title="お知らせ設定" width="narrow">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">タイトル</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Input
                id="title"
                {...register('title')}
                placeholder="お知らせのタイトル"
                disabled={disabled}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">レイアウト</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contentWidth">コンテンツ幅</Label>
              <Select
                value={contentWidth || 'DEFAULT'}
                onValueChange={(value) => {
                  setValue('contentWidth', value === 'DEFAULT' ? undefined : value, { shouldDirty: true })
                  if (value !== 'CUSTOM') {
                    setValue('contentWidthCustom', undefined, { shouldDirty: true })
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger id="contentWidth">
                  <SelectValue placeholder="デフォルト" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_WIDTH_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                個別に幅を設定（空欄でサイト設定を使用）
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidePanelShell>
  )
}
