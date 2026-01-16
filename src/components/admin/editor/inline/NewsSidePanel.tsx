'use client'

/**
 * ニュース用サイドパネル
 *
 * お知らせの編集設定パネル
 * タイトルとレイアウト設定
 * 公開/非公開はヘッダーのボタンで操作
 */

import { X } from 'lucide-react'
import { tv } from 'tailwind-variants'
import type { UseFormRegister, Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import {
  Button,
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
} from '@/components/admin/ui'
import type { NewsEditorFormData } from './types'

const styles = tv({
  slots: {
    overlay: [
      'fixed inset-0 z-40 bg-black/20 transition-opacity duration-300',
      'lg:hidden',
    ],
    panel: [
      'fixed right-0 top-0 z-50 h-full w-full sm:w-96 bg-background border-l shadow-xl',
      'transform transition-transform duration-300 ease-in-out',
    ],
    header: 'flex items-center justify-between p-4 border-b',
    title: 'text-lg font-semibold',
    content: 'flex-1 overflow-y-auto p-4',
  },
  variants: {
    isOpen: {
      true: {
        overlay: 'opacity-100',
        panel: 'translate-x-0',
      },
      false: {
        overlay: 'opacity-0 pointer-events-none',
        panel: 'translate-x-full',
      },
    },
  },
})

interface ContentWidthOption {
  value: string
  label: string
}

const CONTENT_WIDTH_OPTIONS: readonly ContentWidthOption[] = [
  { value: '', label: 'デフォルト' },
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
  const classes = styles({ isOpen })
  const contentWidth = useWatch({ control, name: 'contentWidth' })

  return (
    <>
      <div className={classes.overlay()} onClick={onClose} aria-hidden="true" />

      <aside className={classes.panel()} aria-label="設定パネル">
        <div className={classes.header()}>
          <h2 className={classes.title()}>お知らせ設定</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">閉じる</span>
          </Button>
        </div>

        <div className={classes.content()}>
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
                    value={contentWidth || ''}
                    onValueChange={(value) => {
                      setValue('contentWidth', value || undefined, { shouldDirty: true })
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
                        <SelectItem key={option.value || 'default'} value={option.value}>
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
        </div>
      </aside>
    </>
  )
}
