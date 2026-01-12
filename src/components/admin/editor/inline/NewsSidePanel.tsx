'use client'

/**
 * ニュース用サイドパネル
 *
 * お知らせの編集設定パネル
 * タイトルと公開設定のみのシンプルな構成
 */

import { X } from 'lucide-react'
import { tv } from 'tailwind-variants'
import type { UseFormRegister, Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from '@/components/admin/ui'
import { useWatch } from 'react-hook-form'
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
  const isPublished = useWatch({ control, name: 'isPublished' })

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
                <CardTitle className="text-sm">公開設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="isPublished" className="text-base">
                      公開する
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      オフにすると下書き状態になります
                    </p>
                  </div>
                  <Switch
                    id="isPublished"
                    checked={isPublished}
                    onCheckedChange={(checked) => setValue('isPublished', checked, { shouldDirty: true })}
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="publishedAt">公開日時</Label>
                  <Input
                    id="publishedAt"
                    type="datetime-local"
                    {...register('publishedAt')}
                    disabled={disabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    空欄の場合、公開時の日時が設定されます
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </aside>
    </>
  )
}
