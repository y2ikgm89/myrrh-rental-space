"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";
import { useWatch } from "react-hook-form";
import { IconPhotoPlus, IconX } from "@tabler/icons-react";
import {
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
  SubmitButton,
  Button,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { createEvent, updateEvent } from "@/admin/actions/event";
import { eventFormSchema } from "@/shared/lib/validations/event";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidEventStatus } from "@/shared/lib/validations/enums/guards";
import { EVENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import type {
  getEventById,
  getLocationsForEvent,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";

// =============================================================================
// Types
// =============================================================================

type EventData = NonNullable<Awaited<ReturnType<typeof getEventById>>>;
type SpaceOption = Awaited<ReturnType<typeof getSpacesForEvent>>[number];
type LocationOption = Awaited<ReturnType<typeof getLocationsForEvent>>[number];

type EventFormProps = {
  event?: EventData;
  locations: LocationOption[];
  spaces: SpaceOption[];
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * DB の Lexical JSON（オブジェクト形式）を Editor 初期値用の文字列に変換。
 * Prisma JSON カラムは runtime ではパース済みオブジェクトが返るため、
 * Editor に渡す前に文字列化する。
 */
function serializeDescriptionJson(value: unknown): string {
  if (value == null) return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatDateTimeForInput(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  })
    .format(d)
    .replace(" ", "T");
}

const LOCATION_NONE_VALUE = "__none__";
const SPACE_NONE_VALUE = "__none__";

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

export function EventForm({
  event,
  locations,
  spaces,
}: EventFormProps): ReactElement {
  const isEdit = !!event;

  const { form, isPending, onSubmit } = useFormAction(
    eventFormSchema,
    async (data) => {
      if (isEdit) {
        return updateEvent(event.id, data);
      }
      return createEvent(data);
    },
    {
      redirectTo: "/admin/events",
      successMessage: isEdit
        ? "イベントを更新しました"
        : "イベントを作成しました",
      defaultValues: event
        ? {
            title: event.title,
            slug: event.slug,
            descriptionJson: serializeDescriptionJson(event.descriptionJson),
            thumbnailUrl: event.thumbnailUrl,
            startTime: formatDateTimeForInput(event.startTime),
            endTime: formatDateTimeForInput(event.endTime),
            registrationDeadline: event.registrationDeadline
              ? formatDateTimeForInput(event.registrationDeadline)
              : "",
            capacity: event.capacity ?? undefined,
            price: event.price ?? undefined,
            addressDetail: event.addressDetail ?? "",
            locationId: event.locationId,
            spaceId: event.spaceId,
            status: event.status,
            registrationOpen: event.registrationOpen,
          }
        : {
            title: "",
            slug: "",
            descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
            thumbnailUrl: null,
            startTime: "",
            endTime: "",
            registrationDeadline: "",
            capacity: undefined,
            price: undefined,
            addressDetail: "",
            locationId: null,
            spaceId: null,
            status: EventStatus.DRAFT,
            registrationOpen: false,
          },
    },
  );

  const watchedLocationId = useWatch({
    control: form.control,
    name: "locationId",
  });
  const watchedSpaceId = useWatch({ control: form.control, name: "spaceId" });
  const watchedStatus = useWatch({ control: form.control, name: "status" });
  const watchedRegistrationOpen = useWatch({
    control: form.control,
    name: "registrationOpen",
  });
  const watchedDescriptionJson = useWatch({
    control: form.control,
    name: "descriptionJson",
  });
  const watchedThumbnailUrl =
    useWatch({ control: form.control, name: "thumbnailUrl" }) ?? "";

  const handleDescriptionJsonChange = (json: string) => {
    form.setValue("descriptionJson", json, { shouldDirty: true });
  };

  const thumbnailPicker = useSingleMediaPicker({
    defaultUsage: "EVENT",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        form.setValue("thumbnailUrl", selected.url, { shouldDirty: true });
      }
    },
  });

  const handleRemoveThumbnail = () => {
    form.setValue("thumbnailUrl", null, { shouldDirty: true });
  };

  const hasLocationSelected = Boolean(watchedLocationId);
  const hasSpaceSelected = Boolean(watchedSpaceId);
  const spacesInLocation = watchedLocationId
    ? spaces.filter((s) => s.locationId === watchedLocationId)
    : [];

  const addressDetailFieldMeta = hasSpaceSelected
    ? {
        label: "補足情報（任意）",
        placeholder: "例: 2Fホール / 駐車場入口は北側",
        description:
          "フロア・入口案内・駐車場情報など。住所はスペース所属会場から自動適用されます。",
      }
    : hasLocationSelected
      ? {
          label: "補足情報（任意）",
          placeholder: "例: 2Fホール全体を貸し切り",
          description:
            "会場全体を使う場合はそのまま、特定エリアを使う場合はその情報を入力します。",
        }
      : {
          label: "外部会場名 / 住所",
          placeholder: "例: 渋谷区文化総合センター大和田 地下2F レクホール",
          description: "外部会場で開催する場合の会場名または住所を入力します。",
        };

  const handleLocationChange = (value: string) => {
    const nextLocationId = value === LOCATION_NONE_VALUE ? null : value;
    form.setValue("locationId", nextLocationId, { shouldDirty: true });
    // 現在選択中の space が新 location に属さない場合はクリア
    const currentSpaceId = form.getValues("spaceId");
    if (currentSpaceId) {
      const currentSpace = spaces.find((s) => s.id === currentSpaceId);
      if (!currentSpace || currentSpace.locationId !== nextLocationId) {
        form.setValue("spaceId", null, { shouldDirty: true });
      }
    }
  };

  const handleSpaceChange = (value: string) => {
    const nextSpaceId = value === SPACE_NONE_VALUE ? null : value;
    form.setValue("spaceId", nextSpaceId, { shouldDirty: true });
    // space 選択時は所属 location を自動セット（locationId 未選択時の導線補助）
    if (nextSpaceId) {
      const selected = spaces.find((s) => s.id === nextSpaceId);
      if (selected && form.getValues("locationId") !== selected.locationId) {
        form.setValue("locationId", selected.locationId, {
          shouldDirty: true,
        });
      }
    }
  };

  // status === PUBLISHED のときのみ受付中フラグが意味を持つ
  // （多重防御: 不変条件は server-side `normalizeRegistrationOpen` でも強制）
  const isPublished = watchedStatus === EventStatus.PUBLISHED;
  const registrationOpenChecked = isPublished
    ? (watchedRegistrationOpen ?? false)
    : false;

  const handleStatusChange = (value: string) => {
    if (!isValidEventStatus(value)) return;
    form.setValue("status", value, { shouldDirty: true });
    // PUBLISHED 以外に切替時は受付中も自動で OFF に
    if (value !== EventStatus.PUBLISHED) {
      form.setValue("registrationOpen", false, { shouldDirty: true });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: 基本情報 */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">タイトル</Label>
              <Input
                id="title"
                {...form.register("title")}
                disabled={isPending}
              />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="slug">スラッグ</Label>
              <Input
                id="slug"
                {...form.register("slug")}
                disabled={isPending}
              />
              {form.formState.errors.slug && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.slug.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div>
                <Label htmlFor="startTime">開始日時</Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  {...form.register("startTime")}
                  disabled={isPending}
                />
                {form.formState.errors.startTime && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.startTime.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="endTime">終了日時</Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  {...form.register("endTime")}
                  disabled={isPending}
                />
                {form.formState.errors.endTime && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.endTime.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div>
                <Label htmlFor="capacity">定員</Label>
                <Input
                  id="capacity"
                  type="number"
                  {...form.register("capacity", { valueAsNumber: true })}
                  disabled={isPending}
                />
                {form.formState.errors.capacity && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.capacity.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="price">料金</Label>
                <Input
                  id="price"
                  type="number"
                  {...form.register("price", { valueAsNumber: true })}
                  disabled={isPending}
                />
                {form.formState.errors.price && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.price.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 右カラム: 公開設定 */}
        <div className="flex flex-col gap-6">
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
                <Label htmlFor="registrationDeadline">
                  申込締切日時（任意）
                </Label>
                <Input
                  id="registrationDeadline"
                  type="datetime-local"
                  {...form.register("registrationDeadline")}
                  disabled={isPending}
                  aria-describedby="registrationDeadline-description"
                />
                <p
                  id="registrationDeadline-description"
                  className="mt-1 text-xs text-muted-foreground"
                >
                  未設定の場合は開始時刻まで申込を受け付けます。
                </p>
                {form.formState.errors.registrationDeadline && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.registrationDeadline.message}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="registrationOpen"
                    checked={registrationOpenChecked}
                    onCheckedChange={(checked) =>
                      form.setValue("registrationOpen", checked, {
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
        </div>
      </div>

      {/* 会場 */}
      <Card>
        <CardHeader>
          <CardTitle>会場</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            登録済み会場（本館・支店等）を選択し、その中の特定スペースで開催する場合はスペースも選択します。外部会場の場合は「外部会場」を選んで会場名・住所を入力します。
          </p>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div>
              <Label htmlFor="locationId">会場</Label>
              <Select
                value={watchedLocationId ?? LOCATION_NONE_VALUE}
                onValueChange={handleLocationChange}
                disabled={isPending}
              >
                <SelectTrigger id="locationId">
                  <SelectValue placeholder="会場を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LOCATION_NONE_VALUE}>外部会場</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.locationId && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.locationId.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="spaceId">スペース（任意）</Label>
              <Select
                value={watchedSpaceId ?? SPACE_NONE_VALUE}
                onValueChange={handleSpaceChange}
                disabled={
                  isPending ||
                  !hasLocationSelected ||
                  spacesInLocation.length === 0
                }
              >
                <SelectTrigger id="spaceId">
                  <SelectValue
                    placeholder={
                      !hasLocationSelected
                        ? "先に会場を選択してください"
                        : spacesInLocation.length === 0
                          ? "この会場に登録スペースがありません"
                          : "スペースを選択"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SPACE_NONE_VALUE}>
                    会場全体で開催
                  </SelectItem>
                  {spacesInLocation.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      {space.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                特定スペースで開催する場合のみ選択。ロビーやホール全体を使う場合は「会場全体で開催」のままにします。
              </p>
              {form.formState.errors.spaceId && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.spaceId.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="addressDetail">
              {addressDetailFieldMeta.label}
            </Label>
            <Input
              id="addressDetail"
              {...form.register("addressDetail")}
              disabled={isPending}
              placeholder={addressDetailFieldMeta.placeholder}
              aria-describedby="addressDetail-description"
            />
            <p
              id="addressDetail-description"
              className="mt-1 text-xs text-muted-foreground"
            >
              {addressDetailFieldMeta.description}
            </p>
            {form.formState.errors.addressDetail && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.addressDetail.message}
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
              {form.formState.errors.thumbnailUrl && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.thumbnailUrl.message}
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
          {form.formState.errors.descriptionJson && (
            <p className="text-sm text-destructive mt-2">
              {form.formState.errors.descriptionJson.message}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" asChild>
          <Link href="/admin/events">キャンセル</Link>
        </Button>
        <SubmitButton
          isPending={isPending}
          label={isEdit ? "更新" : "作成"}
          {...(isEdit && { disabled: !form.formState.isDirty })}
        />
      </div>
    </form>
  );
}
