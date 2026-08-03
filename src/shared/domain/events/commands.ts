import "server-only";

import { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import { RESERVATION_WRITE_TX_OPTIONS } from "@/shared/db/transaction-options";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { sendEventCancelledToAllParticipants } from "@/shared/domain/email/lib-dispatch";
import { getEventCancelledNotificationPayload } from "@/shared/domain/events/email-queries";
import { getEventEmailRenderContext } from "@/shared/domain/settings/queries/email-render-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { serverEnv } from "@/shared/lib/env/server";
import { isAllowedManagedImageSrc } from "@/shared/lib/media/next-image-src";
import { assertAllowedManagedImageSourcesInJson } from "@/shared/domain/media/managed-image-assertions";
import {
  EventFormat,
  EventScheduleMode,
  EventStatus,
  MeetingProvider,
  EVENT_FORMAT_VALUES,
  MEETING_PROVIDER_VALUES,
} from "@/shared/lib/validations/enums/prisma-types";
import { EVENT_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";
import {
  gallerySchema,
  type GalleryItem,
} from "@/shared/lib/validations/gallery";
import type { EventTicketInput } from "./ticket-types";
import type { SlotInput } from "./slot-commands";
import { syncEventTimeSlotsCommand } from "./slot-commands";
import {
  buildTicketWriteData,
  notifyEventVenueOrSlotChanged,
  syncEventSlotsAndTicketsCommand,
} from "./event-slot-sync-commands";
import { ensureUniqueSlug } from "./event-slug";
import { lockSpaceForTransaction } from "@/shared/domain/reservations/space-locks";
import {
  checkSpaceOverlap,
  isActiveEventStatus,
} from "@/shared/domain/spaces/overlap";
import {
  isPrismaExclusionConstraintError,
  isPrismaUniqueConstraintError,
} from "@/shared/lib/prisma-errors";
import { lockEventRegistrationForTransaction } from "./waitlist-locks";

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
  categoryId: string;
  status: (typeof EventStatus)[keyof typeof EventStatus];
  scheduleMode: (typeof EventScheduleMode)[keyof typeof EventScheduleMode];
  registrationOpen?: boolean;
  tickets?: readonly EventTicketInput[];
  slots: readonly SlotInput[];
  /** 開催形態 (Phase B.1)。省略時は OFFLINE として扱われる。 */
  format?: (typeof EventFormat)[keyof typeof EventFormat];
  /**
   * オンライン会議 URL。ONLINE/HYBRID 開催かつ meetingProvider が MANUAL の場合は
   * 必須（`eventInputSchema` が検証）。format が OFFLINE に更新される場合、
   * updateEventCommand が null に明示リセットする。
   */
  meetingUrl?: string | null;
  /** 会議 URL の発行元。省略時は MANUAL として扱われる。 */
  meetingProvider?: (typeof MeetingProvider)[keyof typeof MeetingProvider];
}

export type { SlotInput };

/**
 * format / meetingUrl / meetingProvider の入力検証 (Phase B.1)。
 *
 * イベント入力全体（タイトル・スロット等）は Server Action 層の
 * `eventFormSchema`（event-form-schema.ts）が FormData 由来の transit を検証するため、
 * 本 schema はオンライン開催関連の 3 フィールドのみを対象にした部分スキーマとして
 * 定義する。ONLINE・HYBRID 開催で meetingProvider が MANUAL（手入力）の場合のみ
 * meetingUrl（HTTPS URL・500文字以内）を必須にする。GOOGLE_MEET は GCal API 応答からの
 * write-back 待ちのため、この時点では meetingUrl 未設定を許容する。
 */
export const eventInputSchema = z
  .object({
    format: z.enum(EVENT_FORMAT_VALUES).default(EventFormat.OFFLINE),
    meetingUrl: z
      .url({ error: "有効な会議 URL を入力してください" })
      .startsWith("https://", {
        error: "会議 URL は https:// で始まる必要があります",
      })
      .max(500, { error: "会議 URL は500文字以内で入力してください" })
      .nullable()
      .optional(),
    meetingProvider: z
      .enum(MEETING_PROVIDER_VALUES)
      .default(MeetingProvider.MANUAL),
  })
  .refine(
    (data) => {
      if (data.format === EventFormat.OFFLINE) return true;
      if (data.meetingProvider === MeetingProvider.GOOGLE_MEET) return true;
      return typeof data.meetingUrl === "string" && data.meetingUrl.length > 0;
    },
    {
      error:
        "オンライン開催・ハイブリッド開催で手入力の場合は会議 URL が必須です",
      path: ["meetingUrl"],
    },
  );

export type EventMeetingInput = z.infer<typeof eventInputSchema>;

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
 * registrationDeadline 文字列を Date に変換する。
 * 空文字 / undefined / null → null。
 */
function parseOptionalDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assertEventStatusTransition(
  from: (typeof EventStatus)[keyof typeof EventStatus],
  to: (typeof EventStatus)[keyof typeof EventStatus],
): void {
  if (from === to) return;
  const allowed = EVENT_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new DomainError(
      `イベントのステータスを ${from} から ${to} へ変更することはできません`,
      "VALIDATION",
    );
  }
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

/**
 * scheduleMode と meetingProvider の互換性を強制 (Codex PR #1149 P1 fix)。
 *
 * TIMED_ENTRY (日時選択制) はスロット単位で GCal event が作成され、それぞれ独立した
 * Meet URL が発行される。Event.meetingUrl は単一 field のため、GOOGLE_MEET を選ぶと
 * 最終同期の URL で上書きされ他スロット登録者へ誤 URL が届く。single-URL 前提を
 * 満たせないため、TIMED_ENTRY + GOOGLE_MEET は create/update 双方で禁止する。
 */
function assertOnlineScheduleCompatibility(data: EventCommandInput): void {
  if (
    data.scheduleMode === EventScheduleMode.TIMED_ENTRY &&
    data.meetingProvider === MeetingProvider.GOOGLE_MEET
  ) {
    throw new DomainError(
      "時間枠制 (TIMED_ENTRY) のイベントで Google Meet の自動発行はサポートしていません。会議 URL を手動で入力してください。",
      "VALIDATION",
    );
  }
}

/**
 * format/meetingUrl/meetingProvider の組合せ不変条件を server-side で強制。
 * 検証ロジックは `eventInputSchema`（Zod）に一本化し、失敗時は DomainError に変換する
 * （他の assert* 関数と同じ例外契約に揃える）。
 */
function assertEventMeetingUrlInvariant(data: EventCommandInput): void {
  const result = eventInputSchema.safeParse({
    format: data.format,
    meetingUrl: data.meetingUrl,
    meetingProvider: data.meetingProvider,
  });
  if (!result.success) {
    const message =
      result.error.issues[0]?.message ?? "オンライン開催の入力が不正です";
    throw new DomainError(message, "VALIDATION");
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
  // OFFLINE 開催で meetingUrl/meetingProvider の stale hidden state を持ち込む
  // create 経路 (Codex PR #1149 P2 fix) に対して update と同じ normalization を適用。
  // 「OFFLINE イベントに GOOGLE_MEET が残り Meet URL が誤自動発行される」bug を防ぐ。
  const createResolvedFormat = data.format ?? EventFormat.OFFLINE;
  const isOfflineCreate = createResolvedFormat === EventFormat.OFFLINE;
  const createResolvedMeetingUrl = isOfflineCreate
    ? null
    : (data.meetingUrl ?? null);
  const createResolvedMeetingProvider = isOfflineCreate
    ? MeetingProvider.MANUAL
    : (data.meetingProvider ?? MeetingProvider.MANUAL);
  const normalizedCreateData: EventCommandInput = {
    ...data,
    format: createResolvedFormat,
    meetingUrl: createResolvedMeetingUrl,
    meetingProvider: createResolvedMeetingProvider,
  };
  assertEventMeetingUrlInvariant(normalizedCreateData);
  assertOnlineScheduleCompatibility(normalizedCreateData);
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
        categoryId: data.categoryId,
        status: data.status,
        scheduleMode: data.scheduleMode,
        format: createResolvedFormat,
        meetingUrl: createResolvedMeetingUrl,
        meetingProvider: createResolvedMeetingProvider,
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
  }, RESERVATION_WRITE_TX_OPTIONS);

  return event;
}

