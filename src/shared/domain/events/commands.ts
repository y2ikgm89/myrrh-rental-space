import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue, parsePrismaInputJson } from "@/shared/db/json";
import type { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  sendEventCancelledToAllParticipants,
  sendEventUpdatedToAllParticipants,
} from "@/shared/lib/email/event-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { generateSlug } from "@/shared/lib/slug";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import type {
  EventTicketInput,
  EventTicketWritableFields,
} from "./ticket-types";

/**
 * Domain レイヤーの Event 書き込み入力型。
 * Server Action 側で `buildEventCommandInput` が `EventFormInput`（Lexical JSON string）
 * から 3 値（descriptionJson / descriptionHtml / descriptionPlainText）を生成して渡す。
 *
 * Space の `SpaceCommandInput` と同じ分離パターン。
 */
export interface EventCommandInput {
  title: string;
  slug: string;
  descriptionJson: Prisma.InputJsonValue;
  descriptionHtml: string;
  descriptionPlainText: string;
  thumbnailUrl?: string | null;
  ogpImageUrl?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  startTime: string;
  endTime: string;
  /** 申込締切日時（null = 開始時刻まで受付）。startTime 以前である必要あり。 */
  registrationDeadline?: string | null;
  capacity?: number | null;
  addressDetail?: string | null;
  locationId?: string | null;
  spaceId?: string | null;
  status: (typeof EventStatus)[keyof typeof EventStatus];
  registrationOpen?: boolean;
  tickets?: readonly EventTicketInput[];
  /** 関連記事 Post.id の順序付き配列。undefined ならスキップ、[] でクリア。 */
  relatedPostIds?: readonly string[];
  /** 関連外部リンク。undefined ならスキップ、[] でクリア。順序保持。 */
  relatedExternalLinks?: readonly {
    url: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
  }[];
}

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
): EventTicketWritableFields {
  return {
    name: ticket.name,
    description: ticket.description,
    price: ticket.price,
    capacity: ticket.capacity,
    unitSize: ticket.unitSize,
    sortOrder: ticket.sortOrder,
    isAvailable: ticket.isAvailable,
  };
}

export async function createEventCommand(data: EventCommandInput) {
  const slug = await ensureUniqueSlug(data.slug);

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: data.title,
        slug,
        descriptionJson: data.descriptionJson,
        descriptionHtml: data.descriptionHtml,
        descriptionPlainText: data.descriptionPlainText,
        thumbnailUrl: data.thumbnailUrl ?? null,
        ogpImageUrl: data.ogpImageUrl ?? null,
        ogpTitle: data.ogpTitle ?? null,
        ogpDescription: data.ogpDescription ?? null,
        metaDescription: data.metaDescription ?? null,
        metaKeywords: data.metaKeywords ?? null,
        startTime: parseDateTimeLocalAsJst(data.startTime),
        endTime: parseDateTimeLocalAsJst(data.endTime),
        registrationDeadline: data.registrationDeadline
          ? parseDateTimeLocalAsJst(data.registrationDeadline)
          : null,
        capacity: data.capacity ?? null,
        addressDetail: data.addressDetail ?? null,
        locationId: data.locationId ?? null,
        spaceId: data.spaceId ?? null,
        status: data.status,
        registrationOpen: normalizeRegistrationOpen(
          data.status,
          data.registrationOpen,
        ),
        publishedAt: data.status === EventStatus.PUBLISHED ? new Date() : null,
      },
      select: { id: true, slug: true },
    });

    if (data.tickets && data.tickets.length > 0) {
      await tx.eventTicket.createMany({
        data: data.tickets.map((ticket) => ({
          eventId: created.id,
          ...buildTicketWriteData(ticket),
        })),
      });
    }

    if (data.relatedPostIds && data.relatedPostIds.length > 0) {
      await tx.eventRelatedPost.createMany({
        data: data.relatedPostIds.map((postId, index) => ({
          eventId: created.id,
          postId,
          sortOrder: index,
        })),
        skipDuplicates: true,
      });
    }

    if (data.relatedExternalLinks && data.relatedExternalLinks.length > 0) {
      await tx.eventRelatedExternalLink.createMany({
        data: data.relatedExternalLinks.map((link, index) => ({
          eventId: created.id,
          url: link.url,
          title: link.title,
          description: link.description ?? null,
          imageUrl: link.imageUrl ?? null,
          sortOrder: index,
        })),
      });
    }

    return created;
  });

  return event;
}

