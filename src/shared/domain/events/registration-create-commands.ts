import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  EventStatus,
  RegistrationStatus,
  TERMS_SCOPE,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { recordTermsAgreements } from "@/shared/domain/terms/commands";
import { lockEventRegistrationForTransaction } from "./waitlist-locks";
import { EventRegistrationSource } from "@/shared/lib/validations/enums/prisma-types";

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
  /**
   * 同意済み規約 ID。申込作成と同一 tx 内で TermsAgreement を記録する
   * （reservation / series 経路の `recordTermsAgreements` と同契約）。
   */
  agreedTermsIds?: readonly string[] | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
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
      await lockEventRegistrationForTransaction(tx, data.eventId);

      await ensureCustomerNotBlacklisted(
        { customerId: data.customerId ?? null, email: data.email },
        tx,
      );

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
          // 公開申込フォーム経由。Stripe checkout を前提とするので未決済
          // fail-safe cron の対象になる（`unpaid-expiry.ts`）。
          source: EventRegistrationSource.ONLINE,
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

      // TermsAgreement は申込行と同じ tx で記録する（失敗時は申込ごと rollback）。
      if (data.agreedTermsIds && data.agreedTermsIds.length > 0) {
        await recordTermsAgreements({
          scope: TERMS_SCOPE.EVENT_REGISTRATION,
          agreements: data.agreedTermsIds.map((termsId) => ({ termsId })),
          resourceId: registration.id,
          customerId: data.customerId ?? null,
          guestEmail: data.customerId ? null : data.email,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          tx,
        });
      }

      return { registration, event: { title: event.title, slug: event.slug } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
