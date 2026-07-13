import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue, parsePrismaInputJson } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildTextOrderSqlFragments,
} from "@/shared/domain/order-sql";
import {
  sendEventCancelledToAllParticipants,
  sendEventUpdatedToAllParticipants,
} from "@/shared/lib/email/event-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { serverEnv } from "@/shared/lib/env/server";
import { generateSlug } from "@/shared/lib/slug";
import { isAllowedManagedImageSrc } from "@/shared/lib/media/next-image-src";
import { assertAllowedManagedImageSourcesInJson } from "@/shared/domain/media/managed-image-assertions";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import {
  EventScheduleMode,
  EventStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  gallerySchema,
  type GalleryItem,
} from "@/shared/lib/validations/gallery";
import type {
  EventTicketInput,
  EventTicketWritableFields,
} from "./ticket-types";
import type { SlotInput } from "./slot-commands";
import { syncEventTimeSlotsCommand } from "./slot-commands";
import { lockSpaceForTransaction } from "@/shared/domain/reservations/space-locks";
import {
  checkSpaceOverlap,
  isActiveEventStatus,
} from "@/shared/domain/spaces/overlap";

/**
 * Domain レイヤーの Event 書き込み入力型。
 * Server Action 側で `buildEventCommandInput` が `EventFormInput`（Lexical JSON string）
 * から 3 値（descriptionJson / descriptionHtml / descriptionPlainText）を生成して渡す。
 *
 * Space の `SpaceCommandInput` と同じ分離パターン。
 * startTime / endTime / capacity はスロット（EventTimeSlot）で管理するため廃止。
 */
export interface EventCommandInput {
  title: string;
  slug: string;
  descriptionJson: Prisma.InputJsonValue;
  descriptionHtml: string;
  descriptionPlainText: string;
  thumbnailUrl?: string | null;
  readonly gallery: readonly GalleryItem[];
  ogpImageUrl?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  /** 申込締切日時（null = 最初のスロット開始時刻まで受付）。スロット startAt 以前必須。 */
  registrationDeadline?: string | null;
  addressDetail?: string | null;
  locationId?: string | null;
  spaceId?: string | null;
  status: (typeof EventStatus)[keyof typeof EventStatus];
  scheduleMode: (typeof EventScheduleMode)[keyof typeof EventScheduleMode];
  registrationOpen?: boolean;
  tickets?: readonly EventTicketInput[];
  slots: readonly SlotInput[];
}

export type { SlotInput };

/**
 * status と registrationOpen の不変条件を server-side で強制。
 *
 * `status !== PUBLISHED` のとき申込を受け付ける状態は論理矛盾のため、
 * UI の戻り値を信用せず必ず正規化する（多重防御）。
 */
function normalizeRegistrationOpen(
  status: EventCommandInput["status"],
  registrationOpen: boolean | undefined,
): boolean {
  if (status !== EventStatus.PUBLISHED) return false;
  return registrationOpen ?? true;
}

/**
 * EventTicket の create / update に共通する書き込みフィールドを抽出する。
 * `id` を除いた永続フィールドのみを返す（`eventId` は create 時に呼び出し側で付与）。
 */
function buildTicketWriteData(
  ticket: EventTicketInput,
  sortOrder: number,
): EventTicketWritableFields {
  return {
    name: ticket.name,
    description: ticket.description,
    price: ticket.price,
    capacity: ticket.capacity,
    unitSize: ticket.unitSize,
    sortOrder,
    isAvailable: ticket.isAvailable,
  };
}

/**
 * registrationDeadline 文字列を Date に変換する。
 * 空文字 / undefined / null → null。
 */
function parseOptionalDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assertEventScheduleInvariant(data: EventCommandInput): void {
  if (
    data.scheduleMode === EventScheduleMode.SINGLE_OCCURRENCE &&
    data.slots.length !== 1
  ) {
    throw new DomainError(
      "単一開催ではスロットを1件だけ登録してください",
      "VALIDATION",
    );
  }

  if (
    data.scheduleMode === EventScheduleMode.TIMED_ENTRY &&
    data.slots.length < 2
  ) {
    throw new DomainError(
      "日時選択制ではスロットを2件以上登録してください",
      "VALIDATION",
    );
  }
}

