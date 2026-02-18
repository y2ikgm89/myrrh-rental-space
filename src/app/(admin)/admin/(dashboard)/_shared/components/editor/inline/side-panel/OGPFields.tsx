'use client'

/**
 * OGP設定フィールド
 *
 * SNSシェア時の表示設定
 * OGP画像はメディアピッカーで選択
 */

import Image from 'next/image'
import { ImagePlus } from 'lucide-react'
import type { FieldValues } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import { Button, Input, Label, Textarea } from '@/admin/components/ui'
import { useSingleMediaPicker } from '@/admin/hooks/use-media-picker'
import { getFieldError, getErrorMessage } from '../types'
import type { OGPFieldsProps } from '../types'
import { setFieldString } from '../content-types/types'

export function OGPFields<T extends FieldValues>({
  register,
  control,
  errors,
  setValue,
  disabled,
  fields,
}: OGPFieldsProps<T>) {
  const ogpTitleError = getFieldError(errors, fields.ogpTitle)
  const ogpDescriptionError = getFieldError(errors, fields.ogpDescription)
  const ogpImageUrlError = getFieldError(errors, fields.ogpImageUrl)

  const ogpImageUrl = useWatch({ control, name: fields.ogpImageUrl })
  const ogpImageUrlStr = typeof ogpImageUrl === 'string' ? ogpImageUrl : ''

  const ogpPicker = useSingleMediaPicker({
    defaultUsage: 'POST',
    onSelect: (media) => {
      const selected = media[0]
      if (selected) {
        setFieldString(setValue, fields.ogpImageUrl, selected.url)
      }
    },
  })

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
        <Label>OGP画像</Label>
        <div className="flex items-start gap-3">
          {ogpImageUrlStr ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
              <Image
                src={ogpImageUrlStr}
                alt="OGP画像"
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 space-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => ogpPicker.openPicker()}
              disabled={disabled}
            >
              <ImagePlus className="mr-1 h-3 w-3" />
              選択
            </Button>
            {ogpImageUrlStr && (
              <p className="truncate text-xs text-muted-foreground">
                {ogpImageUrlStr}
              </p>
            )}
          </div>
        </div>
        {ogpImageUrlError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(ogpImageUrlError)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          推奨サイズ: 1200x630px
        </p>
      </div>

      <ogpPicker.MediaPicker />
    </div>
  )
}