export async function updateEventCommand(
  id: string,
  data: EventCommandInput,
): Promise<{ removedGoogleCalendarEventIds: string[] }> {
  assertEventScheduleInvariant(data);

  // format が OFFLINE に変更される場合、meetingUrl/meetingProvider を明示リセットする
  // (validation ではなく domain 側の書込み内容の正規化。UI が消し忘れた残骸を防ぐ)
  // assertEventMeetingUrlInvariant より前に正規化することで、検証対象を
  // OFFLINE リセット後の meetingUrl: null にする。raw data のまま検証すると
  // meetingUrl の shape check（https:// 必須・500文字以内）が format に関わらず
  // 無条件にかかるため、過去 ONLINE 時の不正な stale meetingUrl が残っているだけで
  // OFFLINE 更新が誤って DomainError になってしまう（Task 4 review Important finding）。
  const resolvedFormat = data.format ?? EventFormat.OFFLINE;
  const isOfflineUpdate = resolvedFormat === EventFormat.OFFLINE;
  const resolvedMeetingProvider = isOfflineUpdate
    ? MeetingProvider.MANUAL
    : (data.meetingProvider ?? MeetingProvider.MANUAL);

  const existing = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      slug: true,
      status: true,
      meetingUrl: true,
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

  assertEventStatusTransition(existing.status, data.status);

  // Codex PR #1149 P1 fix: GOOGLE_MEET provider を維持したまま無関係な field を編集すると
  // form が meetingUrl 入力欄を unmount して送らないため `data.meetingUrl` が undefined/empty で
  // 届き、`?? null` で既存 Meet URL を消去してしまう。update sync は Meet 再発行しないため
  // 永続的に URL 消失。GOOGLE_MEET かつ入力欄が空のときは DB 既存値を preserve。
  const inputMeetingUrlEmpty =
    data.meetingUrl == null || data.meetingUrl === "";
  const shouldPreserveExistingMeetUrl =
    !isOfflineUpdate &&
    resolvedMeetingProvider === MeetingProvider.GOOGLE_MEET &&
    inputMeetingUrlEmpty;
  const resolvedMeetingUrl = isOfflineUpdate
    ? null
    : shouldPreserveExistingMeetUrl
      ? existing.meetingUrl
      : (data.meetingUrl ?? null);

  const normalizedUpdateData: EventCommandInput = {
    ...data,
    format: resolvedFormat,
    meetingUrl: resolvedMeetingUrl,
    meetingProvider: resolvedMeetingProvider,
  };
  assertEventMeetingUrlInvariant(normalizedUpdateData);
  assertOnlineScheduleCompatibility(normalizedUpdateData);
  assertAllowedEventImageUrls(data);
  assertAllowedManagedImageSourcesInJson(
    "イベント本文画像",
    data.descriptionJson,
  );

  const slug =
    data.slug !== existing.slug
      ? await ensureUniqueSlug(data.slug, id)
      : data.slug;

  const wasPublished =
    existing.status !== EventStatus.PUBLISHED &&
    data.status === EventStatus.PUBLISHED;

  let removedGoogleCalendarEventIds: string[] = [];

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
        categoryId: data.categoryId,
        status: data.status,
        scheduleMode: data.scheduleMode,
        format: resolvedFormat,
        meetingUrl: resolvedMeetingUrl,
        meetingProvider: resolvedMeetingProvider,
        registrationOpen: normalizeRegistrationOpen(
          data.status,
          data.registrationOpen,
        ),
        ...(wasPublished && { publishedAt: new Date() }),
      },
    });

    // スロット/チケット定員 sync は CONFIRMED 集計と capacity 更新の read-modify-write。
    // 728350 で公開申込 create/cancel/waitlist と直列化しないと TOCTOU overbooking になる。
    await lockEventRegistrationForTransaction(tx, id);

    ({ removedGoogleCalendarEventIds } = await syncEventSlotsAndTicketsCommand(
      tx,
      id,
      data.slots,
      data.tickets,
    ));
  }, RESERVATION_WRITE_TX_OPTIONS);

  notifyEventVenueOrSlotChanged({
    eventId: id,
    status: data.status,
    existing,
    locationId: data.locationId ?? null,
    spaceId: data.spaceId ?? null,
    addressDetail: data.addressDetail ?? null,
    slots: data.slots,
  });

  return { removedGoogleCalendarEventIds };
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

