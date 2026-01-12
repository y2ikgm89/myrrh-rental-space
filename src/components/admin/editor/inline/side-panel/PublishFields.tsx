'use client'

/**
 * 公開設定フィールド
 *
 * 公開ステータス、公開日時の編集
 */

import { useWatch } from 'react-hook-form'
import { Input, Label, Switch } from '@/components/admin/ui'
import type { SidePanelSectionProps } from '../types'

export function PublishFields({
  register,
  control,
  errors,
  setValue,
  disabled,
}: SidePanelSectionProps) {
  const isPublished = useWatch({ control, name: 'isPublished' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="isPublished">公開する</Label>
          <p className="text-xs text-muted-foreground">
            オフにすると非公開になります
          </p>
        </div>
        <Switch
          id="isPublished"
          checked={isPublished}
          onCheckedChange={(checked) => {
            setValue?.('isPublished', checked)
          }}
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
        {errors.publishedAt && (
          <p className="text-sm text-destructive">
            {errors.publishedAt.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          空欄の場合、公開時の日時が設定されます
        </p>
      </div>
    </div>
  )
}
