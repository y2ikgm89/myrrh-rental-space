"use client";

import type { ReactElement } from "react";
import { useActionState, useState } from "react";
import Link from "next/link";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  Button,
  Label,
  SubmitButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { createEventAction, updateEventAction } from "@/admin/actions/event";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";
import { GalleryField } from "@/admin/components/gallery-field/GalleryField";
import { parseGallery } from "@/shared/lib/validations/gallery";
import type {
  getEventById,
  getLocationsForEvent,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";
import { EventBasicFields } from "./EventBasicFields";
import { EventScheduleFields, type SlotFormItem } from "./EventScheduleFields";
import { EventLocationSpaceSelector } from "./EventLocationSpaceSelector";
import { EventPublishFields } from "./EventPublishFields";
import { EventSeoFields } from "./EventSeoFields";
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

const EVENT_EDIT_TAB_VALUES = [
  "basic",
  "publish",
  "tickets",
  "location",
  "seo",
] as const satisfies readonly [string, ...string[]];

type EventEditTabValue = (typeof EVENT_EDIT_TAB_VALUES)[number];

const EVENT_EDIT_TAB_VALUE_SET: ReadonlySet<string> = new Set(
  EVENT_EDIT_TAB_VALUES,
);

function isEventEditTabValue(value: string): value is EventEditTabValue {
  return EVENT_EDIT_TAB_VALUE_SET.has(value);
}

const EVENT_EDIT_TAB_LABELS: Record<EventEditTabValue, string> = {
  basic: "基本情報",
  publish: "本文・公開",
  tickets: "参加費・定員",
  location: "会場",
  seo: "SEO",
};

type ConformFieldErrors = readonly string[] | string[] | undefined;

function fieldHasErrors(errors: ConformFieldErrors): boolean {
  return Array.isArray(errors) && errors.length > 0;
}

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

  // タブ state（イベント管理ハブの `tab` と衝突しないよう `section` を使用）
  const [activeSection, setActiveSection] = useQueryState(
    "section",
    parseAsStringLiteral(EVENT_EDIT_TAB_VALUES)
      .withDefault("basic")
      .withOptions({ history: "replace", shallow: true }),
  );

  // Controlled state（hidden input 経由で送信）
  const [contentJson, setContentJson] = useState<string>(() =>
    serializeDescriptionJson(event?.descriptionJson),
  );

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    event?.thumbnailUrl ?? null,
  );
  const [ogpImageUrl, setOgpImageUrl] = useState<string | null>(
    event?.ogpImageUrl ?? null,
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
        _key: t.id,
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

  const [slots, setSlots] = useState<SlotFormItem[]>(() => {
    if (event && event.slots.length > 0) {
      return event.slots.map((s) => ({
        id: s.id,
        startAt: formatDateTimeLocalInJst(s.startAt),
        endAt: formatDateTimeLocalInJst(s.endAt),
        capacity: s.capacity,
      }));
    }
    return [{ startAt: "", endAt: "", capacity: 0 }];
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
          registrationDeadline: event.registrationDeadline
            ? formatDateTimeLocalInJst(event.registrationDeadline)
            : "",
          addressDetail: event.addressDetail ?? "",
          ogpTitle: event.ogpTitle ?? "",
          ogpDescription: event.ogpDescription ?? "",
          metaDescription: event.metaDescription ?? "",
          metaKeywords: event.metaKeywords ?? "",
          gallery: parseGallery(event.gallery),
        }
      : {
          title: "",
          slug: "",
          registrationDeadline: "",
          addressDetail: "",
          ogpTitle: "",
          ogpDescription: "",
          metaDescription: "",
          metaKeywords: "",
          gallery: [],
        },
  });

  // タブごとのエラー数（バッジ表示用）
  const tabErrorCount: Record<EventEditTabValue, number> = {
    basic: [fields.title, fields.slug, fields.slots].filter((f) =>
      fieldHasErrors(f.errors),
    ).length,
    publish: [
      fields.descriptionJson,
      fields.thumbnailUrl,
      fields.gallery,
      fields.registrationDeadline,
      fields.status,
      fields.registrationOpen,
    ].filter((f) => fieldHasErrors(f.errors)).length,
    tickets: [fields.tickets].filter((f) => fieldHasErrors(f.errors)).length,
    location: [fields.locationId, fields.spaceId, fields.addressDetail].filter(
      (f) => fieldHasErrors(f.errors),
    ).length,
    seo: [
      fields.ogpTitle,
      fields.ogpDescription,
      fields.ogpImageUrl,
      fields.metaDescription,
      fields.metaKeywords,
    ].filter((f) => fieldHasErrors(f.errors)).length,
  };

  const onTabChange = (value: string) => {
    if (isEventEditTabValue(value)) {
      void setActiveSection(value);
    }
  };

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
        name={fields.slots.name}
        value={JSON.stringify(slots)}
      />
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

      <Tabs
        value={activeSection}
        onValueChange={onTabChange}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap gap-1">
          {EVENT_EDIT_TAB_VALUES.map((tab) => {
            const errorCount = tabErrorCount[tab];
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                className="flex items-center gap-1.5"
              >
                {EVENT_EDIT_TAB_LABELS[tab]}
                {errorCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                    {errorCount}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ============ 基本情報 (title/slug + 日時/定員) ============ */}
        <TabsContent
          value="basic"
          forceMount
          className="space-y-6 data-[state=inactive]:hidden"
        >
          <EventBasicFields fields={fields} isPending={isPending} />
          <EventScheduleFields
            slots={slots}
            onChange={setSlots}
            errors={fields.slots.errors ?? undefined}
            isPending={isPending}
          />
        </TabsContent>

        {/* ============ 本文・公開 ============ */}
        <TabsContent
          value="publish"
          forceMount
          className="data-[state=inactive]:hidden"
        >
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
          <div className="space-y-2 border-t pt-4 mt-6">
            <Label>イベントギャラリー (最大 20 件)</Label>
            <p className="text-xs text-muted-foreground">
              本文内のギャラリーブロックとは別の、イベント最上位の画像一覧です。最初の数枚は一覧カードのカルーセルに表示されます。
            </p>
            <GalleryField
              field={fields.gallery}
              form={form}
              defaultUsage="EVENT"
              max={20}
              disabled={isPending}
            />
          </div>
        </TabsContent>

        {/* ============ 参加費・定員 ============ */}
        <TabsContent
          value="tickets"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <TicketsField
            tickets={tickets}
            onChange={setTickets}
            errors={fields.tickets.errors ?? undefined}
            isPending={isPending}
          />
        </TabsContent>

        {/* ============ 会場 ============ */}
        <TabsContent
          value="location"
          forceMount
          className="data-[state=inactive]:hidden"
        >
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
                if (
                  !currentSpace ||
                  currentSpace.locationId !== nextLocationId
                ) {
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
        </TabsContent>

        {/* ============ SEO ============ */}
        <TabsContent
          value="seo"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <EventSeoFields
            fields={{
              ogpImageUrl: fields.ogpImageUrl,
              ogpTitle: fields.ogpTitle,
              ogpDescription: fields.ogpDescription,
              metaDescription: fields.metaDescription,
              metaKeywords: fields.metaKeywords,
            }}
            isPending={isPending}
            ogpImageUrl={ogpImageUrl}
            onOgpImageUrlChange={setOgpImageUrl}
            defaults={{
              ogpTitle: event?.ogpTitle ?? "",
              ogpDescription: event?.ogpDescription ?? "",
              metaDescription: event?.metaDescription ?? "",
              metaKeywords: event?.metaKeywords ?? "",
            }}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-4">
        <Button variant="outline" asChild>
          <Link href="/admin/events">キャンセル</Link>
        </Button>
        <SubmitButton isPending={isPending} label={isEdit ? "更新" : "作成"} />
      </div>
    </form>
  );
}