const EVENT_SLUG_RESTORE_CONFLICT_MESSAGE =
  "同じスラッグのイベントが既に存在するため復元できません。先に既存のイベントのスラッグを変更してください";

/**
 * ゴミ箱のイベントを復元する。
 *
 * **復元はスペース占有の再取得**である点に注意。`checkSpaceOverlap` は
 * `event: { deletedAt: null }` で絞っているので、論理削除した時点でそのイベントは
 * スペースを手放している。ゴミ箱にある間に同じ時間帯へ予約や別イベントが入りうるため、
 * 何も確かめずに `deletedAt` を戻すと**二重予約が成立する**。
 *
 * したがって `publishEventCommand`（非占有 status → 占有 status の遷移）と同じ形を採る:
 * advisory lock で Space を直列化し、全スロットの重複を検査してから復元する。
 * status が占有側でない（CANCELLED / ARCHIVED）ときは占有が発生しないので検査を省く。
 */
export async function restoreEventCommand(id: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      status: true,
      spaceId: true,
      deletedAt: true,
      slots: { select: { startAt: true, endAt: true } },
    },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
  // 「削除済みか」はここで判断しない。判断を先読みと claim の 2 か所に置くと、
  // 先読みだけが効いていても検査が緑になり claim の退行に気づけない（purge 側で実際に
  // そうなっていた）。下の updateMany の WHERE 一本に寄せる。

  // slug の一意性は deletedAt: null の行にしか掛かっていない（ゴミ箱は slug を解放する）。
  // ゴミ箱にある間に同じ slug のイベントが作られていれば、復元すると 2 件が同じ URL になる。
  const slugConflict = await prisma.event.findFirst({
    where: { slug: event.slug, deletedAt: null, id: { not: id } },
    select: { id: true },
  });
  if (slugConflict) {
    throw new DomainError(EVENT_SLUG_RESTORE_CONFLICT_MESSAGE, "CONFLICT");
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (event.spaceId && isActiveEventStatus(event.status)) {
        await lockSpaceForTransaction(tx, event.spaceId);
        for (const slot of event.slots) {
          const overlap = await checkSpaceOverlap(
            {
              spaceId: event.spaceId,
              startTime: slot.startAt,
              endTime: slot.endAt,
              excludeEventId: id,
            },
            tx,
          );
          if (overlap.hasOverlap) {
            throw new DomainError(
              overlap.type === "reservation"
                ? "復元先の時間帯は既に予約されています。予約を調整してから復元してください。"
                : "復元先の時間帯は既に他のイベントで使用されています。先に調整してから復元してください。",
              "CONFLICT",
            );
          }
        }
      }

      // 削除済みであることを WHERE に含めて claim する（二重復元・並行操作の防止）。
      const claim = await tx.event.updateMany({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null, deletedById: null },
      });
      if (claim.count === 0) {
        // 戻せなかった理由を、この時点の実際の状態から出す
        const current = await tx.event.findUnique({
          where: { id },
          select: { deletedAt: true },
        });
        if (!current) {
          throw new DomainError("イベントが見つかりません", "NOT_FOUND");
        }
        throw new DomainError("このイベントは削除されていません", "VALIDATION");
      }
    }, RESERVATION_WRITE_TX_OPTIONS);
  } catch (err) {
    if (isPrismaExclusionConstraintError(err)) {
      throw new DomainError(
        "復元先の時間帯は既に予約されています。予約を調整してから復元してください。",
        "CONFLICT",
      );
    }
    if (isPrismaUniqueConstraintError(err, "slug")) {
      throw new DomainError(EVENT_SLUG_RESTORE_CONFLICT_MESSAGE, "CONFLICT");
    }
    throw err;
  }
}

