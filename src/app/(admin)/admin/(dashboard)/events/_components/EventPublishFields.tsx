"use client";

import Image from "next/image";
import type { ReactElement } from "react";
import { getInputProps } from "@conform-to/react";
import { IconPhotoPlus, IconX } from "@tabler/icons-react";
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
  Switch,
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidEventStatus } from "@/shared/lib/validations/enums/guards";
import { EVENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import type { EventFormFields } from "./event-form-fields-types";

type EventPublishFieldsProps = {
  fields: EventFormFields;
  isPending: boolean;
  status: EventStatus;
  onStatusChange: (status: EventStatus) => void;
  registrationOpen: boolean;
  onRegistrationOpenChange: (open: boolean) => void;
  contentJson: string;
  onContentJsonChange: (json: string) => void;
  thumbnailUrl: string | null;
  onThumbnailUrlChange: (url: string | null) => void;
};

const EVENT_STATUS_OPTIONS = [
  { value: EventStatus.DRAFT, label: EVENT_STATUS_LABELS[EventStatus.DRAFT] },
  {
    value: EventStatus.PUBLISHED,
    label: EVENT_STATUS_LABELS[EventStatus.PUBLISHED],
  },
  {
    value: EventStatus.CANCELLED,
    label: EVENT_STATUS_LABELS[EventStatus.CANCELLED],
  },
  {
    value: EventStatus.ARCHIVED,
    label: EVENT_STATUS_LABELS[EventStatus.ARCHIVED],
  },
] as const;

export function EventPublishFields({
  fields,
  isPending,
  status,
  onStatusChange,
  registrationOpen,
  onRegistrationOpenChange,
  contentJson,
  onContentJsonChange,
  thumbnailUrl,
  onThumbnailUrlChange,
}: EventPublishFieldsProps): ReactElement {
  const isPublished = status === EventStatus.PUBLISHED;
  const registrationOpenChecked = isPublished ? registrationOpen : false;

  const handleStatusChange = (value: string) => {
    if (!isValidEventStatus(value)) return;
    onStatusChange(value);
  };

  const thumbnailPicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "EVENT",
    showUrlTab: false,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        onThumbnailUrlChange(selected.url);
      }
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* 公開設定 */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>公開</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="event-status">ステータス</Label>
            <Select
              value={status}
              onValueChange={handleStatusChange}
              disabled={isPending}
            >
              <SelectTrigger id="event-status">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor={fields.registrationDeadline.id}>
              申込締切日時（任意）
            </Label>
            <Input
              {...getInputProps(fields.registrationDeadline, {
                type: "datetime-local",
              })}
              disabled={isPending}
              aria-describedby="registrationDeadline-description"
            />
            <p
              id="registrationDeadline-description"
              className="mt-1 text-xs text-muted-foreground"
            >
              未設定の場合は開始時刻まで申込を受け付けます。
            </p>
            {fields.registrationDeadline.errors && (
              <p
                id={fields.registrationDeadline.errorId}
                className="mt-1 text-sm text-destructive"
              >
                {fields.registrationDeadline.errors.join(", ")}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Switch
                id="registrationOpen"
                checked={registrationOpenChecked}
                onCheckedChange={(checked) =>
                  onRegistrationOpenChange(checked === true)
                }
                disabled={isPending || !isPublished}
              />
              <Label htmlFor="registrationOpen">参加登録を受付中</Label>
            </div>
            {!isPublished && (
              <p className="mt-1 text-xs text-muted-foreground">
                ステータスが「公開中」のときのみ申込を受け付けられます。
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* メイン画像 */}
      <Card>
        <CardHeader>
          <CardTitle>メイン画像</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            {thumbnailUrl ? (
              <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-border">
                <Image
                  src={thumbnailUrl}
                  alt="メイン画像プレビュー"
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted">
                <IconPhotoPlus
                  aria-hidden="true"
                  className="h-6 w-6 text-muted-foreground"
                />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <p className="text-sm text-muted-foreground">
                一覧カード・OGP・詳細ページヒーローで使用します。横長比率（16:9
                程度）を推奨。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => thumbnailPicker.openPicker()}
                  disabled={isPending}
                >
                  <IconPhotoPlus aria-hidden="true" className="mr-1 h-4 w-4" />
                  {thumbnailUrl ? "変更" : "選択"}
                </Button>
                {thumbnailUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onThumbnailUrlChange(null)}
                    disabled={isPending}
                  >
                    <IconX aria-hidden="true" className="mr-1 h-4 w-4" />
                    削除
                  </Button>
                )}
              </div>
              {thumbnailUrl && (
                <p className="truncate text-xs text-muted-foreground">
                  {thumbnailUrl}
                </p>
              )}
              {fields.thumbnailUrl.errors && (
                <p className="text-sm text-destructive">
                  {fields.thumbnailUrl.errors.join(", ")}
                </p>
              )}
            </div>
          </div>
          {thumbnailPicker.mediaPickerDialog}
        </CardContent>
      </Card>

      {/* 本文（Lexical エディタ） */}
      <Card>
        <CardHeader>
          <CardTitle>本文（詳細説明）</CardTitle>
        </CardHeader>
        <CardContent>
          <LazyLexicalEditor
            contentJson={contentJson}
            onChange={onContentJsonChange}
            disabled={isPending}
            className={EDITOR_PROSE_CLASSES}
            placeholder="イベントの詳細・プログラム・参加要件等を入力..."
            height="560px"
          />
          {fields.descriptionJson.errors && (
            <p className="mt-2 text-sm text-destructive">
              {fields.descriptionJson.errors.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