function assertAllowedEventImageUrl(label: string, url: string | null): void {
  if (url === null) return;
  if (
    isAllowedManagedImageSrc(url, {
      publicMediaUrl: serverEnv.R2_PUBLIC_URL ?? null,
    })
  ) {
    return;
  }

  throw new DomainError(
    `${label}は管理画面からアップロードした画像を指定してください`,
    "VALIDATION",
  );
}

function assertAllowedEventImageUrls(params: {
  readonly thumbnailUrl?: string | null;
  readonly ogpImageUrl?: string | null;
  readonly gallery: readonly GalleryItem[];
}): void {
  assertAllowedEventImageUrl("メイン画像", params.thumbnailUrl ?? null);
  assertAllowedEventImageUrl("OGP画像", params.ogpImageUrl ?? null);

  for (const item of params.gallery) {
    assertAllowedEventImageUrl("イベントギャラリー画像", item.url);
  }
}

export async function createEventCommand(data: EventCommandInput) {
  assertEventScheduleInvariant(data);
  assertAllowedEventImageUrls(data);
  assertAllowedManagedImageSourcesInJson(
    "イベント本文画像",
    data.descriptionJson,
  );
  const slug = await ensureUniqueSlug(data.slug);

  const event = await prisma.$transaction(async (tx) => {
    // Space ↔ Reservation cross-table overlap check (Priority-10 audit #4)。
    // Event が spaceId を持つ場合、advisory lock で Space スケジュール空間を直列化して
    // 各スロットが Reservation / 他 Event と重複しないことを確認する。
    // Codex P2 #1019 (comment 3566931086): CANCELLED / ARCHIVED は Space を占有しない
    // ため検査を skip (DB CONSTRAINT TRIGGER も同じ status で短絡: migration 20260713044626)。
    if (data.spaceId && isActiveEventStatus(data.status)) {
      await lockSpaceForTransaction(tx, data.spaceId);
      for (const slot of data.slots) {
        const overlap = await checkSpaceOverlap(
          {
            spaceId: data.spaceId,
            startTime: slot.startAt,
            endTime: slot.endAt,
          },
          tx,
        );
        if (overlap.hasOverlap) {
          throw new DomainError(
            overlap.type === "reservation"
              ? "選択された時間帯は既に予約されています。別の時間帯をお選びください。"
              : "選択された時間帯は既に他のイベントで予約されています。別の時間帯をお選びください。",
            "CONFLICT",
          );
        }
      }
    }

    const created = await tx.event.create({
      data: {
        title: data.title,
        slug,
        descriptionJson: data.descriptionJson,
        descriptionHtml: data.descriptionHtml,
        descriptionPlainText: data.descriptionPlainText,
        thumbnailUrl: data.thumbnailUrl ?? null,
        gallery: asPrismaInputJsonValue(data.gallery, "gallery が不正です"),
        ogpImageUrl: data.ogpImageUrl ?? null,
        ogpTitle: data.ogpTitle ?? null,
        ogpDescription: data.ogpDescription ?? null,
        metaDescription: data.metaDescription ?? null,
        metaKeywords: data.metaKeywords ?? null,
        registrationDeadline: parseOptionalDeadline(data.registrationDeadline),
        addressDetail: data.addressDetail ?? null,
        locationId: data.locationId ?? null,
        spaceId: data.spaceId ?? null,
        status: data.status,
        scheduleMode: data.scheduleMode,
        registrationOpen: normalizeRegistrationOpen(
          data.status,
          data.registrationOpen,
        ),
        publishedAt: data.status === EventStatus.PUBLISHED ? new Date() : null,
      },
      select: { id: true, slug: true },
    });

    // スロット同期
    await syncEventTimeSlotsCommand(tx, created.id, data.slots);

    if (data.tickets && data.tickets.length > 0) {
      await tx.eventTicket.createMany({
        data: data.tickets.map((ticket, index) => ({
          eventId: created.id,
          ...buildTicketWriteData(ticket, index),
        })),
      });
    }

    return created;
  });

  return event;
}