/**
 * ゴミ箱のイベントを完全に削除する。
 *
 * **会計証跡が付いた申込があるイベントは削除しない。** `Receipt` / `Refund` は
 * `EventRegistration` を `onDelete: Restrict` で参照している（領収書・返金記録の
 * ある申込は物理削除できない、という会計証跡保護）。ここで止めないと生の P2003 が
 * そのまま上がる — 実測: 領収書付き申込のあるイベントを消すと
 * `receipts_eventRegistrationId_fkey` 違反になる。
 *
 * 子（slot / ticket / registration）は `onDelete: Cascade` に任せる。当初は
 * 「子どうしが Restrict で結ばれている（`EventRegistration.slotId` / `ticketId`）ので
 * 明示順で消す必要がある」と考えて順序を書いていたが、**実測すると素の
 * `event.delete()` で通る** — 兄弟も同じ DELETE で消えるため Restrict は成立する。
 * 誤った理由で書かれた手順は消した（その挙動はテストで固定している）。
 *
 * **削除は「ゴミ箱に入ったままであること」を条件に実行する。** 先読みと DELETE の
 * 間に復元が挟まると、無条件 delete は復元済みのイベントと復元後に入った申込まで
 * 消してしまう。証跡検査と削除を単一トランザクションに入れ、DELETE の WHERE に
 * `deletedAt IS NOT NULL` を残して claim する。なお証跡検査と DELETE の間に
 * 領収書が発行された場合は FK 側（`receipts_eventRegistrationId_fkey`）が
 * 削除を拒否する — メッセージは素っ気なくなるが、**消えてはいけないものは消えない**。
 */
