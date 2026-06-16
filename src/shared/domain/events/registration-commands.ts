import "server-only";

import { prisma } from "@/shared/db/prisma";
import { EventStatus, RegistrationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";

export async function createEventRegistrationCommand(data: {
  eventId: string;
  ticketId: string;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  quantity: number;
  customerId?: string | null;
}) {
  // 定員集計〜create を 1 つの interactive transaction に閉じ、先頭で event 単位の
  // advisory xact ロックを取って同一イベントの登録を直列化する。これがないと最後の
  // 数枠に同時申込が殺到したとき、複数リクエストが同じ残枠を読んで全部チェックを
  // 通過し CONFIRMED 行を作成 → capacity 超過（overbooking）する TOCTOU 競合になる。
  // xact スコープのロックは commit / rollback で自動解放されるため例外安全。
  return prisma.$transaction(async (tx) => {
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
        capacity: true,
        registrationOpen: true,
        registrationDeadline: true,
        startTime: true,
      },
    });

    if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
    if (!event.registrationOpen)
      throw new DomainError(
        "このイベントは申込受付を終了しています",
        "VALIDATION",
      );

    // 申込締切：未設定なら開始時刻、設定があればその時刻まで受付
    const deadline = event.registrationDeadline ?? event.startTime;
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
    // executing a query"）のため、2 本の aggregate は Promise.all せず逐次 await する。
    const eventConfirmed =
      event.capacity != null
        ? await tx.eventRegistration.aggregate({
            where: { eventId: event.id, status: RegistrationStatus.CONFIRMED },
            _sum: { quantity: true },
          })
        : null;

    const ticketConfirmed =
      ticket.capacity != null
        ? await tx.eventRegistration.aggregate({
            where: {
              eventId: event.id,
              ticketId: ticket.id,
              status: RegistrationStatus.CONFIRMED,
            },
            _sum: { quantity: true },
          })
        : null;

    if (event.capacity != null && eventConfirmed) {
      const remaining = event.capacity - (eventConfirmed._sum.quantity ?? 0);
      if (data.quantity > remaining) {
        throw new DomainError(
          remaining <= 0
            ? "このイベントは満員です"
            : `残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
          "VALIDATION",
        );
      }
    }

    if (ticket.capacity != null && ticketConfirmed) {
      const remaining = ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
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
        ticketId: true,
        name: true,
        email: true,
        quantity: true,
        icsSequence: true,
      },
    });

    return { registration, event: { title: event.title, slug: event.slug } };
  });
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