export async function updateEventCommand(id: string, data: EventCommandInput) {
  const existing = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      slug: true,
      status: true,
      startTime: true,
      endTime: true,
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

  const newStartTime = parseDateTimeLocalAsJst(data.startTime);
  const newEndTime = parseDateTimeLocalAsJst(data.endTime);

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id, deletedAt: null },
      data: {
        title: data.title,
        slug,
        descriptionJson: data.descriptionJson,
        descriptionHtml: data.descriptionHtml,
        descriptionPlainText: data.descriptionPlainText,
        thumbnailUrl: data.thumbnailUrl ?? null,
        ogpImageUrl: data.ogpImageUrl ?? null,
        ogpTitle: data.ogpTitle ?? null,
        ogpDescription: data.ogpDescription ?? null,
        metaDescription: data.metaDescription ?? null,
        metaKeywords: data.metaKeywords ?? null,
        startTime: newStartTime,
        endTime: newEndTime,
        registrationDeadline: data.registrationDeadline
          ? parseDateTimeLocalAsJst(data.registrationDeadline)
          : null,
        capacity: data.capacity ?? null,
        addressDetail: data.addressDetail ?? null,
        locationId: data.locationId ?? null,
        spaceId: data.spaceId ?? null,
        status: data.status,
        registrationOpen: normalizeRegistrationOpen(
          data.status,
          data.registrationOpen,
        ),
        ...(wasPublished && { publishedAt: new Date() }),
      },
    });

    if (data.tickets !== undefined) {
      const incoming = data.tickets;
      const incomingIds = new Set(
        incoming.flatMap((t) => (t.id != null ? [t.id] : [])),
      );

      const existing = await tx.eventTicket.findMany({
        where: { eventId: id },
        select: { id: true },
      });

      const toDelete = existing
        .map((e) => e.id)
        .filter((existingId) => !incomingIds.has(existingId));
      if (toDelete.length > 0) {
        await tx.eventTicket.deleteMany({ where: { id: { in: toDelete } } });
      }

      const toCreate: Prisma.EventTicketCreateManyInput[] = [];
      for (const ticket of incoming) {
        if (ticket.id) {
          await tx.eventTicket.update({
            where: { id: ticket.id },
            data: buildTicketWriteData(ticket),
          });
        } else {
          toCreate.push({
            eventId: id,
            ...buildTicketWriteData(ticket),
          });
        }
      }
      if (toCreate.length > 0) {
        await tx.eventTicket.createMany({ data: toCreate });
      }
    }

    if (data.relatedPostIds !== undefined) {
      await tx.eventRelatedPost.deleteMany({ where: { eventId: id } });
      if (data.relatedPostIds.length > 0) {
        await tx.eventRelatedPost.createMany({
          data: data.relatedPostIds.map((postId, index) => ({
            eventId: id,
            postId,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (data.relatedExternalLinks !== undefined) {
      await tx.eventRelatedExternalLink.deleteMany({ where: { eventId: id } });
      if (data.relatedExternalLinks.length > 0) {
        await tx.eventRelatedExternalLink.createMany({
          data: data.relatedExternalLinks.map((link, index) => ({
            eventId: id,
            url: link.url,
            title: link.title,
            description: link.description ?? null,
            imageUrl: link.imageUrl ?? null,
            sortOrder: index,
          })),
        });
      }
    }
  });

  const dateTimeChanged =
    existing.startTime.getTime() !== newStartTime.getTime() ||
    existing.endTime.getTime() !== newEndTime.getTime();
  const venueChanged =
    (existing.locationId ?? null) !== (data.locationId ?? null) ||
    (existing.spaceId ?? null) !== (data.spaceId ?? null) ||
    (existing.addressDetail ?? "") !== (data.addressDetail ?? "");

  if (
    (dateTimeChanged || venueChanged) &&
    data.status === EventStatus.PUBLISHED
  ) {
    fireAndForget(sendEventUpdatedToAllParticipants(id, existing.startTime), {
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
      ogpImageUrl: true,
      ogpTitle: true,
      ogpDescription: true,
      metaDescription: true,
      metaKeywords: true,
      startTime: true,
      endTime: true,
      registrationDeadline: true,
      capacity: true,
      addressDetail: true,
      locationId: true,
      spaceId: true,
      registrationOpen: true,
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
        ogpImageUrl: source.ogpImageUrl,
        ogpTitle: source.ogpTitle,
        ogpDescription: source.ogpDescription,
        metaDescription: source.metaDescription,
        metaKeywords: source.metaKeywords,
        startTime: source.startTime,
        endTime: source.endTime,
        registrationDeadline: source.registrationDeadline,
        capacity: source.capacity,
        addressDetail: source.addressDetail,
        locationId: source.locationId,
        spaceId: source.spaceId,
        status: EventStatus.DRAFT,
        // DRAFT 化に伴い受付状態は強制 false（normalizeRegistrationOpen と同等）
        registrationOpen: false,
        publishedAt: null,
        googleCalendarEventId: null,
      },
      select: { id: true, slug: true },
    });

    if (source.tickets.length > 0) {
      await tx.eventTicket.createMany({
        data: source.tickets.map((ticket) => ({
          eventId: newEvent.id,
          name: ticket.name,
          description: ticket.description,
          price: ticket.price,
          capacity: ticket.capacity,
          unitSize: ticket.unitSize,
          sortOrder: ticket.sortOrder,
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

  const existing = await prisma.event.findFirst({
    where: {
      googleCalendarEventId: data.googleCalendarEventId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.event.update({
      where: { id: existing.id, deletedAt: null },
      data: {
        title: data.title,
        descriptionJson,
        descriptionHtml,
        descriptionPlainText,
        startTime: data.startTime,
        endTime: data.endTime,
        addressDetail: data.location ?? null,
      },
    });
    return { id: existing.id, action: "updated" as const };
  }

  const slug = await ensureUniqueSlug(generateSlug(data.title, "event"));
  const event = await prisma.event.create({
    data: {
      title: data.title,
      slug,
      descriptionJson,
      descriptionHtml,
      descriptionPlainText,
      startTime: data.startTime,
      endTime: data.endTime,
      addressDetail: data.location ?? null,
      status: EventStatus.DRAFT,
      googleCalendarEventId: data.googleCalendarEventId,
    },
    select: { id: true },
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
