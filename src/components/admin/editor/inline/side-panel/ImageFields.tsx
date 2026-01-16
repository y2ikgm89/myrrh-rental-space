'use client'

/**
 * 画像フィールド
 *
 * サムネイル・OGP画像の設定
 * ブログ記事用
 */

import Image from 'next/image'
import { ImagePlus } from 'lucide-react'
import type { FieldErrors, UseFormSetValue } from 'react-hook-form'
import { Button, Label } from '@/components/admin/ui'
import { useSingleMediaPicker } from '@/hooks/use-media-picker'
import type { BlogEditorFormData } from '../types'

type ImageFieldsProps = {
  errors: FieldErrors<BlogEditorFormData>
  setValue: UseFormSetValue<BlogEditorFormData>
  thumbnailUrl?: string
  ogpImageUrl?: string
  disabled?: boolean
}

export function ImageFields({
  errors,
  setValue,
  thumbnailUrl,
  ogpImageUrl,
  disabled,
}: ImageFieldsProps) {
  const thumbnailPicker = useSingleMediaPicker({
    defaultUsage: 'BLOG',
    onSelect: (media) => {
      if (media.length > 0) {
        setValue('thumbnailUrl', media[0].url)
      }
    },
  })

  const ogpPicker = useSingleMediaPicker({
    defaultUsage: 'BLOG',
    onSelect: (media) => {
      if (media.length > 0) {
        setValue('ogpImageUrl', media[0].url)
      }
    },
  })

  return (
    <div className="space-y-4">
      {/* サムネイル */}
      <div className="space-y-2">
        <Label htmlFor="thumbnailUrl">サムネイル</Label>
        <div className="flex items-start gap-3">
          {thumbnailUrl ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
              <Image
                src={thumbnailUrl}
                alt="サムネイル"
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
              onClick={() => thumbnailPicker.openPicker()}
              disabled={disabled}
            >
              <ImagePlus className="mr-1 h-3 w-3" />
              選択
            </Button>
            {thumbnailUrl && (
              <p className="truncate text-xs text-muted-foreground">
                {thumbnailUrl}
              </p>
            )}
          </div>
        </div>
        {errors.thumbnailUrl && (
          <p className="text-sm text-destructive">{errors.thumbnailUrl.message}</p>
        )}
      </div>

      {/* OGP画像 */}
      <div className="space-y-2">
        <Label htmlFor="ogpImageUrl">OGP画像</Label>
        <div className="flex items-start gap-3">
          {ogpImageUrl ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
              <Image
                src={ogpImageUrl}
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
            {ogpImageUrl && (
              <p className="truncate text-xs text-muted-foreground">
                {ogpImageUrl}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          空欄の場合、サムネイルが使用されます
        </p>
      </div>

      {/* メディアピッカーダイアログ */}
      <thumbnailPicker.MediaPicker />
      <ogpPicker.MediaPicker />
    </div>
  )
}