export async function updateEventCommand(id: string, data: EventCommandInput) {
  assertEventScheduleInvariant(data);
  assertAllowedEventImageUrls(data);
  assertAllowedManagedImageSourcesInJson(
    "イベント本文画像",
    data.descriptionJson,
  );
  const existing = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      slug: true,
      status: true,
      slots: {
        select: { id: true, startAt: true, endAt: true, capacity: true },
        orderBy: { startAt: "asc" as const },
      },
      locationId: true,
      spaceId: true,
      addressDetail: true,
    },
  });
  if (!existing) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  const slug =
    data.slug !== existing.slug
      ? await ensureUniqueSlug(data.slug, id)
      : data.slug;

  const wasPublished =
    existing.status !== EventStatus.PUBLISHED &&
    data.status === EventStatus.PUBLISHED;

  await prisma.$transaction(async (tx) => {
    // Space ↔ Reservation cross-table overlap check (Priority-10 audit #4)。
    // spaceId が指定されていれば advisory lock で Space スケジュール空間を直列化し、
    // 各スロットが Reservation / 他 Event と重複しないことを確認する。
    // excludeEventId で自イベントの既存スロットは除外 (slot 差分同期の前提)。
    // Codex P2 #1019 (comment 3566931086): CANCELLED / ARCHIVED は Space を占有しない
    // ため検査を skip (DB CONSTRAINT TRIGGER も同じ status で短絡: migration 20260713044626)。
    // これにより「PUBLISHED → CANCELLED を保存したいがレガシー重複データが
    // 存在するため CONFLICT で拒否される」正当遷移の誤 block を防ぐ。
    if (data.spaceId && isActiveEventStatus(data.status)) {
      await lockSpaceForTransaction(tx, data.spaceId);
      for (const slot of data.slots) {
        const overlap = await checkSpaceOverlap(
          {
            spaceId: data.spaceId,
            startTime: slot.startAt,
            endTime: slot.endAt,
            excludeEventId: id,
          },
          tx,
        );
        if (overlap.hasOverlap) {
          throw new DomainError(
            overlap.type === "reservation"
              ? "選択された時間帯は既に予約されています。別の時間帯をお選びください。"
              : "選択された時間帯は既に他のイベントで予約されています。別の時間帯をお選びください。",
            "CONFLICT",
          );
        }
      }
    }

    await tx.event.update({
      where: { id, deletedAt: null },
      data: {
        title: data.title,
        slug,
        descriptionJson: data.descriptionJson,
        descriptionHtml: data.descriptionHtml,
        descriptionPlainText: data.descriptionPlainText,
        thumbnailUrl: data.thumbnailUrl ?? null,
        gallery: asPrismaInputJsonValue(data.gallery, "gallery が不正です"),
        ogpImageUrl: data.ogpImageUrl ?? null,
        ogpTitle: data.ogpTitle ?? null,
        ogpDescription: data.ogpDescription ?? null,
        metaDescription: data.metaDescription ?? null,
        metaKeywords: data.metaKeywords ?? null,
        registrationDeadline: parseOptionalDeadline(data.registrationDeadline),
        addressDetail: data.addressDetail ?? null,
        locationId: data.locationId ?? null,
        spaceId: data.spaceId ?? null,
        status: data.status,
        scheduleMode: data.scheduleMode,
        registrationOpen: normalizeRegistrationOpen(
          data.status,
          data.registrationOpen,
        ),
        ...(wasPublished && { publishedAt: new Date() }),
      },
    });

    // スロット差分同期
    await syncEventTimeSlotsCommand(tx, id, data.slots);

    if (data.tickets !== undefined) {
      await tx.$executeRaw(buildOrderScopeLockSql(`event_tickets:${id}`));

      const incoming = data.tickets;
      const incomingExistingTickets = incoming.filter(
        (ticket): ticket is EventTicketInput & { id: string } =>
          typeof ticket.id === "string",
      );
      const incomingIds = new Set(incomingExistingTickets.map((t) => t.id));
      if (incomingIds.size !== incomingExistingTickets.length) {
        throw new DomainError(
          "同じチケットIDを複数指定することはできません",
          "VALIDATION",
        );
      }

      const existingTickets = await tx.eventTicket.findMany({
        where: { eventId: id },
        select: { id: true },
      });
      const existingTicketIds = new Set(
        existingTickets.map((ticket) => ticket.id),
      );

      for (const ticketId of incomingIds) {
        if (!existingTicketIds.has(ticketId)) {
          throw new DomainError("チケットが見つかりません", "NOT_FOUND");
        }
      }

      const toDelete = existingTickets
        .map((e) => e.id)
        .filter((existingId) => !incomingIds.has(existingId));
      if (toDelete.length > 0) {
        await tx.eventTicket.deleteMany({ where: { id: { in: toDelete } } });
      }

      if (incomingExistingTickets.length > 0) {
        const { ids, tempCases } = buildTextOrderSqlFragments(
          incomingExistingTickets,
          (ticket) => ticket.id,
          (_ticket, index) => index,
        );
        await tx.$executeRaw`
          UPDATE "event_tickets"
          SET "sortOrder" = CASE "id" ${Prisma.join(tempCases, " ")} END
          WHERE "id" IN (${Prisma.join(ids)})
            AND "eventId" = ${id}
        `;
      }

      const toCreate: Prisma.EventTicketCreateManyInput[] = [];
      for (let index = 0; index < incoming.length; index += 1) {
        const ticket = incoming[index];
        if (!ticket) continue;
        if (ticket.id) {
          await tx.eventTicket.update({
            where: { id: ticket.id },
            data: buildTicketWriteData(ticket, index),
          });
        } else {
          toCreate.push({
            eventId: id,
            ...buildTicketWriteData(ticket, index),
          });
        }
      }
      if (toCreate.length > 0) {
        await tx.eventTicket.createMany({ data: toCreate });
      }
    }
  });

  const venueChanged =
    (existing.locationId ?? null) !== (data.locationId ?? null) ||
    (existing.spaceId ?? null) !== (data.spaceId ?? null) ||
    (existing.addressDetail ?? "") !== (data.addressDetail ?? "");

  // 新規スロット追加だけでなく、既存スロット（id あり）の startAt/endAt/capacity
  // 変更も検知する。id なしで参照される既存スロットは想定外だが安全側で変更扱いにする。
  const existingSlotMap = new Map(
    existing.slots.map((slot) => [slot.id, slot]),
  );
  const slotChanged = data.slots.some((slot) => {
    if (!slot.id) return true;
    const prev = existingSlotMap.get(slot.id);
    if (!prev) return true;
    return (
      prev.startAt.getTime() !== slot.startAt.getTime() ||
      prev.endAt.getTime() !== slot.endAt.getTime() ||
      prev.capacity !== slot.capacity
    );
  });

  // スロット変更は sendEventUpdatedToAllParticipants で通知。
  // 参加者ごとに「自分が申し込んだスロットの変更前日時」を正しく表示できるよう、
  // 全スロットの変更前 startAt を id 付きで渡す（単一の代表値を全員に使い回さない）。
  if ((slotChanged || venueChanged) && data.status === EventStatus.PUBLISHED) {
    const oldSlotStartTimes = new Map(
      existing.slots.map((slot) => [slot.id, slot.startAt]),
    );
    fireAndForget(sendEventUpdatedToAllParticipants(id, oldSlotStartTimes), {
      operation: "sendEventUpdatedToAllParticipants",
      category: ErrorCategory.EXTERNAL_API,
    });
  }
}

