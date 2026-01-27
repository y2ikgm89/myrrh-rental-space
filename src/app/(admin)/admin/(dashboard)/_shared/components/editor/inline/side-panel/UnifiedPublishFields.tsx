'use client'

/**
 * 統一公開設定フィールド
 *
 * status方式（PostStatus enum）とisPublished方式（boolean）の両方に対応
 * controlTypeで切り替え
 */

import type { FieldValues, Path } from 'react-hook-form'
import { PostStatus } from '@/shared/generated/prisma/enums'
import {
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'
import { getFieldError, getErrorMessage } from '../types'
import type { FieldComponentProps } from '../content-types/types'

/** 公開方式の型（後方互換性のため維持） */
type PublishControlType = 'status' | 'isPublished'

const STATUS_OPTIONS = [
  { value: PostStatus.DRAFT, label: '下書き' },
  { value: PostStatus.PUBLISHED, label: '公開' },
  { value: PostStatus.ARCHIVED, label: 'アーカイブ' },
] as const

const VALID_STATUSES: ReadonlySet<string> = new Set(
  STATUS_OPTIONS.map((opt) => opt.value)
)

function isPostStatus(value: string): value is PostStatus {
  return VALID_STATUSES.has(value)
}

type UnifiedPublishFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
  /** 公開方式 */
  controlType: PublishControlType
  /** フィールド名マッピング */
  fields: {
    publishedAt: Path<T>
    status?: Path<T>
    isPublished?: Path<T>
  }
  /** status方式の場合の現在値 */
  statusValue?: PostStatus
  /** status変更時のコールバック */
  onStatusChange?: (value: PostStatus) => void
  /** isPublished方式の場合の現在値 */
  isPublishedValue?: boolean
  /** isPublished変更時のコールバック */
  onIsPublishedChange?: (value: boolean) => void
}

export function UnifiedPublishFields<T extends FieldValues>({
  register,
  errors,
  disabled,
  controlType,
  fields,
  statusValue,
  onStatusChange,
  isPublishedValue,
  onIsPublishedChange,
}: UnifiedPublishFieldsProps<T>) {
  const publishedAtError = getFieldError(errors, fields.publishedAt)

  return (
    <div className="space-y-4">
      {controlType === 'status' && statusValue !== undefined && onStatusChange && (
        <div className="space-y-2">
          <Label htmlFor="status">公開ステータス</Label>
          <Select
            value={statusValue}
            onValueChange={(value) => {
              if (isPostStatus(value)) {
                onStatusChange(value)
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger id="status">
              <SelectValue placeholder="ステータスを選択" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {controlType === 'isPublished' && isPublishedValue !== undefined && onIsPublishedChange && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="isPublished">公開する</Label>
            <p className="text-xs text-muted-foreground">
              オフにすると非公開になります
            </p>
          </div>
          <Switch
            id="isPublished"
            checked={isPublishedValue}
            onCheckedChange={onIsPublishedChange}
            disabled={disabled}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="publishedAt">公開日時</Label>
        <Input
          id="publishedAt"
          type="datetime-local"
          {...register(fields.publishedAt)}
          disabled={disabled}
        />
        {publishedAtError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(publishedAtError)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          空欄の場合、公開時の日時が設定されます
        </p>
      </div>
    </div>
  )
}
