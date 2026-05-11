"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import { Button, SubmitButton } from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks";
import { createEvent, updateEvent } from "@/admin/actions/event";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
import { eventFormSchema } from "@/shared/lib/validations/event";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";
import type {
  getEventById,
  getLocationsForEvent,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";
import { EventBasicFields } from "./EventBasicFields";
import { EventScheduleFields } from "./EventScheduleFields";
import { EventLocationSpaceSelector } from "./EventLocationSpaceSelector";
import { EventPublishFields } from "./EventPublishFields";

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
      const descriptionHtml = renderEditorStateJsonToHtmlClient(
        data.descriptionJson,
      );
      const payload = { ...data, descriptionHtml };
      if (isEdit) {
        return updateEvent(event.id, payload);
      }
      return createEvent(payload);
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
            descriptionHtml: "",
            thumbnailUrl: event.thumbnailUrl,
            startTime: formatDateTimeLocalInJst(event.startTime),
            endTime: formatDateTimeLocalInJst(event.endTime),
            registrationDeadline: event.registrationDeadline
              ? formatDateTimeLocalInJst(event.registrationDeadline)
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
            descriptionHtml: "",
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: 基本情報 + 日程・定員・料金 */}
        <div className="flex flex-col gap-6">
          <EventBasicFields
            register={form.register}
            errors={form.formState.errors}
            isPending={isPending}
          />
          <EventScheduleFields
            register={form.register}
            errors={form.formState.errors}
            isPending={isPending}
          />
        </div>

        {/* 右カラム: 公開設定・サムネ・本文 */}
        <EventPublishFields
          control={form.control}
          setValue={form.setValue}
          register={form.register}
          errors={form.formState.errors}
          isPending={isPending}
        />
      </div>

      {/* 会場 */}
      <EventLocationSpaceSelector
        control={form.control}
        setValue={form.setValue}
        getValues={form.getValues}
        errors={form.formState.errors}
        register={form.register}
        isPending={isPending}
        locations={locations}
        spaces={spaces}
      />

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