export async function deleteEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export async function publishEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, status: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
  if (!event.title) throw new DomainError("タイトルが必要です", "VALIDATION");

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: { status: EventStatus.PUBLISHED, publishedAt: new Date() },
  });
}

export async function cancelEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: { status: EventStatus.CANCELLED },
  });

  fireAndForget(sendEventCancelledToAllParticipants(id), {
    operation: "sendEventCancelledToAllParticipants",
    category: ErrorCategory.EXTERNAL_API,
  });
}

/**
 * イベントをアーカイブ（terminal 状態）にする。
 *
 * `EVENT_STATUS_TRANSITIONS` 上 ARCHIVED は terminal で全状態から遷移可能。
 * 公開ページ・カレンダーから除外する（cancelEvent と同様に GCal 削除を呼ぶ）。
 */
export async function archiveEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: { status: EventStatus.ARCHIVED },
  });
}

/**
 * 既存イベントを複製して新規 DRAFT イベントを作成する。
 *
 * - 本文・サムネイル・日時・会場・定員・料金は全てコピー
 * - status は強制的に `DRAFT`、`publishedAt` / `googleCalendarEventId` は `null`
 * - 申込（EventRegistration）は複製しない
 * - slug は `${original.slug}-copy` をベースに `ensureUniqueSlug` で衝突回避
 * - title は `${original.title}（コピー）` の慣例に従う
 */
