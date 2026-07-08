import "server-only";

import { prisma } from "@/shared/db/prisma";
import { EventStatus, RegistrationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { isFeatureEnabled } from "@/shared/lib/features/check";

export async function createEventRegistrationCommand(data: {
  eventId: string;
  slotId: string;
  ticketId: string;
  name: string;
  // 公開申込ではフォーム側 Zod で必須化済。walk-in 用には createWalkInRegistrationCommand を使う
  email: string;
  phone?: string | null;
  note?: string | null;
  quantity: number;
  customerId?: string | null;
}) {
  // Global gate: featureModules.events で OFF なら拒否。
  // page.tsx の requireFeatureEnabled は Server Action の直接呼び出しを防げないため、
  // 書込の実効性は domain 層のこのチェックが担保する（reviews/commands.ts と同型）。
  if (!(await isFeatureEnabled("events"))) {
    throw new DomainError(
      "イベント機能は現在サイト全体で無効化されています",
      "VALIDATION",
    );
  }

  // 定員集計〜create を 1 つの interactive transaction に閉じ、先頭で event 単位の
  // advisory xact ロックを取って同一イベントの登録を直列化する。これがないと最後の
  // 数枠に同時申込が殺到したとき、複数リクエストが同じ残枠を読んで全部チェックを
  // 通過し CONFIRMED 行を作成 → capacity 超過（overbooking）する TOCTOU 競合になる。
  // xact スコープのロックは commit / rollback で自動解放されるため例外安全。
  return prisma.$transaction(
    async (tx) => {
      // 名前空間 728350 は calendar-sync の advisory lock 728349
      // (src/shared/domain/calendar-sync/locks.ts) と衝突しない値を採番。
      // hashtext(eventId) でイベント単位の粒度にする（int4 × int4 の 2 引数形式）。
      // pg_advisory_xact_lock は void を返すため、結果セットを読まない $executeRaw を
      // 使う（$queryRaw は void 列の deserialize に失敗する）。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728350::int4, hashtext(${data.eventId}))`;

      const event = await tx.event.findFirst({
        where: {
          id: data.eventId,
          deletedAt: null,
          status: EventStatus.PUBLISHED,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          registrationOpen: true,
          registrationDeadline: true,
        },
      });

      if (!event)
        throw new DomainError("イベントが見つかりません", "NOT_FOUND");
      if (!event.registrationOpen)
        throw new DomainError(
          "このイベントは申込受付を終了しています",
          "VALIDATION",
        );

      // スロット取得 + eventId 整合性確認（CORR-8: FK のみでは eventId 不一致を防げない）
      const slot = await tx.eventTimeSlot.findUnique({
        where: { id: data.slotId },
        select: { id: true, eventId: true, capacity: true, startAt: true },
      });
      if (!slot || slot.eventId !== data.eventId)
        throw new DomainError(
          "指定されたタイムスロットが見つかりません",
          "NOT_FOUND",
        );

      // 申込締切：未設定ならスロット開始時刻、設定があればその時刻まで受付
      const deadline = event.registrationDeadline ?? slot.startAt;
      if (Date.now() > deadline.getTime())
        throw new DomainError(
          "申込締切を過ぎたため受け付けできません",
          "VALIDATION",
        );

      // チケットがイベントに属するか確認（per-ticket capacity も取得）
      const ticket = await tx.eventTicket.findFirst({
        where: { id: data.ticketId, eventId: data.eventId, isAvailable: true },
        select: { id: true, name: true, capacity: true },
      });
      if (!ticket)
        throw new DomainError(
          "指定されたチケット種別が見つかりません",
          "NOT_FOUND",
        );

      // 残枠集計は CONFIRMED 申込の quantity 合計で判定（公開ページ表示と同一基準）。
      // interactive transaction の単一コネクションは並行クエリ不可（"client is already
      // executing a query"）のため、各 aggregate は逐次 await する（Promise.all では serial）。
      const slotConfirmed = await tx.eventRegistration.aggregate({
        where: { slotId: data.slotId, status: RegistrationStatus.CONFIRMED },
        _sum: { quantity: true },
      });

      const slotRemaining = slot.capacity - (slotConfirmed._sum.quantity ?? 0);
      if (data.quantity > slotRemaining) {
        throw new DomainError(
          slotRemaining <= 0
            ? "このタイムスロットは満員です"
            : `このスロットは残り${String(slotRemaining)}枠です。参加人数を${String(slotRemaining)}名以下にしてください`,
          "VALIDATION",
        );
      }

      const ticketConfirmed =
        ticket.capacity != null
          ? await tx.eventRegistration.aggregate({
              where: {
                eventId: event.id,
                ticketId: ticket.id,
                slotId: data.slotId,
                status: RegistrationStatus.CONFIRMED,
              },
              _sum: { quantity: true },
            })
          : null;

      if (ticket.capacity != null && ticketConfirmed) {
        const remaining =
          ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
        if (data.quantity > remaining) {
          throw new DomainError(
            remaining <= 0
              ? `「${ticket.name}」は満員です`
              : `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
            "VALIDATION",
          );
        }
      }

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: data.eventId,
          slotId: data.slotId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId: data.customerId ?? null,
        },
        select: {
          id: true,
          eventId: true,
          slotId: true,
          ticketId: true,
          name: true,
          email: true,
          quantity: true,
          icsSequence: true,
        },
      });

      return { registration, event: { title: event.title, slug: event.slug } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

export async function cancelEventRegistrationCommand(
  registrationId: string,
  customerId?: string,
) {
  const registration = await prisma.eventRegistration.findFirst({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      event: { deletedAt: null },
      ...(customerId ? { customerId } : {}),
    },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      quantity: true,
      event: { select: { title: true, slug: true } },
    },
  });

  if (!registration) throw new DomainError("申込が見つかりません", "NOT_FOUND");

  const updated = await prisma.eventRegistration.update({
    where: { id: registrationId },
    data: {
      status: RegistrationStatus.CANCELLED,
      cancelledAt: new Date(),
      icsSequence: { increment: 1 },
    },
    select: { icsSequence: true },
  });

  return { ...registration, icsSequence: updated.icsSequence };
}

/**
 * 当日受付 (check-in) の出席フラグを toggle する。
 *
 * - `attended: true`  → attendedAt を現在時刻にセット (既に出席済なら no-op で既存値を返す)
 * - `attended: false` → attendedAt を null に戻す (誤打刻取消)
 *
 * 二重押し / 多端末からの並列実行は last-write-wins。check-in には capacity 制約が
 * 無いため advisory lock は不要。CANCELLED 済の申込には適用できない。
 */
export async function setEventRegistrationCheckInCommand(params: {
  eventId: string;
  registrationId: string;
  attended: boolean;
}) {
  const existing = await prisma.eventRegistration.findFirst({
    where: {
      id: params.registrationId,
      eventId: params.eventId,
      event: { deletedAt: null },
    },
    select: {
      id: true,
      eventId: true,
      attendedAt: true,
      status: true,
    },
  });
  if (!existing) throw new DomainError("申込が見つかりません", "NOT_FOUND");
  if (existing.status === RegistrationStatus.CANCELLED) {
    throw new DomainError(
      "キャンセル済の申込は出席登録できません",
      "VALIDATION",
    );
  }

  const nextAttendedAt = params.attended ? new Date() : null;

  // 状態変化なしは no-op (DB 書き込み回避、監査ログ汚染防止)
  if (
    (existing.attendedAt === null && nextAttendedAt === null) ||
    (existing.attendedAt !== null && nextAttendedAt !== null)
  ) {
    return {
      registrationId: existing.id,
      eventId: existing.eventId,
      before: existing.attendedAt,
      after: existing.attendedAt,
      changed: false,
    };
  }

  const updated = await prisma.eventRegistration.update({
    where: { id: existing.id },
    data: { attendedAt: nextAttendedAt },
    select: { attendedAt: true },
  });

  return {
    registrationId: existing.id,
    eventId: existing.eventId,
    before: existing.attendedAt,
    after: updated.attendedAt,
    changed: true,
  };
}

/**
 * 当日参加 (walk-in) の新規申込を作成し、同一トランザクション内で attendedAt も
 * セットして即出席扱いにする。
 *
 * - 定員 TOCTOU は createEventRegistrationCommand と同じ pg_advisory_xact_lock で防止
 * - customerId は null 固定 (会員紐付け UI は Phase 1 では持たない)
 * - email は任意 (受付係が代行入力する省略可) — null も許容
 * - 確認メールは送信しない (呼出側 Server Action で常時 suppress)
 */
export async function createWalkInRegistrationCommand(data: {
  eventId: string;
  slotId: string;
  ticketId: string;
  name: string;
  email: string | null;
  phone?: string | null;
  note?: string | null;
  quantity: number;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728350::int4, hashtext(${data.eventId}))`;

      const event = await tx.event.findFirst({
        where: {
          id: data.eventId,
          deletedAt: null,
          status: EventStatus.PUBLISHED,
        },
        select: { id: true, title: true, slug: true },
      });
      if (!event)
        throw new DomainError("イベントが見つかりません", "NOT_FOUND");

      // スロット取得 + eventId 整合性確認
      const slot = await tx.eventTimeSlot.findUnique({
        where: { id: data.slotId },
        select: { id: true, eventId: true, capacity: true },
      });
      if (!slot || slot.eventId !== data.eventId) {
        throw new DomainError(
          "指定されたタイムスロットが見つかりません",
          "NOT_FOUND",
        );
      }

      const ticket = await tx.eventTicket.findFirst({
        where: { id: data.ticketId, eventId: data.eventId, isAvailable: true },
        select: { id: true, name: true, capacity: true },
      });
      if (!ticket) {
        throw new DomainError(
          "指定されたチケット種別が見つかりません",
          "NOT_FOUND",
        );
      }

      const slotConfirmed = await tx.eventRegistration.aggregate({
        where: { slotId: data.slotId, status: RegistrationStatus.CONFIRMED },
        _sum: { quantity: true },
      });

      const slotRemaining = slot.capacity - (slotConfirmed._sum.quantity ?? 0);
      if (data.quantity > slotRemaining) {
        throw new DomainError(
          slotRemaining <= 0
            ? "このタイムスロットは満員です"
            : `このスロットは残り${String(slotRemaining)}枠です。参加人数を${String(slotRemaining)}名以下にしてください`,
          "VALIDATION",
        );
      }

      const ticketConfirmed =
        ticket.capacity != null
          ? await tx.eventRegistration.aggregate({
              where: {
                eventId: event.id,
                ticketId: ticket.id,
                slotId: data.slotId,
                status: RegistrationStatus.CONFIRMED,
              },
              _sum: { quantity: true },
            })
          : null;

      if (ticket.capacity != null && ticketConfirmed) {
        const remaining =
          ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
        if (data.quantity > remaining) {
          throw new DomainError(
            remaining <= 0
              ? `「${ticket.name}」は満員です`
              : `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
            "VALIDATION",
          );
        }
      }

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: data.eventId,
          slotId: data.slotId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId: null,
          attendedAt: new Date(),
        },
        select: {
          id: true,
          eventId: true,
          slotId: true,
          name: true,
          quantity: true,
          attendedAt: true,
        },
      });

      return { registration, event: { title: event.title, slug: event.slug } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

/**
 * イベント参加者リマインダー送信の atomic claim。
 *
 * Reservation.reminderSentAt と同型のパターン: Cloud Scheduler の at-least-once
 * 配信による二重起動を、`updateMany({ where: { reminderSentAt: null } })` の
 * WHERE 条件自体で claim することで防ぐ（PostgreSQL の単一 UPDATE は atomic）。
 * `status: CONFIRMED` も条件に含め、cron 実行中にキャンセルされた申込への
 * 誤 claim を防ぐ。
 *
 * @returns claim 成功時のみ `true`。
 */
export async function claimEventRegistrationReminder(
  registrationId: string,
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      reminderSentAt: null,
    },
    data: { reminderSentAt: new Date() },
  });
  return result.count > 0;
}

/**
 * リマインダー送信失敗時に {@link claimEventRegistrationReminder} の claim を解放する
 * （`reminderSentAt` を null に戻す）。次回 cron 実行で再送対象に戻す。
 */
export async function releaseEventRegistrationReminderClaim(
  registrationId: string,
): Promise<void> {
  await prisma.eventRegistration.updateMany({
    where: { id: registrationId },
    data: { reminderSentAt: null },
  });
}