export async function permanentlyDeleteEventCommand(id: string): Promise<void> {
  // **「ゴミ箱に入っているか」をここでは見ない。** 判断を先読みと DELETE の 2 か所に
  // 置くと、先読みだけが効いていても検査が緑になり、DELETE の WHERE が外れたことに
  // 気づけない（実際にそうなっていた）。判断は下の claim 一本に寄せる。
  const exists = await prisma.event.count({ where: { id } });
  if (exists === 0) {
    throw new DomainError("イベントが見つかりません", "NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    const withEvidence = await tx.eventRegistration.count({
      where: {
        eventId: id,
        OR: [{ receipt: { isNot: null } }, { refunds: { some: {} } }],
      },
    });
    if (withEvidence > 0) {
      throw new DomainError(
        "領収書または返金記録のある申込を含むイベントは完全に削除できません",
        "CONFLICT",
      );
    }

    // `deletedAt IS NOT NULL` を WHERE に残したまま消す。先読みと削除の間に
    // `restoreEventCommand` が復元すると count=0 になり、**復元済みのイベントと
    // 復元後に入った申込を巻き込んで消す**代わりに CONFLICT で止まる。
    // `delete({ where: { id } })` は非一意条件を取れないので deleteMany を使う
    // （cascade は FK 側の動作なのでどちらで DELETE しても同じ）。
    const deleted = await tx.event.deleteMany({
      where: { id, deletedAt: { not: null } },
    });
    if (deleted.count === 0) {
      // 消えなかった理由を、この時点の実際の状態から出す
      const current = await tx.event.findUnique({
        where: { id },
        select: { deletedAt: true },
      });
      if (!current) {
        throw new DomainError("イベントが見つかりません", "NOT_FOUND");
      }
      throw new DomainError(
        "先にゴミ箱へ移動してから完全に削除してください",
        "CONFLICT",
      );
    }
  });
}