export async function duplicateEventCommand(id: string) {
  const source = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: {
      title: true,
      slug: true,
      descriptionJson: true,
      descriptionHtml: true,
      descriptionPlainText: true,
      thumbnailUrl: true,
      gallery: true,
      ogpImageUrl: true,
      ogpTitle: true,
      ogpDescription: true,
      metaDescription: true,
      metaKeywords: true,
      registrationDeadline: true,
      scheduleMode: true,
      addressDetail: true,
      locationId: true,
      spaceId: true,
      registrationOpen: true,
      slots: {
        select: { startAt: true, endAt: true, capacity: true },
        orderBy: { startAt: "asc" },
      },
      tickets: {
        select: {
          name: true,
          description: true,
          price: true,
          capacity: true,
          unitSize: true,
          sortOrder: true,
          isAvailable: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!source) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  const slug = await ensureUniqueSlug(`${source.slug}-copy`);
  const sourceGalleryResult = gallerySchema.safeParse(source.gallery);
  if (!sourceGalleryResult.success) {
    throw new DomainError("イベントギャラリーが不正です", "VALIDATION");
  }
  const sourceGallery = sourceGalleryResult.data;
  assertAllowedEventImageUrls({
    thumbnailUrl: source.thumbnailUrl,
    gallery: sourceGallery,
    ogpImageUrl: source.ogpImageUrl,
  });
  assertAllowedManagedImageSourcesInJson(
    "イベント本文画像",
    source.descriptionJson,
  );

  const created = await prisma.$transaction(async (tx) => {
    const newEvent = await tx.event.create({
      data: {
        title: `${source.title}（コピー）`,
        slug,
        descriptionJson: asPrismaInputJsonValue(
          source.descriptionJson,
          "descriptionJson が不正です",
        ),
        descriptionHtml: source.descriptionHtml,
        descriptionPlainText: source.descriptionPlainText,
        thumbnailUrl: source.thumbnailUrl,
        gallery: asPrismaInputJsonValue(sourceGallery, "gallery が不正です"),
        ogpImageUrl: source.ogpImageUrl,
        ogpTitle: source.ogpTitle,
        ogpDescription: source.ogpDescription,
        metaDescription: source.metaDescription,
        metaKeywords: source.metaKeywords,
        registrationDeadline: source.registrationDeadline,
        addressDetail: source.addressDetail,
        locationId: source.locationId,
        spaceId: source.spaceId,
        status: EventStatus.DRAFT,
        scheduleMode: source.scheduleMode,
        registrationOpen: false,
        publishedAt: null,
      },
      select: { id: true, slug: true },
    });

    // スロットをコピー（id なし = 新規作成）
    if (source.slots.length > 0) {
      await syncEventTimeSlotsCommand(tx, newEvent.id, source.slots);
    }

    if (source.tickets.length > 0) {
      await tx.eventTicket.createMany({
        data: source.tickets.map((ticket, index) => ({
          eventId: newEvent.id,
          name: ticket.name,
          description: ticket.description,
          price: ticket.price,
          capacity: ticket.capacity,
          unitSize: ticket.unitSize,
          sortOrder: index,
          isAvailable: ticket.isAvailable,
        })),
      });
    }

    return newEvent;
  });

  return created;
}

export async function upsertEventFromCalendar(data: {
  googleCalendarEventId: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  /** Google Calendar の location 文字列。外部会場名として addressDetail に格納 */
  location?: string | null;
}) {
  const plain = (data.description ?? "").trim();
  const descriptionJson = parsePrismaInputJson(
    buildParagraphEditorStateJson(plain),
    "descriptionJson が不正です",
  );
  const descriptionHtml = buildParagraphHtml(plain);
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);

  const existingSlot = await prisma.eventTimeSlot.findFirst({
    where: { googleCalendarEventId: data.googleCalendarEventId },
    select: { id: true, eventId: true },
  });

  if (existingSlot) {
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: existingSlot.eventId, deletedAt: null },
        data: {
          title: data.title,
          descriptionJson,
          descriptionHtml,
          descriptionPlainText,
          addressDetail: data.location ?? null,
        },
      });
      await tx.eventTimeSlot.update({
        where: { id: existingSlot.id },
        data: {
          startAt: data.startTime,
          endAt: data.endTime,
        },
      });
      // firstSlotStartAt / lastSlotEndAt 非正規化列を MIN/MAX 集約で再計算
      const aggregate = await tx.eventTimeSlot.aggregate({
        where: { eventId: existingSlot.eventId },
        _min: { startAt: true },
        _max: { endAt: true },
      });
      await tx.event.update({
        where: { id: existingSlot.eventId },
        data: {
          firstSlotStartAt: aggregate._min.startAt ?? null,
          lastSlotEndAt: aggregate._max.endAt ?? null,
        },
      });
    });
    return { id: existingSlot.eventId, action: "updated" as const };
  }

  const slug = await ensureUniqueSlug(generateSlug(data.title, "event"));
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: data.title,
        slug,
        descriptionJson,
        descriptionHtml,
        descriptionPlainText,
        addressDetail: data.location ?? null,
        status: EventStatus.DRAFT,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        firstSlotStartAt: data.startTime,
        lastSlotEndAt: data.endTime,
      },
      select: { id: true },
    });
    await tx.eventTimeSlot.create({
      data: {
        eventId: created.id,
        startAt: data.startTime,
        endAt: data.endTime,
        capacity: 1,
        googleCalendarEventId: data.googleCalendarEventId,
      },
    });
    return created;
  });
  return { id: event.id, action: "created" as const };
}

/**
 * `slug` が空いていればそのまま返し、衝突したら `${slug}-2`, `${slug}-3` ...
 * の最小未使用番号を返す（WordPress / Ghost / Notion 互換のインクリメンタル方式）。
 *
 * deterministic な番号付けにより、複製イベントの URL が「（コピー）」「（コピー）-2」
 * のように人間に予測可能な並びになる。
 */
async function ensureUniqueSlug(
  slug: string,
  excludeId?: string,
): Promise<string> {
  const existing = await prisma.event.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (!existing) return slug;

  const siblings = await prisma.event.findMany({
    where: {
      slug: { startsWith: `${slug}-` },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });

  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-(\\d+)$`);
  const used = new Set<number>();
  for (const s of siblings) {
    const match = s.slug.match(pattern);
    if (match?.[1]) used.add(Number(match[1]));
  }

  let n = 2;
  while (used.has(n)) n++;
  return `${slug}-${n}`;
}
