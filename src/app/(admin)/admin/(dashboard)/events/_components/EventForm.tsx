"use client";

import type { ReactElement } from "react";
import { useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
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
import { createEvent, updateEvent } from "@/admin/actions/event";
import { eventFormSchema } from "@/shared/lib/validations/event";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidEventStatus } from "@/shared/lib/validations/enums/guards";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import Link from "next/link";
import type {
  getEventById,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";

// =============================================================================
// Types
// =============================================================================

type EventData = NonNullable<Awaited<ReturnType<typeof getEventById>>>;
type SpaceOption = Awaited<ReturnType<typeof getSpacesForEvent>>[number];

type EventFormProps = {
  event?: EventData;
  spaces: SpaceOption[];
};

// =============================================================================
// Helpers
// =============================================================================

function serializeContentJson(contentJson: unknown): string {
  if (contentJson == null) return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  if (typeof contentJson === "string") return contentJson;
  return JSON.stringify(contentJson);
}

function parseContentJsonSafe(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
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

const SPACE_NONE_VALUE = "__none__";

const EVENT_STATUS_OPTIONS = [
  { value: EventStatus.DRAFT, label: "下書き" },
  { value: EventStatus.PUBLISHED, label: "公開中" },
  { value: EventStatus.CANCELLED, label: "キャンセル" },
  { value: EventStatus.ARCHIVED, label: "アーカイブ" },
] as const;

// =============================================================================
// Component
// =============================================================================

export function EventForm({ event, spaces }: EventFormProps): ReactElement {
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
            description: event.description ?? "",
            contentJson: event.contentJson ?? null,
            startTime: formatDateTimeForInput(event.startTime),
            endTime: formatDateTimeForInput(event.endTime),
            capacity: event.capacity ?? undefined,
            price: event.price ?? undefined,
            location: event.location ?? "",
            spaceId: event.spaceId ?? "",
            status: event.status,
            registrationOpen: event.registrationOpen,
          }
        : {
            title: "",
            slug: "",
            description: "",
            contentJson: null,
            startTime: "",
            endTime: "",
            capacity: undefined,
            price: undefined,
            location: "",
            spaceId: "",
            status: EventStatus.DRAFT,
            registrationOpen: true,
          },
    },
  );

  const watchedSpaceId = useWatch({ control: form.control, name: "spaceId" });
  const watchedStatus = useWatch({ control: form.control, name: "status" });
  const watchedRegistrationOpen = useWatch({
    control: form.control,
    name: "registrationOpen",
  });
  const watchedContentJson = useWatch({
    control: form.control,
    name: "contentJson",
  });

  // Lexical エディタ用: DB の JSON オブジェクトを文字列に変換
  const contentJsonString = serializeContentJson(watchedContentJson);

  const handleContentJsonChange = (json: string) => {
    form.setValue("contentJson", parseContentJsonSafe(json), {
      shouldDirty: true,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: 基本情報 */}
        <Card>
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

            <div>
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                rows={4}
                disabled={isPending}
              />
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

            <div>
              <Label htmlFor="location">場所</Label>
              <Input
                id="location"
                {...form.register("location")}
                disabled={isPending}
              />
            </div>
          </CardContent>
        </Card>

        {/* 右カラム: 設定 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

              <div>
                <Label htmlFor="spaceId">スペース</Label>
                <Select
                  value={watchedSpaceId || SPACE_NONE_VALUE}
                  onValueChange={(value) =>
                    form.setValue(
                      "spaceId",
                      value === SPACE_NONE_VALUE ? null : value,
                    )
                  }
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="スペースを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SPACE_NONE_VALUE}>なし</SelectItem>
                    {spaces.map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">ステータス</Label>
                <Select
                  value={watchedStatus}
                  onValueChange={(value) => {
                    if (isValidEventStatus(value)) {
                      form.setValue("status", value);
                    }
                  }}
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

              <div className="flex items-center gap-2">
                <Switch
                  id="registrationOpen"
                  checked={watchedRegistrationOpen ?? true}
                  onCheckedChange={(checked) =>
                    form.setValue("registrationOpen", checked)
                  }
                  disabled={isPending}
                />
                <Label htmlFor="registrationOpen">参加登録を受付中</Label>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 本文コンテンツ（Lexical エディタ） */}
      <Card>
        <CardHeader>
          <CardTitle>本文コンテンツ</CardTitle>
        </CardHeader>
        <CardContent>
          <LazyLexicalEditor
            contentJson={contentJsonString}
            onChange={handleContentJsonChange}
            disabled={isPending}
            className={EDITOR_PROSE_CLASSES}
            placeholder="イベントの詳細な説明を入力..."
            showInspector={false}
          />
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
