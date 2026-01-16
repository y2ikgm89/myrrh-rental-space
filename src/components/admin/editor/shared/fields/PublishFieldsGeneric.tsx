'use client'

/**
 * PublishFieldsGeneric
 *
 * 汎用公開設定フィールド
 * ジェネリック型で任意のフォームに対応
 */

import { useWatch, type FieldValues, type Path } from 'react-hook-form'
import { Input, Label, Switch } from '@/components/admin/ui'
import type { SidePanelFormProps } from '@/types/editor-panel'

type PublishFieldsGenericProps<T extends FieldValues> = SidePanelFormProps<T> & {
  fieldNames: {
    isPublished: Path<T>
    publishedAt: Path<T>
  }
}

export function PublishFieldsGeneric<T extends FieldValues>({
  register,
  control,
  errors,
  setValue,
  disabled,
  fieldNames,
}: PublishFieldsGenericProps<T>) {
  const isPublished = useWatch({ control, name: fieldNames.isPublished })
  const publishedAtError = errors[fieldNames.publishedAt]

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
          checked={!!isPublished}
          onCheckedChange={(checked) => {
            setValue?.(fieldNames.isPublished, checked as T[Path<T>])
          }}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="publishedAt">公開日時</Label>
        <Input
          id="publishedAt"
          type="datetime-local"
          {...register(fieldNames.publishedAt)}
          disabled={disabled}
        />
        {publishedAtError && (
          <p className="text-sm text-destructive">
            {String(publishedAtError.message)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          空欄の場合、公開時の日時が設定されます
        </p>
      </div>
    </div>
  )
}
