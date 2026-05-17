"use client";

/**
 * 統一公開設定フィールド
 *
 * conform `FieldMetadata` ベース。status方式（PostStatus enum）と isPublished 方式
 * （boolean）の両方に対応。`controlType` で切り替え。
 */

import { getInputProps, type FieldMetadata } from "@conform-to/react";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
import { POST_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import {
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

/** コンテンツ種別に応じた公開制御方式の型 */
type PublishControlType = "status" | "isPublished";

const STATUS_OPTIONS = [
  { value: PostStatus.DRAFT, label: POST_STATUS_LABELS.DRAFT },
  { value: PostStatus.PUBLISHED, label: POST_STATUS_LABELS.PUBLISHED },
  { value: PostStatus.ARCHIVED, label: POST_STATUS_LABELS.ARCHIVED },
] as const;

const VALID_STATUSES: ReadonlySet<string> = new Set(
  STATUS_OPTIONS.map((opt) => opt.value),
);

function isPostStatus(value: string): value is PostStatus {
  return VALID_STATUSES.has(value);
}

type UnifiedPublishFieldsProps = {
  /** 公開方式 */
  controlType: PublishControlType;
  /** 公開日時 field */
  publishedAtField: FieldMetadata<string | null | undefined>;
  /** status方式の場合の現在値 */
  statusValue?: PostStatus;
  /** status変更時のコールバック */
  onStatusChange?: (value: PostStatus) => void;
  /** isPublished方式の場合の現在値 */
  isPublishedValue?: boolean;
  /** isPublished変更時のコールバック */
  onIsPublishedChange?: (value: boolean) => void;
  disabled?: boolean;
};

export function UnifiedPublishFields({
  controlType,
  publishedAtField,
  statusValue,
  onStatusChange,
  isPublishedValue,
  onIsPublishedChange,
  disabled,
}: UnifiedPublishFieldsProps) {
  const publishedAtError = publishedAtField.errors?.[0];

  return (
    <div className="space-y-4">
      {controlType === "status" &&
        statusValue !== undefined &&
        onStatusChange && (
          <div className="space-y-2">
            <Label htmlFor="status">公開ステータス</Label>
            <Select
              value={statusValue}
              onValueChange={(value) => {
                if (isPostStatus(value)) {
                  onStatusChange(value);
                }
              }}
              {...(disabled !== undefined && { disabled })}
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

      {controlType === "isPublished" &&
        isPublishedValue !== undefined &&
        onIsPublishedChange && (
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
        <Label htmlFor={publishedAtField.id}>公開日時</Label>
        <Input
          {...getInputProps(publishedAtField, { type: "datetime-local" })}
          disabled={disabled}
        />
        {publishedAtError && (
          <p className="text-sm text-destructive">{publishedAtError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          空欄の場合、公開時の日時が設定されます
        </p>
      </div>
    </div>
  );
}
