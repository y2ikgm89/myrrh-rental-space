import "server-only";

import { prisma } from "@/shared/db/prisma";
import { parsePrismaInputJson } from "@/shared/db/json";
import { DomainError } from "@/shared/domain/domain-error";
import { generateSlug } from "@/shared/lib/slug";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { ensureUniqueSlug } from "./event-slug";

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
    // 公開済み、またはキャンセル以外の申込があるイベントは inbound で
    // title/description/times/venue を黙って上書きしない（clean-break skip）。
    const existingEvent = await prisma.event.findFirst({
      where: { id: existingSlot.eventId, deletedAt: null },
      select: {
        id: true,
        status: true,
        registrations: {
          where: { status: { not: RegistrationStatus.CANCELLED } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!existingEvent) {
      throw new DomainError("イベントが見つかりません", "NOT_FOUND");
    }
    if (existingEvent.status === EventStatus.PUBLISHED) {
      return {
        id: existingEvent.id,
        action: "skipped" as const,
        reason: "published_event_protected",
      };
    }
    if (existingEvent.registrations.length > 0) {
      return {
        id: existingEvent.id,
        action: "skipped" as const,
        reason: "has_active_registrations",
      };
    }

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
  // Google Calendar 由来のイベントはカテゴリー情報を持たないため、
  // 必須化された categoryId には「未分類」カテゴリーをフォールバックとして
  // 割り当てる（管理者は後でイベント編集画面から変更できる）。「未分類」は
  // `prisma/seed.ts` の `seedEventCategories` が必ず投入する固定名のカテゴリーであり、
  // 任意の isActive カテゴリー（例: sortOrder 最小）を機械的に選ぶより、
  // 「カテゴリー不明」という意味を持つ名前固定の行を明示参照する方が、将来
  // カテゴリーの並び順や追加が変わっても挙動が変わらず安全。「未分類」が
  // 存在しない（削除・改名された）場合は運用上の設定不備として明示的に失敗させる。
  const fallbackCategory = await prisma.eventCategory.findFirst({
    where: { name: "未分類", isActive: true },
    select: { id: true },
  });
  if (!fallbackCategory) {
    throw new DomainError(
      "「未分類」カテゴリーが見つからないため、カレンダー由来イベントを作成できません",
      "VALIDATION",
    );
  }
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: data.title,
        slug,
        descriptionJson,
        descriptionHtml,
        descriptionPlainText,
        addressDetail: data.location ?? null,
        categoryId: fallbackCategory.id,
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
 * Google Calendar 上でカレンダー由来（`upsertEventFromCalendar` が import した）
 * イベントが cancelled になったことを検知した際、対応する Event を CANCELLED に
 * 遷移させる（GCAL-AUDIT-10）。
 *
 * `googleCalendarEventId` を持つ `EventTimeSlot` から親 Event を逆引きする
 * （import 経路は 1 event = 1 slot 固定、`upsertEventFromCalendar` 参照）。
 * 管理者操作 (`cancelEventCommand`) と異なり、GCal 側が既に削除済みのイベントに
 * 対する反映のため、参加者通知・outbound GCal delete は発火しない（source of
 * truth が GCal 側であり、二重送信・無意味な API 呼び出しを避ける）。
 */
export async function cancelImportedEventFromCalendar(
  googleCalendarEventId: string,
): Promise<{ cancelled: boolean }> {
  const slot = await prisma.eventTimeSlot.findFirst({
    where: { googleCalendarEventId },
    select: { eventId: true },
  });
  if (!slot) return { cancelled: false };

  const claim = await prisma.event.updateMany({
    where: {
      id: slot.eventId,
      deletedAt: null,
      status: { not: EventStatus.CANCELLED },
    },
    data: { status: EventStatus.CANCELLED },
  });

  return { cancelled: claim.count > 0 };
}