export async function publishEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      spaceId: true,
      slots: { select: { startAt: true, endAt: true } },
    },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
  if (!event.title) throw new DomainError("タイトルが必要です", "VALIDATION");

  assertEventStatusTransition(event.status, EventStatus.PUBLISHED);

  try {
    await prisma.$transaction(async (tx) => {
      // publish は非占有 status (CANCELLED/ARCHIVED) から占有 status (PUBLISHED) への
      // 遷移で、既存 slot による Space 占有を再取得する write。updateEventCommand /
      // createEventCommand と同じく advisory lock + overlap 検査を行わないと、
      // 並行する予約 create との間で Space の二重占有が生じうる（DEFERRABLE constraint
      // trigger は COMMIT 時発火のためこの tx 内 catch では捕捉できず、直列化でしか防げない）。
      if (event.spaceId) {
        await lockSpaceForTransaction(tx, event.spaceId);
        for (const slot of event.slots) {
          const overlap = await checkSpaceOverlap(
            {
              spaceId: event.spaceId,
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

      const claim = await tx.event.updateMany({
        where: { id, deletedAt: null, status: event.status },
        data: { status: EventStatus.PUBLISHED, publishedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new DomainError(
          "イベントのステータスが他の操作により変更されています。最新の状態を確認してください",
          "CONFLICT",
        );
      }
    }, RESERVATION_WRITE_TX_OPTIONS);
  } catch (err) {
    // domain 層の checkSpaceOverlap 事前検査をすり抜けた真の race のみ到達する
    // 最終防衛線。Reservation 側 EXCLUDE 制約違反を生の DriverAdapterError の
    // まま投げず、人間可読な CONFLICT に変換する。
    if (isPrismaExclusionConstraintError(err)) {
      throw new DomainError(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
        "CONFLICT",
      );
    }
    throw err;
  }
}

/**
 * イベントをキャンセル状態に遷移させる。
 *
 * Round-4 audit Finding #4 / high: 旧実装は findFirst + prisma.event.update
 * を分離しており、2 admin が同じイベントを同時にキャンセルした際に status
 * ガードなしで両方が update に到達 → 両方が
 * sendEventCancelledToAllParticipants を発火し、参加者に「本イベントは
 * キャンセルされました」メールが 2 通届き、後続の deleteGcalEvent も
 * 2 回叩かれていた。
 *
 * 現在の実装は updateMany({ where: { id, deletedAt: null, status: {
 * not: CANCELLED } }, data: ... }) の atomic claim を使い、count > 0 の
 * 「実際に遷移した」呼出しでのみ email/GCal を発火する。CANCELLED でも
 * NOT_FOUND を throw して呼び出し側 (executeAdminMutationResult) が
 * MutationError にする。findFirst の select { status: true } はもう不要。
 */
export async function cancelEventCommand(id: string) {
  const claim = await prisma.event.updateMany({
    where: {
      id,
      deletedAt: null,
      status: { not: EventStatus.CANCELLED },
    },
    data: { status: EventStatus.CANCELLED },
  });

  if (claim.count === 0) {
    const exists = await prisma.event.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!exists) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
    // 別 admin が既に CANCELLED にした → 冪等 no-op (2 通目のメール発火を防ぐ)。
    return;
  }

  fireAndForget(
    (async () => {
      const [payload, renderContext] = await Promise.all([
        getEventCancelledNotificationPayload(id),
        getEventEmailRenderContext(),
      ]);
      if (payload) {
        await sendEventCancelledToAllParticipants(payload, renderContext);
      }
    })(),
    {
      operation: "sendEventCancelledToAllParticipants",
      category: ErrorCategory.EXTERNAL_API,
    },
  );
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
      categoryId: true,
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
    // Space ↔ Reservation cross-table overlap check (createEventCommand と同型)。
    // 複製先は常に source と同一 spaceId・同一時間枠の DRAFT (占有ステータス) になる。
    // excludeEventId は使わない — 複製元と複製後は別イベントであり、両者が同一 Space・
    // 同一時間帯を同時に占有する状態そのものが不変条件違反のため、複製元自身のスロットも
    // 検査対象に含める (source.status が CANCELLED/ARCHIVED なら checkSpaceOverlap 側の
    // ACTIVE_EVENT_STATUSES 判定で自動的に対象外になる)。
    if (source.spaceId) {
      await lockSpaceForTransaction(tx, source.spaceId);
      for (const slot of source.slots) {
        const overlap = await checkSpaceOverlap(
          {
            spaceId: source.spaceId,
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
        categoryId: source.categoryId,
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
  }, RESERVATION_WRITE_TX_OPTIONS);

  return created;
}
