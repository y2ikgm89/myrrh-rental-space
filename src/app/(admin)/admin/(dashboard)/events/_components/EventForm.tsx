"use client";

import type { ReactElement } from "react";
import { useActionState, useState } from "react";
import Link from "next/link";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  Button,
  SubmitButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { createEventAction, updateEventAction } from "@/admin/actions/event";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";
import { asTypedField } from "@/shared/lib/conform/typed-input-control";
import type {
  getEventById,
  getLocationsForEvent,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";
import { EventBasicFields } from "./EventBasicFields";
import { EventScheduleFields } from "./EventScheduleFields";
import { EventLocationSpaceSelector } from "./EventLocationSpaceSelector";
import { EventPublishFields } from "./EventPublishFields";
import { EventSeoFields } from "./EventSeoFields";
import { eventFormSchema } from "./event-form-schema";
import { TicketsField } from "./TicketsField";
import { RelatedPostsField, type RelatedPostOption } from "./RelatedPostsField";
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
  /** 関連記事 selector の初期 option 集合 (parent SC で fetch)。 */
  relatedPostOptions: readonly RelatedPostOption[];
};

const EVENT_EDIT_TAB_VALUES = [
  "basic",
  "publish",
  "tickets",
  "location",
  "related",
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
  related: "関連記事",
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
  relatedPostOptions,
}: EventFormProps): ReactElement {
  const isEdit = Boolean(event);

  // タブ state（イベント管理ハブの `tab` と衝突しないよう `section` を使用）
  const [activeSection, setActiveSection] = useQueryState(
    "section",
    parseAsStringLiteral(EVENT_EDIT_TAB_VALUES)
      .withDefault("basic")
      .withOptions({ history: "push", shallow: true }),
  );

  // Controlled state（hidden input 経由で送信）
  const [contentJson, setContentJson] = useState<string>(() =>
    serializeDescriptionJson(event?.descriptionJson),
  );
  // 派生計算: React Compiler が自動メモ化（flushSync / useMemo 不要、Task 8.3 canonical）
  const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);

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
  const [relatedPostIds, setRelatedPostIds] = useState<string[]>(
    () => event?.relatedPosts.map((r) => r.postId) ?? [],
  );

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
          ogpTitle: event.ogpTitle ?? "",
          ogpDescription: event.ogpDescription ?? "",
          metaDescription: event.metaDescription ?? "",
          metaKeywords: event.metaKeywords ?? "",
        }
      : {
          title: "",
          slug: "",
          startTime: "",
          endTime: "",
          registrationDeadline: "",
          capacity: "",
          addressDetail: "",
          ogpTitle: "",
          ogpDescription: "",
          metaDescription: "",
          metaKeywords: "",
        },
  });

  // タブごとのエラー数（バッジ表示用）
  const tabErrorCount: Record<EventEditTabValue, number> = {
    basic: [
      fields.title,
      fields.slug,
      fields.startTime,
      fields.endTime,
      fields.capacity,
    ].filter((f) => fieldHasErrors(f.errors)).length,
    publish: [
      fields.descriptionJson,
      fields.thumbnailUrl,
      fields.registrationDeadline,
      fields.status,
      fields.registrationOpen,
    ].filter((f) => fieldHasErrors(f.errors)).length,
    tickets: [fields.tickets].filter((f) => fieldHasErrors(f.errors)).length,
    location: [fields.locationId, fields.spaceId, fields.addressDetail].filter(
      (f) => fieldHasErrors(f.errors),
    ).length,
    related: [fields.relatedPostIds].filter((f) => fieldHasErrors(f.errors))
      .length,
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
      {/* 関連記事 Post.id は順序 string[]、getAll() で配列復元 */}
      {relatedPostIds.length === 0 && (
        <input type="hidden" name={fields.relatedPostIds.name} value="" />
      )}
      {relatedPostIds.map((postId) => (
        <input
          key={postId}
          type="hidden"
          name={fields.relatedPostIds.name}
          value={postId}
        />
      ))}

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
          <EventScheduleFields fields={fields} isPending={isPending} />
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

        {/* ============ 関連記事 ============ */}
        <TabsContent
          value="related"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <RelatedPostsField
            selectedIds={relatedPostIds}
            initialOptions={relatedPostOptions}
            onChange={setRelatedPostIds}
            isPending={isPending}
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
              ogpImageUrl: asTypedField<string | null | undefined>(
                fields.ogpImageUrl,
              ),
              ogpTitle: asTypedField<string | null | undefined>(
                fields.ogpTitle,
              ),
              ogpDescription: asTypedField<string | null | undefined>(
                fields.ogpDescription,
              ),
              metaDescription: asTypedField<string | null | undefined>(
                fields.metaDescription,
              ),
              metaKeywords: asTypedField<string | null | undefined>(
                fields.metaKeywords,
              ),
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
