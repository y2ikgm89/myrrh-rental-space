"use client";

import type { ReactElement } from "react";
import { useActionState, useState } from "react";
import Link from "next/link";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { Button, SubmitButton } from "@/admin/components/ui";
import { createEventAction, updateEventAction } from "@/admin/actions/event";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
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
import { eventFormSchema } from "./event-form-schema";
import { TicketsField } from "./TicketsField";
import {
  createDefaultTicket,
  type EventTicketInput,
} from "@/shared/domain/events/ticket-types";

type EventData = NonNullable<Awaited<ReturnType<typeof getEventById>>>;
type SpaceOption = Awaited<ReturnType<typeof getSpacesForEvent>>[number];
type LocationOption = Awaited<ReturnType<typeof getLocationsForEvent>>[number];

type EventFormProps = {
  event?: EventData;
  locations: LocationOption[];
  spaces: SpaceOption[];
};

/**
 * DB の Lexical JSON（オブジェクト形式）を Editor 初期値用の文字列に変換。
 */
function serializeDescriptionJson(value: unknown): string {
  if (value == null) return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function EventForm({
  event,
  locations,
  spaces,
}: EventFormProps): ReactElement {
  const isEdit = Boolean(event);

  // Controlled state（hidden input 経由で送信）
  const [contentJson, setContentJson] = useState<string>(() =>
    serializeDescriptionJson(event?.descriptionJson),
  );
  // 派生計算: React Compiler が自動メモ化（flushSync / useMemo 不要、Task 8.3 canonical）
  const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    event?.thumbnailUrl ?? null,
  );
  const [status, setStatus] = useState<EventStatus>(
    event?.status ?? EventStatus.DRAFT,
  );
  const [registrationOpen, setRegistrationOpen] = useState<boolean>(
    event?.registrationOpen ?? false,
  );
  const [locationId, setLocationId] = useState<string | null>(
    event?.locationId ?? null,
  );
  const [spaceId, setSpaceId] = useState<string | null>(event?.spaceId ?? null);
  const [tickets, setTickets] = useState<EventTicketInput[]>(() => {
    if (event && event.tickets.length > 0) {
      return event.tickets.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price: t.price,
        capacity: t.capacity,
        unitSize: t.unitSize,
        sortOrder: t.sortOrder,
        isAvailable: t.isAvailable,
      }));
    }
    return [createDefaultTicket(0)];
  });

  const boundAction =
    isEdit && event?.id
      ? updateEventAction.bind(null, event.id)
      : createEventAction;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `event-edit-${event?.id ?? ""}` : "event-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: eventFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: event
      ? {
          title: event.title,
          slug: event.slug,
          startTime: formatDateTimeLocalInJst(event.startTime),
          endTime: formatDateTimeLocalInJst(event.endTime),
          registrationDeadline: event.registrationDeadline
            ? formatDateTimeLocalInJst(event.registrationDeadline)
            : "",
          capacity: event.capacity != null ? String(event.capacity) : "",
          addressDetail: event.addressDetail ?? "",
        }
      : {
          title: "",
          slug: "",
          startTime: "",
          endTime: "",
          registrationDeadline: "",
          capacity: "",
          addressDetail: "",
        },
  });

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      {/* hidden inputs (controlled state → FormData) */}
      <input
        type="hidden"
        name={fields.descriptionJson.name}
        value={contentJson}
      />
      <input
        type="hidden"
        name={fields.descriptionHtml.name}
        value={contentHtml}
      />
      <input
        type="hidden"
        name={fields.thumbnailUrl.name}
        value={thumbnailUrl ?? ""}
      />
      <input type="hidden" name={fields.status.name} value={status} />
      <input
        type="hidden"
        name={fields.registrationOpen.name}
        value={registrationOpen ? "on" : ""}
      />
      <input
        type="hidden"
        name={fields.locationId.name}
        value={locationId ?? ""}
      />
      <input type="hidden" name={fields.spaceId.name} value={spaceId ?? ""} />
      <input
        type="hidden"
        name={fields.tickets.name}
        value={JSON.stringify(tickets)}
      />

      {form.errors && form.errors.length > 0 && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {form.errors.join(", ")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <EventBasicFields fields={fields} isPending={isPending} />
          <EventScheduleFields fields={fields} isPending={isPending} />
        </div>

        <EventPublishFields
          fields={fields}
          isPending={isPending}
          status={status}
          onStatusChange={setStatus}
          registrationOpen={registrationOpen}
          onRegistrationOpenChange={setRegistrationOpen}
          contentJson={contentJson}
          onContentJsonChange={setContentJson}
          thumbnailUrl={thumbnailUrl}
          onThumbnailUrlChange={setThumbnailUrl}
        />
      </div>

      <TicketsField
        tickets={tickets}
        onChange={setTickets}
        errors={fields.tickets.errors ?? undefined}
        isPending={isPending}
      />

      <EventLocationSpaceSelector
        fields={fields}
        isPending={isPending}
        locations={locations}
        spaces={spaces}
        locationId={locationId}
        spaceId={spaceId}
        onLocationChange={(nextLocationId) => {
          setLocationId(nextLocationId);
          if (spaceId) {
            const currentSpace = spaces.find((s) => s.id === spaceId);
            if (!currentSpace || currentSpace.locationId !== nextLocationId) {
              setSpaceId(null);
            }
          }
        }}
        onSpaceChange={(nextSpaceId) => {
          setSpaceId(nextSpaceId);
          if (nextSpaceId) {
            const selected = spaces.find((s) => s.id === nextSpaceId);
            if (selected && locationId !== selected.locationId) {
              setLocationId(selected.locationId);
            }
          }
        }}
      />

      <div className="flex justify-end gap-4">
        <Button variant="outline" asChild>
          <Link href="/admin/events">キャンセル</Link>
        </Button>
        <SubmitButton isPending={isPending} label={isEdit ? "更新" : "作成"} />
      </div>
    </form>
  );
}
