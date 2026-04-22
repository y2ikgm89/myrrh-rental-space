"use client";

import Image from "next/image";
import type { ReactElement } from "react";
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
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
import type { eventFormSchema } from "@/shared/lib/validations/event";
import type { z } from "zod";

// =============================================================================
// Types
// =============================================================================

type FormValues = z.infer<typeof eventFormSchema>;

type EventPublishFieldsProps = {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  isPending: boolean;
};

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Component
// =============================================================================

export function EventPublishFields({
  control,
  setValue,
  register,
  errors,
  isPending,
}: EventPublishFieldsProps): ReactElement {
  const watchedStatus = useWatch({ control, name: "status" });
  const watchedRegistrationOpen = useWatch({
    control,
    name: "registrationOpen",
  });
  const watchedDescriptionJson = useWatch({
    control,
    name: "descriptionJson",
  });
  const watchedThumbnailUrl = useWatch({ control, name: "thumbnailUrl" }) ?? "";

  const isPublished = watchedStatus === EventStatus.PUBLISHED;
  const registrationOpenChecked = isPublished
    ? (watchedRegistrationOpen ?? false)
    : false;

  const handleStatusChange = (value: string) => {
    if (!isValidEventStatus(value)) return;
    setValue("status", value, { shouldDirty: true });
    if (value !== EventStatus.PUBLISHED) {
      setValue("registrationOpen", false, { shouldDirty: true });
    }
  };

  const handleDescriptionJsonChange = (json: string) => {
    setValue("descriptionJson", json, { shouldDirty: true });
  };

  const thumbnailPicker = useSingleMediaPicker({
    defaultUsage: "EVENT",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setValue("thumbnailUrl", selected.url, { shouldDirty: true });
      }
    },
  });

  const handleRemoveThumbnail = () => {
    setValue("thumbnailUrl", null, { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 公開設定 */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>公開</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="status">ステータス</Label>
            <Select
              value={watchedStatus}
              onValueChange={handleStatusChange}
              disabled={isPending}
            >
              <SelectTrigger>
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
            <Label htmlFor="registrationDeadline">申込締切日時（任意）</Label>
            <Input
              id="registrationDeadline"
              type="datetime-local"
              {...register("registrationDeadline")}
              disabled={isPending}
              aria-describedby="registrationDeadline-description"
            />
            <p
              id="registrationDeadline-description"
              className="mt-1 text-xs text-muted-foreground"
            >
              未設定の場合は開始時刻まで申込を受け付けます。
            </p>
            {errors.registrationDeadline && (
              <p className="text-sm text-destructive mt-1">
                {errors.registrationDeadline.message}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Switch
                id="registrationOpen"
                checked={registrationOpenChecked}
                onCheckedChange={(checked) =>
                  setValue("registrationOpen", checked, {
                    shouldDirty: true,
                  })
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
            {watchedThumbnailUrl ? (
              <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-border">
                <Image
                  src={watchedThumbnailUrl}
                  alt="メイン画像プレビュー"
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted">
                <IconPhotoPlus
                  className="h-6 w-6 text-muted-foreground"
                  aria-hidden="true"
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
                  <IconPhotoPlus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {watchedThumbnailUrl ? "変更" : "選択"}
                </Button>
                {watchedThumbnailUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveThumbnail}
                    disabled={isPending}
                  >
                    <IconX className="mr-1 h-4 w-4" aria-hidden="true" />
                    削除
                  </Button>
                )}
              </div>
              {watchedThumbnailUrl && (
                <p className="truncate text-xs text-muted-foreground">
                  {watchedThumbnailUrl}
                </p>
              )}
              {errors.thumbnailUrl && (
                <p className="text-sm text-destructive">
                  {errors.thumbnailUrl.message}
                </p>
              )}
            </div>
          </div>
          {thumbnailPicker.mediaPickerDialog}
        </CardContent>
      </Card>

      {/* 本文（Lexical エディタ） — 詳細説明として最下部に配置（業界標準: Eventbrite / Peatix / connpass 準拠） */}
      <Card>
        <CardHeader>
          <CardTitle>本文（詳細説明）</CardTitle>
        </CardHeader>
        <CardContent>
          <LazyLexicalEditor
            contentJson={watchedDescriptionJson}
            onChange={handleDescriptionJsonChange}
            disabled={isPending}
            className={EDITOR_PROSE_CLASSES}
            placeholder="イベントの詳細・プログラム・参加要件等を入力..."
            showInspector={false}
          />
          {errors.descriptionJson && (
            <p className="text-sm text-destructive mt-2">
              {errors.descriptionJson.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
